// backend/db-tool.js
// Helper for setting up the Oracle connection. Run from the backend folder:
//   node db-tool.js check    -> tests the connection and looks for the tables
//   node db-tool.js create   -> creates the tables from schema.sql (test databases only!)
//   node db-tool.js import   -> copies the sites in default-rows.json into the sites table
const fs = require('fs');
const path = require('path');
const { loadConfig, getPool, closePool, getSitesTableConfig } = require('./db');

function explain(e) {
  const msg = String((e && e.message) || e);
  if (/ORA-01017/.test(msg)) return msg + '\n   -> username or password is wrong';
  if (/ORA-28000/.test(msg)) return msg + '\n   -> this Oracle account is LOCKED — ask the database admin to unlock it';
  if (/ORA-12514|ORA-12541|NJS-503|NJS-515|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/.test(msg))
    return msg + '\n   -> cannot reach the database: check host, port and service name in "connectString", and that this computer can reach the server (VPN / firewall)';
  if (/ORA-00942/.test(msg)) return msg + '\n   -> table not found (or this user has no permission on it)';
  if (/ORA-00904/.test(msg)) return msg + '\n   -> a column name does not exist: check "sitesColumns" in config.json';
  return msg;
}

async function getConn() {
  const cfg = loadConfig();
  if (!cfg || !cfg.db || !cfg.db.user || cfg.db.user === 'your_oracle_user' || !cfg.db.connectString) {
    console.log('✖ config.json "db" section is not filled in yet (user / password / connectString).');
    return null;
  }
  console.log(`Connecting as ${cfg.db.user} to ${cfg.db.connectString} ...`);
  const p = await getPool();
  return p.getConnection();
}

async function check() {
  const conn = await getConn();
  if (!conn) return;
  try {
    console.log('✔ Connected. Oracle version:', conn.oracleServerVersionString || '(unknown)');
    const { table } = getSitesTableConfig();
    for (const t of ['users', table, 'audit_logs']) {
      try {
        const r = await conn.execute(`SELECT COUNT(*) AS "n" FROM ${t}`);
        console.log(`✔ table ${t}: ${r.rows[0].n} row(s)`);
      } catch (e) {
        console.log(`✖ table ${t}: ${explain(e)}`);
      }
    }
  } finally {
    await conn.close();
  }
}

// Splits schema.sql into single statements (drops comment lines and COMMIT).
function readSchemaStatements() {
  const text = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  const noComments = text.split(/\r?\n/).filter((l) => !l.trim().startsWith('--')).join('\n');
  return noComments
    .split(/;[ \t]*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s && !/^commit$/i.test(s));
}

async function create() {
  const conn = await getConn();
  if (!conn) return;
  try {
    console.log('⚠ This creates tables and a sample admin user from schema.sql — use it on a TEST database only.');
    for (const sql of readSchemaStatements()) {
      const label = sql.replace(/\s+/g, ' ').slice(0, 60);
      try {
        await conn.execute(sql, [], { autoCommit: true });
        console.log('✔', label);
      } catch (e) {
        if (/ORA-00955/.test(String(e.message))) console.log('• already exists, skipped:', label);
        else console.log('✖', label, '\n  ', explain(e));
      }
    }
    // For a sites table that was created before the alarm_ip column existed.
    const { table, cols } = getSitesTableConfig();
    if (cols.ip) {
      try {
        await conn.execute(`ALTER TABLE ${table} ADD (${cols.ip} VARCHAR2(50))`);
        console.log(`✔ added column ${cols.ip} to ${table}`);
      } catch (e) {
        if (!/ORA-01430/.test(String(e.message))) console.log('✖ add column', cols.ip, '\n  ', explain(e));
      }
    }
  } finally {
    await conn.close();
  }
}

async function importSites() {
  const file = path.join(__dirname, 'default-rows.json');
  if (!fs.existsSync(file)) {
    console.log('✖ default-rows.json not found');
    return;
  }
  const sites = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const conn = await getConn();
  if (!conn) return;
  try {
    const { table, cols } = getSitesTableConfig();
    const fields = [
      ['adress', cols.adress],
      ['ipCam', cols.ipCam],
      ['videoIp', cols.videoIp],
      ['ip', cols.ip],
      ['email', cols.email],
    ].filter(([, col]) => col);
    const setList = fields.map(([k, col]) => `${col} = :${k}`).join(', ');
    const colList = [cols.atmid, ...fields.map((f) => f[1])].join(', ');
    const bindList = [':atmid', ...fields.map((f) => ':' + f[0])].join(', ');
    let added = 0;
    let updated = 0;
    for (const s of sites) {
      const binds = { atmid: String(s.atmid) };
      fields.forEach(([k]) => { binds[k] = s[k] || null; });
      const up = await conn.execute(`UPDATE ${table} SET ${setList} WHERE ${cols.atmid} = :atmid`, binds);
      if (up.rowsAffected > 0) {
        updated += 1;
      } else {
        await conn.execute(`INSERT INTO ${table} (${colList}) VALUES (${bindList})`, binds);
        added += 1;
      }
    }
    await conn.commit();
    console.log(`✔ Imported ${sites.length} site(s): ${added} added, ${updated} updated.`);
  } catch (e) {
    await conn.rollback();
    console.log('✖ Import failed, nothing was saved:', explain(e));
  } finally {
    await conn.close();
  }
}

async function main() {
  const cmd = process.argv[2];
  const commands = { check, create, import: importSites };
  if (!commands[cmd]) {
    console.log('Usage:  node db-tool.js check | create | import');
    return;
  }
  try {
    await commands[cmd]();
  } catch (e) {
    console.log('✖', explain(e));
  } finally {
    await closePool();
  }
}

main();
