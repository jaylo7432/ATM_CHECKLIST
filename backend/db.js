// backend/db.js
// Oracle version — uses the official "oracledb" driver instead of mysql2.
// server.js only calls checkLogin() and getSites(), so nothing outside
// this file needed to change.
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

// Oracle connects with a single connect string: "host:port/service_name"
// (or a TNS alias name if your network has a tnsnames.ora set up), not
// separate host/port/database fields like MySQL.
async function getPool() {
  if (!oracledb) return null;
  const cfg = loadConfig();
  if (!cfg || !cfg.db || !cfg.db.connectString) return null;
  if (!pool) {
    pool = await oracledb.createPool({
      user: cfg.db.user,
      password: cfg.db.password,
      connectString: cfg.db.connectString, // e.g. "myhost:1521/ORCLPDB1"
      poolMin: 1,
      poolMax: 5,
    });
  }
  return pool;
}

// Checks username/password against the "users" table.
// password column is currently plain text (see README for how to switch to bcrypt hashes).
// Returns the user row (without password) on success, or null on failure.
async function checkLogin(username, password) {
  const p = await getPool();
  if (!p) {
    throw new Error('Database is not configured (check config.json "db" section and run "npm install").');
  }
  let conn;
  try {
    conn = await p.getConnection();
    const result = await conn.execute(
      `SELECT id, username, password, display_name AS "displayName"
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

// Returns the full ATM/branch site list, using the table/column names
// configured in config.json ("db.sitesTable" / "db.sitesColumns") instead
// of hard-coded names — so when you get the real table structure, you
// only need to edit config.json, not this file.
// Returns null if the database isn't configured, so the caller can fall back
// to default-rows.json instead of failing outright.
async function getSites() {
  const p = await getPool();
  if (!p) return null;
  const cfg = loadConfig();
  const table = (cfg.db && cfg.db.sitesTable) || 'atm_sites';
  const cols = Object.assign(
    { atmid: 'atmid', adress: 'adress', ipCam: 'ip_cam', videoIp: 'video_ip', email: 'email' },
    (cfg.db && cfg.db.sitesColumns) || {}
  );
  let conn;
  try {
    conn = await p.getConnection();
    const result = await conn.execute(
      `SELECT ${cols.atmid} AS atmid, ${cols.adress} AS adress,
              ${cols.ipCam} AS "ipCam", ${cols.videoIp} AS "videoIp", ${cols.email} AS email
       FROM ${table} ORDER BY ${cols.atmid}`
    );
    return result.rows;
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

module.exports = { getPool, checkLogin, getSites, insertAuditLog };
