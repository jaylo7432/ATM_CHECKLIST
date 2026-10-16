// backend/db.js
// Oracle version — uses the official "oracledb" driver (thin mode: no Oracle
// Client needs to be installed for Oracle Database 12.1 or newer).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let oracledb;
try {
  oracledb = require('oracledb');
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT; // rows come back as {col: value} objects
} catch (e) {
  console.warn('⚠️  "oracledb" is not installed — run "npm install" to enable database login.');
}

const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  }
  return null;
}

let pool = null;
let poolFailure = null; // remembers the last connect error for a short while
const RETRY_AFTER_MS = 30 * 1000;

// Oracle connects with a single connect string: "host:port/service_name".
// If config.json still has the placeholder user ("your_oracle_user") the
// database is treated as "not configured" so the app keeps using the local
// files. After a failed connect we wait 30 seconds before trying again, so a
// wrong password does not get retried on every page load (Oracle locks an
// account after several wrong passwords).
async function getPool() {
  if (!oracledb) return null;
  const cfg = loadConfig();
  if (!cfg || !cfg.db || !cfg.db.connectString) return null;
  if (!cfg.db.user || cfg.db.user === 'your_oracle_user') return null;
  if (pool) return pool;
  if (poolFailure && Date.now() - poolFailure.at < RETRY_AFTER_MS) throw poolFailure.error;
  try {
    pool = await oracledb.createPool({
      user: cfg.db.user,
      password: cfg.db.password,
      connectString: cfg.db.connectString, // e.g. "myhost:1521/ORCLPDB1"
      poolMin: 1,
      poolMax: 5,
    });
    poolFailure = null;
  } catch (e) {
    poolFailure = { at: Date.now(), error: e };
    throw e;
  }
  return pool;
}

async function closePool() {
  if (pool) {
    await pool.close(0);
    pool = null;
  }
}

// Table / column names come from config.json ("db.sitesTable" and
// "db.sitesColumns"), so when the real table has different names you only
// edit config.json, not this file. Set a column to "" to say "my table
// does not have this column" (e.g. "ip": "").
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_$#.]*$/;
function getSitesTableConfig() {
  const cfg = loadConfig();
  const db = (cfg && cfg.db) || {};
  const table = db.sitesTable || 'atm_sites';
  const cols = Object.assign(
    { atmid: 'atmid', adress: 'adress', ipCam: 'ip_cam', videoIp: 'video_ip', ip: 'alarm_ip', email: 'email' },
    db.sitesColumns || {}
  );
  if (!SAFE_NAME.test(table)) throw new Error(`Invalid table name in config.json: ${table}`);
  for (const [key, name] of Object.entries(cols)) {
    if (name && !SAFE_NAME.test(name)) throw new Error(`Invalid column name in config.json (${key}): ${name}`);
  }
  return { table, cols };
}

// Checks username/password against the "users" table.
// password column is currently plain text (see README for how to switch to bcrypt hashes).
// Returns the user row (without password) on success, or null on failure.
// NOTE: Oracle upper-cases column names unless the alias is in "double quotes",
// so every alias below is quoted to get lower-case keys back.
async function checkLogin(username, password) {
  const p = await getPool();
  if (!p) {
    throw new Error('Database is not configured (check config.json "db" section and run "npm install").');
  }
  let conn;
  try {
    conn = await p.getConnection();
    const result = await conn.execute(
      `SELECT id AS "id", username AS "username", password AS "password", display_name AS "displayName"
       FROM users WHERE username = :username FETCH FIRST 1 ROWS ONLY`,
      { username }
    );
    if (result.rows.length === 0) return null;
    const user = result.rows[0];

    // Plain-text comparison (matches the current schema.sql).
    // If you switch the "password" column to bcrypt hashes, replace this
    // with: const bcrypt = require('bcrypt'); await bcrypt.compare(password, user.password)
    if (user.password !== password) return null;

    return { id: user.id, username: user.username, displayName: user.displayName };
  } finally {
    if (conn) await conn.close();
  }
}

// Returns the full ATM/branch site list.
// Returns null if the database isn't configured, so the caller can fall back
// to default-rows.json instead of failing outright.
async function getSites() {
  const p = await getPool();
  if (!p) return null;
  const { table, cols } = getSitesTableConfig();

  const select = [`${cols.atmid} AS "atmid"`, `${cols.adress} AS "adress"`];
  if (cols.ipCam) select.push(`${cols.ipCam} AS "ipCam"`);
  if (cols.videoIp) select.push(`${cols.videoIp} AS "videoIp"`);
  if (cols.ip) select.push(`${cols.ip} AS "ip"`);
  if (cols.email) select.push(`${cols.email} AS "email"`);

  let conn;
  try {
    conn = await p.getConnection();
    const result = await conn.execute(
      `SELECT ${select.join(', ')} FROM ${table} ORDER BY ${cols.atmid}`
    );
    // Oracle stores an empty string as NULL, so turn NULL back into '' here.
    return result.rows.map((r) => ({
      atmid: String(r.atmid),
      adress: r.adress || '',
      ipCam: r.ipCam || '',
      videoIp: r.videoIp || '',
      ip: r.ip || '',
      email: r.email || '',
    }));
  } finally {
    if (conn) await conn.close();
  }
}

// Maps the fields the app sends (site object) to [column, bindName, value].
// Columns that the real table does not have (empty name in config) are skipped.
function siteFields(cols, site, onlyProvided) {
  const wanted = [
    ['adress', cols.adress],
    ['ipCam', cols.ipCam],
    ['videoIp', cols.videoIp],
    ['ip', cols.ip],
    ['email', cols.email],
  ];
  return wanted
    .filter(([key, col]) => col && (!onlyProvided || site[key] !== undefined))
    .map(([key, col]) => [col, key, site[key] || null]);
}

async function createSite(site) {
  const p = await getPool();
  if (!p) throw new Error('Database is not configured');
  const { table, cols } = getSitesTableConfig();
  const fields = siteFields(cols, site, false);
  const colList = [cols.atmid, ...fields.map((f) => f[0])].join(', ');
  const bindList = [':atmid', ...fields.map((f) => ':' + f[1])].join(', ');
  const binds = { atmid: site.atmid };
  fields.forEach(([, bind, value]) => { binds[bind] = value; });
  let conn;
  try {
    conn = await p.getConnection();
    await conn.execute(`INSERT INTO ${table} (${colList}) VALUES (${bindList})`, binds, { autoCommit: true });
  } finally {
    if (conn) await conn.close();
  }
}

async function updateSite(atmid, updates) {
  const p = await getPool();
  if (!p) throw new Error('Database is not configured');
  const { table, cols } = getSitesTableConfig();
  // Only the fields that were actually sent are changed.
  const fields = siteFields(cols, updates, true);
  if (fields.length === 0) return;
  const setList = fields.map(([col, bind]) => `${col} = :${bind}`).join(', ');
  const binds = { atmid };
  fields.forEach(([, bind, value]) => { binds[bind] = value; });
  let conn;
  try {
    conn = await p.getConnection();
    await conn.execute(`UPDATE ${table} SET ${setList} WHERE ${cols.atmid} = :atmid`, binds, { autoCommit: true });
  } finally {
    if (conn) await conn.close();
  }
}

async function deleteSite(atmid) {
  const p = await getPool();
  if (!p) throw new Error('Database is not configured');
  const { table, cols } = getSitesTableConfig();
  let conn;
  try {
    conn = await p.getConnection();
    await conn.execute(`DELETE FROM ${table} WHERE ${cols.atmid} = :atmid`, { atmid }, { autoCommit: true });
  } finally {
    if (conn) await conn.close();
  }
}

// Records one row into audit_logs (per spec 7.3). Never throws — logging
// failures shouldn't block the actual login/save the user is doing, so
// errors are just printed to the server console.
async function insertAuditLog({ userId, actionType, targetRef, ipAddress }) {
  try {
    const p = await getPool();
    if (!p) return; // DB not configured yet — silently skip
    let conn;
    try {
      conn = await p.getConnection();
      await conn.execute(
        `INSERT INTO audit_logs (audit_id, user_id, action_type, target_ref, ip_address)
         VALUES (:auditId, :userId, :actionType, :targetRef, :ipAddress)`,
        {
          auditId: crypto.randomUUID(),
          userId: userId || null,
          actionType,
          targetRef: targetRef || null,
          ipAddress: ipAddress || null,
        },
        { autoCommit: true }
      );
    } finally {
      if (conn) await conn.close();
    }
  } catch (e) {
    console.warn('⚠️  Failed to write audit log:', e.message || e);
  }
}

module.exports = {
  loadConfig,
  getPool,
  closePool,
  getSitesTableConfig,
  checkLogin,
  getSites,
  insertAuditLog,
  createSite,
  updateSite,
  deleteSite,
};
