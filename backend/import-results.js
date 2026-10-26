// node import-results.js          -> import days not in Oracle yet
// node import-results.js --force  -> also overwrite days already in Oracle
const fs = require('fs');
const path = require('path');
const { getPool, closePool } = require('./db');
const { saveRecords, loadRecords } = require('./records');

const FORCE = process.argv.includes('--force');
const FOLDERS = [
  { type: 'atm', label: 'ATM Check', dir: path.join(__dirname, 'data') },
  { type: 'sim', label: 'SIM Check', dir: path.join(__dirname, 'data-sim') },
];

function provinceFor(atmid) {
  try {
    const codes = JSON.parse(fs.readFileSync(path.join(__dirname, 'province-codes.json'), 'utf-8'));
    const prefix = String(atmid || '').slice(0, 3);
    return codes[prefix] ? `${prefix}-${codes[prefix]}` : '';
  } catch (e) {
    return '';
  }
}

async function importFolder({ type, label, dir }) {
  const summary = { imported: 0, skipped: 0, failed: 0 };
  if (!fs.existsSync(dir)) {
    console.log(`• ${label}: folder not found, nothing to import.`);
    return summary;
  }
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const file of files) {
    const date = file.replace('.json', '');
    try {
      const content = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      const rows = (content.rows || []).map((r) => ({ ...r, province: r.province || provinceFor(r.atmid) }));
      if (rows.length === 0) {
        console.log(`• ${label} ${date}: no rows, skipped.`);
        summary.skipped += 1;
        continue;
      }
      if (!FORCE) {
        const existing = await loadRecords(type, date);
        if (existing && existing.rows.length > 0) {
          console.log(`• ${label} ${date}: already in Oracle, skipped.`);
          summary.skipped += 1;
          continue;
        }
      }
      await saveRecords(type, date, rows, content.savedAt || null, 'imported');
      console.log(`✔ ${label} ${date}: ${rows.length} rows imported.`);
      summary.imported += 1;
    } catch (e) {
      console.log(`✖ ${label} ${date}: ${e.message}`);
      summary.failed += 1;
    }
  }
  return summary;
}

async function main() {
  let pool;
  try {
    pool = await getPool();
  } catch (e) {
    console.log('✖ Cannot connect to Oracle:', e.message);
    return;
  }
  if (!pool) {
    console.log('✖ config.json "db" section is not filled in yet.');
    return;
  }
  const total = { imported: 0, skipped: 0, failed: 0 };
  for (const f of FOLDERS) {
    const s = await importFolder(f);
    total.imported += s.imported;
    total.skipped += s.skipped;
    total.failed += s.failed;
  }
  console.log(`\nDone: ${total.imported} imported, ${total.skipped} skipped, ${total.failed} failed.`);
}

main()
  .catch((e) => console.log('✖', e.message))
  .finally(() => closePool());