// backend/server.js
// First-time setup: npm install
// Run: npm start   (or: node server.js)
//
// This server exposes the REST API used by the Vue.js frontend:
//   GET  /api/checklist?date=YYYY-MM-DD   -> load that day's rows
//   POST /api/checklist                    -> save rows + send email alerts for faults
//   GET  /api/dates                        -> list dates that have saved data
//
// In development, run the Vue frontend separately with "npm run dev" inside /frontend
// (it proxies /api requests to this server — see frontend/vite.config.js).
//
// In production, run "npm run build" inside /frontend, then this server will
// automatically serve the built frontend/dist folder too, so you only need
// this one server running.

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.warn('⚠️  "nodemailer" is not installed — run "npm install" first to enable email alerts.');
}
const crypto = require('crypto');
const { checkLogin, getSites, insertAuditLog, getPool, createSite, updateSite, deleteSite } = require('./db');

// Very simple in-memory session store: token -> { username, displayName, expiresAt }
// Fine for a small internal tool with one backend process. Tokens are lost on restart
// (everyone just logs in again), and expire after 8 hours.
const SESSIONS = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  SESSIONS.set(token, { ...user, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const session = SESSIONS.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    SESSIONS.delete(token);
    return null;
  }
  return session;
}

function getBearerToken(req) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function getClientIp(req) {
  // Respects a reverse proxy's X-Forwarded-For if present, else the raw socket address.
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket && req.socket.remoteAddress;
}

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TEMPLATE_FILE = path.join(__dirname, 'default-rows.json');
const LOCAL_USERS_FILE = path.join(__dirname, 'local-users.json');
const SIM_DATA_DIR = path.join(__dirname, 'data-sim');
if (!fs.existsSync(SIM_DATA_DIR)) fs.mkdirSync(SIM_DATA_DIR, { recursive: true });

const CONFIG_FILE = path.join(__dirname, 'config.json');
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Only the "disconnect" checkbox of each group counts as a fault.
// Each of the 4 groups has its own independent connect/disconnect
// checkbox (not a radio button) — matching the paper checklist sheet.
const FIELD_LABELS = {
  camConectDisconnect: 'Cam_conect: Disconnect',
  camWorkDisconnect: 'Cam_work: Disconnect',
  drvConectDisconnect: 'DRV_conect: Disconnect',
  camSaveDisconnect: 'Cam_save: Disconnect',
};

const SIM_FIELD_LABELS = {
  connStatusDisconnect: 'Connection Status: Disconnect',
  alarmOn: 'Alarm: On',
  connectTypeGprs: 'Connect Type: GPRS',
  statusLost: 'Status: Disconnect',
};

const CHECKBOX_FIELDS = [
  'camConectConnect', 'camConectDisconnect',
  'camWorkConnect', 'camWorkDisconnect',
  'drvConectConnect', 'drvConectDisconnect',
  'camSaveConnect', 'camSaveDisconnect',
];

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  }
  return null;
}

function getTransporter() {
  if (!nodemailer) return null;
  const cfg = loadConfig();
  if (!cfg || !cfg.smtp || !cfg.smtp.host || !cfg.smtp.user) return null;
  return nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: !!cfg.smtp.secure,
    auth: { user: cfg.smtp.user, pass: cfg.smtp.pass },
  });
}

function sendJSON(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function isValidDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function dataFilePath(date) {
  return path.join(DATA_DIR, `${date}.json`);
}

// The ATM/branch site list (ATMID, location, IPs, email) — pulled fresh from
// the "atm_sites" MySQL table each time, so adding/removing branches there
// shows up immediately. Falls back to default-rows.json if the database
// isn't configured or the query fails, so the app still works without MySQL.
async function getBaseRows() {
  try {
    const sites = await getSites();
    if (sites && sites.length > 0) return sites;
  } catch (e) {
    console.warn('⚠️  Could not load ATM sites from the database, falling back to default-rows.json:', e.message);
  }
  if (fs.existsSync(TEMPLATE_FILE)) {
    return JSON.parse(fs.readFileSync(TEMPLATE_FILE, 'utf-8'));
  }
  return [];
}

async function getSimBaseRows() {
  const sites = await getBaseRows();
  return sites.map((s) => ({
    atmid: s.atmid,
    adress: s.adress,
    ip: s.ip || '',
    email: s.email || '',
  }));
}

function getFailedItems(row) {
  // Fault = the "disconnect" box is checked (true) for that group.
  return Object.keys(FIELD_LABELS)
    .filter((key) => row[key] === true)
    .map((key) => FIELD_LABELS[key]);

}

function getSimFailedItems(row) {
  return Object.keys(SIM_FIELD_LABELS)
    .filter((key) => row[key] === true)
    .map((key) => SIM_FIELD_LABELS[key]);
}
async function checkLoginWithFallback(username,password){
  try{
    const user = await checkLogin(username,password);
    if(user) return user;
    const pool = await getPool();
    if (pool) return null;
  }catch(e){
    console.warn("oracle login check failed,falling back to local-user.json:",e.message);
  }
  if(!fs.existsSync(LOCAL_USERS_FILE)) return null;
  const users = JSON.parse(fs.readFileSync(LOCAL_USERS_FILE,'utf-8'));
  const match = users.find((u) => u.username === username && u.password === password);
  if(!match) return null;
  return{username:match.username,displayName:match.displayName || match.username};
}
//===========ATM master data CRUD(oracle first,locfile fallbacl)=====================
function readLocalSites(){
  if(!fs.existsSync(TEMPLATE_FILE)) return[];
  return JSON.parse(fs.readFileSync(TEMPLATE_FILE,'utf-8'));
}

function writeLocalSites(sites){
  fs.writeFileSync(TEMPLATE_FILE,JSON.stringify(sites,null,2),'utf-8');
}


async function sendAlertEmails(date, rows) {
  const transporter = getTransporter();
  const cfg = loadConfig();
  const results = [];

  const rowsWithErrors = rows.filter((r) => getFailedItems(r).length > 0);

  if (rowsWithErrors.length === 0) {
    return { sent: 0, skipped: 0, results, note: 'No faults found — nothing to report.' };
  }

  if (!transporter) {
    return {
      sent: 0,
      skipped: rowsWithErrors.length,
      results,
      note: 'SMTP is not configured in config.json (or "npm install" was not run), so alert emails could NOT be sent even though faults were found.',
    };
  }

  for (const row of rowsWithErrors) {
    const failed = getFailedItems(row);
    if (!row.email) {
      results.push({ atmid: row.atmid, location: row.adress, ok: false, reason: 'no email address on file' });
      continue;
    }
    const subject = `[ALERT] Camera/ATM fault - ${row.adress} (${row.atmid}) - ${date}`;
    const html = `
      <p>Dear <b>${row.adress}</b> team,</p>
      <p>The start-of-day inspection on <b>${date}</b> found the following fault(s) at <b>${row.adress}</b> (ATMID: ${row.atmid}):</p>
      <ul>${failed.map((f) => `<li style="color:#d93025;">❌ ${f}</li>`).join('')}</ul>
      <p>IP_CAM: ${row.ipCam || '-'}<br/>Video_IP: ${row.videoIp || '-'}</p>
      <p>Please check and resolve as soon as possible.</p>
      <p style="color:#888;font-size:12px;">This email was sent automatically by the Start-of-Day Inspection system.</p>
    `;
    try {
      await transporter.sendMail({
        from: cfg.from || cfg.smtp.user,
        to: row.email,
        cc: (cfg.ccTo || []).join(',') || undefined,
        subject,
        html,
      });
      results.push({ atmid: row.atmid, location: row.adress, ok: true, to: row.email });
    } catch (e) {
      results.push({ atmid: row.atmid, location: row.adress, ok: false, reason: String(e.message || e) });
    }
  }

  return {
    sent: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => !r.ok).length,
    results,
  };
}

async function sendSimAlertEmails(date, rows) {
  const transporter = getTransporter();
  const cfg = loadConfig();
  const results = [];

  const rowsWithErrors = rows.filter((r) => getSimFailedItems(r).length > 0);

  if (rowsWithErrors.length === 0) {
    return { sent: 0, skipped: 0, results, note: 'No faults found — nothing to report.' };
  }

  if (!transporter) {
    return {
      sent: 0,
      skipped: rowsWithErrors.length,
      results,
      note: 'SMTP is not configured in config.json (or "npm install" was not run), so alert emails could NOT be sent even though faults were found.',
    };
  }

  for (const row of rowsWithErrors) {
    const failed = getSimFailedItems(row);
    if (!row.email) {
      results.push({ atmid: row.atmid, location: row.adress, ok: false, reason: 'no email address on file' });
      continue;
    }
    const subject = `[ALERT] SIM/Alarm fault - ${row.adress} (${row.atmid}) - ${date}`;
    const html = `
      <p>Dear <b>${row.adress}</b> team,</p>
      <p>The SIM/Alarm check on <b>${date}</b> found the following fault(s) at <b>${row.adress}</b> (ATMID: ${row.atmid}):</p>
      <ul>${failed.map((f) => `<li style="color:#d93025;">❌ ${f}</li>`).join('')}</ul>
      <p>Alarm IP: ${row.ip || '-'}</p>
      <p>Please check and resolve as soon as possible.</p>
      <p style="color:#888;font-size:12px;">This email was sent automatically by the SIM/Alarm Check system.</p>
    `;
    try {
      await transporter.sendMail({
        from: cfg.from || cfg.smtp.user,
        to: row.email,
        cc: (cfg.ccTo || []).join(',') || undefined,
        subject,
        html,
      });
      results.push({ atmid: row.atmid, location: row.adress, ok: true, to: row.email });
    } catch (e) {
      results.push({ atmid: row.atmid, location: row.adress, ok: false, reason: String(e.message || e) });
    }
  }

  return {
    sent: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => !r.ok).length,
    results,
  };
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


function buildReportHtml(date,rows,savedAt){
  const box = (v) =>  `<span class="box${v ? ' on' : ''}"></span>`;
  const isFault = (r) => Object.keys(FIELD_LABELS).some((k) =>r[k] === true);

  const body = rows
    .map(
      (r, i) => `
    <tr class="${isFault(r) ? 'fault' : ''}">
      <td>${i + 1}</td>
      <td>${escapeHtml(r.atmid)}</td>
      <td class="left">${escapeHtml(r.adress)}</td>
      <td>${escapeHtml(r.ipCam)}</td>
      <td>${escapeHtml(r.videoIp)}</td>
      <td>${box(r.camConectConnect)}</td><td>${box(r.camConectDisconnect)}</td>
      <td>${box(r.camWorkConnect)}</td><td>${box(r.camWorkDisconnect)}</td>
      <td>${box(r.drvConectConnect)}</td><td>${box(r.drvConectDisconnect)}</td>
      <td>${box(r.camSaveConnect)}</td><td>${box(r.camSaveDisconnect)}</td>
    </tr>`
    )
    .join('');


faultCount = rows.filter(isFault).length

return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  body { font-family: 'Segoe UI', 'Leelawadee UI', Arial, sans-serif; font-size: 9px; color: #222; }
  h1{font-size:16px;margin: 0 0 4px; }
  .meta { margin-bottom: 8px; color: #555; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #888; padding: 2px 3px; text-align: center; }
  th { background: #e9edf5; }
  td.left { text-align: left; }
    tr.fault td { background: #e7e1e1; }
  .box { display: inline-block; position: relative; width: 11px; height: 11px; border: 1px solid #333; vertical-align: middle; }
  .box.on::after {
    content: ''; position: absolute; left: 3px; top: -1px;
    width: 3px; height: 7px;
    border: solid #111; border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
</style></head>
</style>

<body>
<h1>Daily ATM Check</h1>
<div class ='meta'>
  Inspection date:<b>${escapeHtml(date)}</b> &nbsp;|&nbsp;
  Saved at: ${escapeHtml(savedAt || '-')} &nbsp;|&nbsp;
  Sites: ${rows.length} &nbsp;|&nbsp; Faults: <b>${faultCount}</b>

</div>
<table>
    <thead>
      <tr>
        <th rowspan="2">ST</th><th rowspan="2">ATMID</th><th rowspan="2">Adress</th>
        <th rowspan="2">IP_CAM</th><th rowspan="2">Video_IP</th>
        <th colspan="2">Cam_conect</th><th colspan="2">Cam_work</th>
        <th colspan="2">DRV_conect</th><th colspan="2">Cam_save</th>
      </tr>
      <tr>
        <th>connect</th><th>disconnect</th><th>connect</th><th>disconnect</th>
        <th>connect</th><th>disconnect</th><th>connect</th><th>disconnect</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</body></html>`;
}

function buildSimReportHtml(date,rows,savedAt){
  const box = (v) =>  `<span class="box${v ? ' on' : ''}"></span>`;
  const SIM_FAULT_FIELDS = ['connStatusDisconnect','alarmOn','connectTypeGprs','statusLost'];
  const isFault = (r) => SIM_FAULT_FIELDS.some((k) => r[k] === true);

  const body = rows
    .map(
      (r, i) => `
    <tr class="${isFault(r) ? 'fault' : ''}">
      <td>${i + 1}</td>
      <td>${escapeHtml(r.atmid)}</td>
      <td class="left">${escapeHtml(r.adress)}</td>
      <td>${escapeHtml(r.ip)}</td>
      <td>${box(r.connStatusConnect)}</td><td>${box(r.connStatusDisconnect)}</td>
      <td>${box(r.alarmOff)}</td><td>${box(r.alarmOn)}</td>
      <td>${box(r.connectTypeWan)}</td><td>${box(r.connectTypeGprs)}</td>
      <td>${box(r.statusConnect)}</td><td>${box(r.statusLost)}</td>
    </tr>`
    )
    .join('');

  const faultCount = rows.filter(isFault).length;

return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  body { font-family: 'Segoe UI', 'Leelawadee UI', Arial, sans-serif; font-size: 9px; color: #222; }
  h1{font-size:16px;margin: 0 0 4px; }
  .meta { margin-bottom: 8px; color: #555; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #888; padding: 2px 3px; text-align: center; }
  th { background: #e9edf5; }
  td.left { text-align: left; }
    tr.fault td { background: #e7e1e1; }
  .box { display: inline-block; position: relative; width: 11px; height: 11px; border: 1px solid #333; vertical-align: middle; }
  .box.on::after {
    content: ''; position: absolute; left: 3px; top: -1px;
    width: 3px; height: 7px;
    border: solid #111; border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
</style></head>

<body>
<h1>SIM / Alarm Check</h1>
<div class ='meta'>
  Inspection date:<b>${escapeHtml(date)}</b> &nbsp;|&nbsp;
  Saved at: ${escapeHtml(savedAt || '-')} &nbsp;|&nbsp;
  Sites: ${rows.length} &nbsp;|&nbsp; Faults: <b>${faultCount}</b>

</div>
<table>
    <thead>
      <tr>
        <th rowspan="2">ST</th><th rowspan="2">ATMID</th><th rowspan="2">Adress</th>
        <th rowspan="2">Alarm IP</th>
        <th colspan="2">Connection Status</th><th colspan="2">Alarm</th>
        <th colspan="2">Connect Type</th><th colspan="2">Status</th>
      </tr>
      <tr>
        <th>connect</th><th>disconnect</th><th>off</th><th>on</th>
        <th>WAN</th><th>GPRS</th><th>connect</th><th>disconnect</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</body></html>`;
}

async function renderPdf(html) {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4',
      landscape: false,
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
    });
  } finally {
    await browser.close();
  }
}


function serveStatic(req, res, pathname) {
  if (!fs.existsSync(FRONTEND_DIST)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(
      'Frontend build not found. In development, run the Vue app separately with "npm run dev" inside /frontend.\n' +
      'For production, run "npm run build" inside /frontend first.'
    );
  }
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(FRONTEND_DIST, filePath);
  if (!filePath.startsWith(FRONTEND_DIST)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      // SPA fallback -> index.html
      return fs.readFile(path.join(FRONTEND_DIST, 'index.html'), (err2, indexContent) => {
        if (err2) {
          res.writeHead(404);
          return res.end('404 Not Found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexContent);
      });
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  // ---------- Auth ----------
  if (pathname === '/api/auth-config' && req.method === 'GET') {
    const cfg = loadConfig();
    const requireLogin = !!(cfg && cfg.requireLogin);
    return sendJSON(res, 200, { requireLogin });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { username, password } = body;
      if (!username || !password) {
        return sendJSON(res, 400, { error: 'username and password are required' });
      }
      let user;
      try {
        user = await checkLoginWithFallback(username, password);
      } catch (e) {
        return sendJSON(res, 500, { error: String(e.message || e) });
      }
      if (!user) {
        return sendJSON(res, 401, { error: 'Invalid username or password' });
      }
      const token = createSession(user);
      insertAuditLog({ userId: user.username, actionType: 'LOGIN', targetRef: null, ipAddress: getClientIp(req) });
      return sendJSON(res, 200, { ok: true, token, user });
    } catch (e) {
      return sendJSON(res, 400, { error: 'bad request', detail: String(e) });
    }
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    const session = getSession(getBearerToken(req));
    if (!session) return sendJSON(res, 401, { error: 'not logged in' });
    return sendJSON(res, 200, { username: session.username, displayName: session.displayName });
  }


  // Everything under /api/checklist and /api/dates requires a valid login,
  // UNLESS "requireLogin": false in config.json (useful while you're still
  // setting up MySQL / the users table and just want the checklist working).
  if (pathname.startsWith('/api/checklist') || pathname.startsWith('/api/dates') || pathname.startsWith('/api/atms')|| pathname.startsWith('/api/simcheck')) {
    const cfg = loadConfig();
    const requireLogin = !!(cfg && cfg.requireLogin);
    if (requireLogin) {
      const session = getSession(getBearerToken(req));
      if (!session) {
        return sendJSON(res, 401, { error: 'not logged in' });
      }
    }
  }

  // ---------- API ----------
  if (pathname === '/api/checklist' && req.method === 'GET') {
    const date = parsed.query.date;
    if (!isValidDate(date)) return sendJSON(res, 400, { error: 'invalid date' });

    const baseRows = await getBaseRows();

    const file = dataFilePath(date);
    let statusByAtmid = {};
    let saved = false;
    let savedAt = null;
    if (fs.existsSync(file)) {
      const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
      saved = true;
      savedAt = content.savedAt;
      (content.rows || []).forEach((r) => {
        statusByAtmid[r.atmid] = r;
      });
    }

    const DEFAULT_CHECKED = { 
      camConectConnect: true,
        camWorkConnect: true,
        drvConectConnect: true,
        camSaveConnect: true,
    };

    const rows = baseRows.map((site) => {
      const prev = statusByAtmid[site.atmid];
      const row = { ...site };
      // Default every checkbox to unchecked (blank), matching a fresh
      // paper checklist — the inspector ticks what they actually see.
      CHECKBOX_FIELDS.forEach((key) => {
        row[key] = prev ? !!prev[key] : !!DEFAULT_CHECKED[key];
      });
      return row;
    });

    return sendJSON(res, 200, { date, rows, saved, savedAt });
  }

  if (pathname === '/api/checklist' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { date, rows } = body;
      if (!isValidDate(date) || !Array.isArray(rows)) {
        return sendJSON(res, 400, { error: 'invalid payload' });
      }
      const payload = { date, rows, savedAt: new Date().toISOString() };
      fs.writeFileSync(dataFilePath(date), JSON.stringify(payload, null, 2), 'utf-8');

      const session = getSession(getBearerToken(req));
      insertAuditLog({
        userId: session ? session.username : 'guest',
        actionType: 'SUBMIT_INSPECTION',
        targetRef: date,
        ipAddress: getClientIp(req),
      });

      const emailResult = await sendAlertEmails(date, rows);

      return sendJSON(res, 200, { ok: true, savedAt: payload.savedAt, email: emailResult });
    } catch (e) {
      return sendJSON(res, 400, { error: 'bad request', detail: String(e) });
    }
  }

 if (pathname === '/api/simcheck' && req.method === 'GET') {
  const date = parsed.query.date;
  const baseRows = await getSimBaseRows();
  const simFile = path.join(SIM_DATA_DIR, `${date}.json`);
  let saved = null;
  if (fs.existsSync(simFile)) saved = JSON.parse(fs.readFileSync(simFile, 'utf-8'));
  const DEFAULT_CHECKED = { connStatusConnect: true, alarmOff: true, connectTypeWan: true, statusConnect: true };
  const rows = baseRows.map((base) => {
    const prev = saved && saved.rows ? saved.rows.find((r) => r.atmid === base.atmid) : null;
    const row = { ...base };
    ['connStatusConnect', 'connStatusDisconnect', 'alarmOff', 'alarmOn', 'connectTypeWan', 'connectTypeGprs', 'statusConnect', 'statusLost'].forEach((key) => {
      row[key] = prev ? !!prev[key] : !!DEFAULT_CHECKED[key];
    });
    return row;
  });
  sendJSON(res, 200, { rows, savedAt: saved ? saved.savedAt : null });
  return;
}

if (pathname === '/api/simcheck' && req.method === 'POST') {
  const body = await readBody(req);
  if (!isValidDate(body.date) || !Array.isArray(body.rows)) {
    return sendJSON(res, 400, { ok: false, error: 'invalid payload' });
  }
  const savedAt = new Date().toLocaleString();
  const simFile = path.join(SIM_DATA_DIR, `${body.date}.json`);
  fs.writeFileSync(simFile, JSON.stringify({ rows: body.rows, savedAt }, null, 2), 'utf-8');
  insertAuditLog({
    userId: getSession(getBearerToken(req))?.username || 'unknown',
    actionType: 'SUBMIT_SIM_INSPECTION',
    targetRef: body.date,
    ipAddress: getClientIp(req),
  });

  const emailResult = await sendSimAlertEmails(body.date, body.rows);

  sendJSON(res, 200, { ok: true, savedAt, email: emailResult });
  return;
}












  if (pathname === '/api/dates' && req.method === 'GET') {
    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
      .sort()
      .reverse();
    return sendJSON(res, 200, { dates: files });
  }

  if(pathname ==='/api/atms' && req.method === 'GET'){
    const rows = await getBaseRows();
    return sendJSON(res,200,{rows});
  }
  if(pathname ==='/api/atms'&& req.method === 'POST'){
    try{
      const body = await readBody(req);
      if(!body.atmid || !body.adress){
        return sendJSON(res,400,{error:'atmid and dress are required'});
      }
      const session = getSession(getBearerToken(req));
      try{
        await createSite(body);
      }catch(e){
        const sites = readLocalSites();
        if(sites.some((s) => s.atmid === body.atmid)) {
          return sendJSON(res,409,{error:'ATMID already exits'});
      }
      sites.push({
        atmid:body.atmid,
        adress:body.adress,
        ipCam:body.ipCam || '',
        videoIp:body.videoIp|| '',
        ip:body.ip|| '',
        email:body.email|| '',
      });
      writeLocalSites(sites);
    }

    insertAuditLog({
      userId:session? session.username:'guest',
      actionType:'CREATE_ATM',
      targetRef:body.atmid,
      ipAddress:getClientIp(req),
    });
    return sendJSON(res,200,{ok:true});
  } catch(e){
    return sendJSON(res,400,{error:'bad request',detail:String(e)});
  }
  }

  const atmMatch = pathname.match(/^\/api\/atms\/([^/]+)$/);
  if(atmMatch && req.method ==='PUT'){
    const atmid = decodeURIComponent(atmMatch[1]);
    try{
      const body = await readBody(req);
      const session = getSession(getBearerToken(req));
      try{
        await updateSite(atmid,body);
      }catch(e){
        const sites = readLocalSites();
        const idx = sites.findIndex((s) => s.atmid === atmid);
        if (idx===-1) return sendJSON(res,400,{error:'ATMID not found'});
        sites[idx] = {
          ...sites[idx],
          adress:body.adress??sites[idx].adress,
          ipCam:body.ipCam??sites[idx].ipCam,
          videoIp:body.videoIp??sites[idx].videoIp,
          ip:body.ip??sites[idx].ip,
          email:body.email??sites[idx].email,
        };
        writeLocalSites(sites);
      }
      insertAuditLog({
        userId:session? session.username:'guest',
        actionType:'UPDATE_ATM',
        targetRef:atmid,
        ipAddress:getClientIp(req),
      });
      return sendJSON(res,200,{ok:true});
    }catch(e){
      return sendJSON(res,400,{error:"bad request",detail:String(e)});
    }
  }

  if(atmMatch&&req.method === 'DELETE'){
    const atmid = decodeURIComponent(atmMatch[1]);
    const session = getSession(getBearerToken(req));


    try{
      await deleteSite(atmid);
    }catch(e){
      const sites = readLocalSites();
      const next = sites.filter((s) => s.atmid !== atmid);
      writeLocalSites(next);
    }
    insertAuditLog({
      userId:session? session.username:'guest',
      actionType:'DELETE_ATM',
      targetRef:atmid,
      ipAddress:getClientIp(req),
    });
    return sendJSON(res,200,{ok:true});
  }



  if (pathname === '/api/report/pdf' && req.method ==='GET'){
    const date = parsed.query.date;
    if(!isValidDate(date)) return sendJSON(res,400,{error:'invalid date'});

    const file = dataFilePath(date);
    if(!fs.existsSync(file)){
      return sendJSON(res,404,{
        error:'No saved checklist for this date.please press Save first'
      });
    }
    try{
    const content = JSON.parse(fs.readFileSync(file,'utf-8'));
    const pdf = await renderPdf(buildReportHtml(date,content.rows || [],
      content.savedAt));
      res.writeHead(200,{
        'Content-Type':'application/pdf',
        'Content-Disposition': `attachment; filename="atm-checklist-${date}.pdf"`,
      });
      return res.end(Buffer.from(pdf));
    }catch(e){
      console.error('❌ PDF error:', e);
      return sendJSON(res,500,{error:'failed to ceate PDF',detail:String(e)});

    }
  }

  if(pathname ==='/api/report/simpdf' && req.method === 'GET'){
    const date = parsed.query.date;
    if(!isValidDate(date)) return sendJSON(res,400,{error:'invalid date'});

    const simFile = path.join(SIM_DATA_DIR, `${date}.json`);
    if(!fs.existsSync(simFile)){
      return sendJSON(res,404,{
        error:'No saved SIM check for this date.Please press Save first'
      });
    }
    try{
      const content = JSON.parse(fs.readFileSync(simFile,'utf-8'));
      const pdf = await renderPdf(buildSimReportHtml(date,content.rows || [],content.savedAt));
      res.writeHead(200,{
         'Content-Type':'application/pdf',
        'Content-Disposition': `attachment; filename="sim-check-${date}.pdf"`,
      });
      return res.end(Buffer.from(pdf));
    }catch(e){
      console.error('❌ Sim PDF error:', e);
      return sendJSON(res,500,{error:'failed to create PDF',detail:String(e)});
    }
  }

  // ---------- Production: serve built Vue frontend (frontend/dist) ----------
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`✅ Backend API running at http://localhost:${PORT}`);
  if (!getTransporter()) {
    console.log('ℹ️  Email alerts are NOT active yet — configure config.json and run "npm install".');
  }
  if (!fs.existsSync(FRONTEND_DIST)) {
    console.log('ℹ️  No frontend build found. For development, run "npm run dev" inside /frontend (separate terminal).');
  }
});
