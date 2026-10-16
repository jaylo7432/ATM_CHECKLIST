// backend/create-user.js
// Creates the Oracle user the ATM app logs in with, without needing sqlplus.
// Usage (from the backend folder):
//   node create-user.js <SYSTEM password> <new username> <new password> [connectString]
// Example:
//   node create-user.js MySystemPw atmapp MyNewPw123
// The connectString defaults to localhost:1521/FREEPDB1 (Oracle Database Free on this PC).
const oracledb = require('oracledb');

async function main() {
  const [systemPw, newUser, newPw, connectString = 'localhost:1521/FREEPDB1'] = process.argv.slice(2);
  if (!systemPw || !newUser || !newPw) {
    console.log('Usage: node create-user.js <SYSTEM password> <new username> <new password> [connectString]');
    return;
  }
  if (!/^[A-Za-z][A-Za-z0-9_]{0,29}$/.test(newUser)) {
    console.log('✖ username must start with a letter and use only letters, numbers and _ (max 30 characters)');
    return;
  }
  if (/["';\s]/.test(newPw)) {
    console.log('✖ new password must not contain spaces, quotes or semicolons');
    return;
  }

  let conn;
  try {
    conn = await oracledb.getConnection({ user: 'system', password: systemPw, connectString });
    console.log('✔ Connected as SYSTEM to', connectString);
    const steps = [
      `CREATE USER ${newUser} IDENTIFIED BY "${newPw}"`,
      `GRANT CONNECT, RESOURCE TO ${newUser}`,
      `GRANT UNLIMITED TABLESPACE TO ${newUser}`,
    ];
    for (const sql of steps) {
      try {
        await conn.execute(sql);
        console.log('✔', sql.replace(newPw, '********'));
      } catch (e) {
        if (/ORA-01920/.test(e.message)) {
          console.log(`• user ${newUser} already exists — resetting its password instead`);
          await conn.execute(`ALTER USER ${newUser} IDENTIFIED BY "${newPw}"`);
        } else {
          throw e;
        }
      }
    }
    console.log(`\nDone. Put this in config.json -> "db":\n  "user": "${newUser}",\n  "password": "(the new password)",\n  "connectString": "${connectString}"`);
  } catch (e) {
    console.log('✖', e.message);
    if (/ORA-01017/.test(e.message)) console.log('   -> the SYSTEM password is wrong');
    if (/NJS-503|ECONNREFUSED|ORA-12541|ORA-12514/.test(e.message))
      console.log('   -> cannot reach Oracle: check that the Oracle services are "Running" in Windows Services, and the connect string');
  } finally {
    if (conn) await conn.close();
  }
}

main();
