const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');

async function updateAdmin() {
  const dbPath = path.join(__dirname, '..', 'database', 'newtechmed.db');
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  const newEmail = 'mohammed.f.saqqaf@gmail.com';
  const newPassword = '772522233';
  const newName = 'م. محمد السقاف';

  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(newPassword, salt);

  // Check if admin user with id 1 exists
  const existing = db.exec("SELECT id, name, email FROM users WHERE id = 1");
  if (existing.length > 0 && existing[0].values.length > 0) {
    db.run(
      "UPDATE users SET name = ?, email = ?, password = ?, role = 'admin', status = 'active', store_id = NULL WHERE id = 1",
      [newName, newEmail, hashedPassword]
    );
    console.log('Admin user ID #1 updated successfully.');
  } else {
    db.run(
      "INSERT INTO users (name, email, password, role, status, store_id) VALUES (?, ?, ?, 'admin', 'active', NULL)",
      [newName, newEmail, hashedPassword]
    );
    console.log('New admin user inserted.');
  }

  // Also verify user by querying back
  const userRes = db.exec(`SELECT id, name, email, role, status, store_id FROM users WHERE email = '${newEmail}'`);
  console.log('Verified user in database:', JSON.stringify(userRes[0].values[0]));

  // Export and save
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  console.log('Database updated and persisted to disk at:', dbPath);
}

updateAdmin().catch(console.error);
