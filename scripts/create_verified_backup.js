var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var src = path.join(__dirname, '..', 'database', 'newtechmed.db');
var backupDir = path.join(__dirname, '..', 'database', 'backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

var timestamp = new Date().toISOString().replace(/[:.]/g, '-');
var dst = path.join(backupDir, 'newtechmed_pre_turso_verified_' + timestamp + '.db');

fs.copyFileSync(src, dst);

var hash1 = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex').toUpperCase();
var hash2 = crypto.createHash('sha256').update(fs.readFileSync(dst)).digest('hex').toUpperCase();

console.log('Original Hash:', hash1);
console.log('Backup Hash:  ', hash2);
console.log('Match:        ', hash1 === hash2);
console.log('Backup Path:  ', dst);

if (hash1 !== hash2) {
  process.exit(1);
}
