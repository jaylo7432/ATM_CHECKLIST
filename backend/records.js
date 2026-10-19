// backend/records.js
// Saves and loads the daily inspection results (ATM Check and SIM Check) in Oracle.
//   type 'atm' -> table checklist_records
//   type 'sim' -> table sim_records
const { getPool } = require('./db');

const TYPES = {
  atm: {
    table: 'checklist_records',
    info: ['adress', 'province', 'ipCam', 'videoIp'],
    checks: [
      'camConectConnect', 'camConectDisconnect',
      'camWorkConnect', 'camWorkDisconnect',
      'drvConectConnect', 'drvConectDisconnect',
      'camSaveConnect', 'camSaveDisconnect',
    ],
  },
  sim: {
    table: 'sim_records',
    info: ['adress', 'province', 'ip'],
    checks: [
      'connStatusConnect', 'connStatusDisconnect',
      'alarmOff', 'alarmOn',
      'connectTypeWan', 'connectTypeGprs',
      'statusConnect', 'statusLost',
    ],
  },
};

// camelCase -> snake_case, e.g. camConectConnect -> cam_conect_connect
function col(name) {
  return name.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

function getType(type) {
  const t = TYPES[type];
  if (!t) throw new Error('Unknown record type: ' + type);
  return t;
}

// Saves one day's results. Replaces anything already saved for that date.
// Returns false if Oracle is not configured, true when saved.
async function saveRecords(type, date, rows, savedAt, username) {
  const t = getType(type);
  const p = await getPool();
  if (!p) return false;

  const columns = ['record_date', 'atmid', ...t.info.map(col), ...t.checks.map(col), 'checked_by', 'saved_at'];
  const values = [
    "TO_DATE(:d, 'YYYY-MM-DD')", ':atmid',
    ...t.info.map((k) => ':' + k),
    ...t.checks.map((k) => ':' + k),
    ':checkedBy', ':savedAt',
  ];
  const insertSql = `INSERT INTO ${t.table} (${columns.join(', ')}) VALUES (${values.join(', ')})`;

  const conn = await p.getConnection();
  try {
    await conn.execute(`DELETE FROM ${t.table} WHERE record_date = TO_DATE(:d, 'YYYY-MM-DD')`, { d: date });
    for (const r of rows) {
      const binds = { d: date, atmid: String(r.atmid), checkedBy: username || null, savedAt: savedAt || null };
      t.info.forEach((k) => { binds[k] = r[k] || null; });
      t.checks.forEach((k) => { binds[k] = r[k] ? 1 : 0; });
      await conn.execute(insertSql, binds);
    }
    await conn.commit();
    return true;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    await conn.close();
  }
}

// Loads one day's results as { rows, savedAt }.
// Returns null if Oracle is not configured. rows is [] when nothing was saved that day.
async function loadRecords(type, date) {
  const t = getType(type);
  const p = await getPool();
  if (!p) return null;

  const select = [
    'atmid AS "atmid"',
    ...t.info.map((k) => `${col(k)} AS "${k}"`),
    ...t.checks.map((k) => `${col(k)} AS "${k}"`),
    'saved_at AS "savedAt"',
  ];
  const conn = await p.getConnection();
  try {
    const result = await conn.execute(
      `SELECT ${select.join(', ')} FROM ${t.table} WHERE record_date = TO_DATE(:d, 'YYYY-MM-DD') ORDER BY atmid`,
      { d: date }
    );
    const rows = result.rows.map((r) => {
      const row = { atmid: r.atmid };
      t.info.forEach((k) => { row[k] = r[k] || ''; });
      t.checks.forEach((k) => { row[k] = r[k] === 1; });
      return row;
    });
    return { rows, savedAt: result.rows.length ? result.rows[0].savedAt : null };
  } finally {
    await conn.close();
  }
}

module.exports = { saveRecords, loadRecords };