const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

async function main() {
  const DB = path.join(__dirname, '..', 'data', 'database.db');
  const db = new Database(DB);
  const username = process.env.ADMIN_USER || process.argv[2];
  const password = process.env.ADMIN_PASS || process.argv[3];
  if (!username || !password) {
    console.error('Usage: ADMIN_USER=admin ADMIN_PASS=secret node scripts/create_admin.js');
    console.error('Or: node scripts/create_admin.js <username> <password>');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare('INSERT OR REPLACE INTO users (username, password, is_admin) VALUES (?, ?, 1)').run(username, hash);
  console.log('Admin user created/updated:', username);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
