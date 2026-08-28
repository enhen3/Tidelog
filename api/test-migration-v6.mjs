/** v6 必须由 Cloudflare migrations 原子执行，并保留所有既有 License 类型。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const sql = fs.readFileSync(new URL('./migrations/0001_v6_annual_default.sql', import.meta.url), 'utf8');
const apiPackage = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

assert.doesNotMatch(sql, /\b(?:BEGIN|COMMIT|ROLLBACK)\b\s*(?:TRANSACTION)?\s*;/i,
    'D1 migrations 自己管理事务，SQL 不得嵌套显式事务');
assert.match(apiPackage.scripts['db:migrate:v6'], /d1 migrations apply tidelog-license-db --remote/,
    'v6 必须走 Cloudflare migrations，而不是 d1 execute --file');

const db = new DatabaseSync(':memory:');
db.exec(`
    CREATE TABLE licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'unused', license_type TEXT DEFAULT 'lifetime',
      expires_at INTEGER, max_devices INTEGER DEFAULT 3,
      email TEXT, order_id TEXT, created_at INTEGER DEFAULT (unixepoch())
    );
    INSERT INTO licenses (key, status, license_type, email, order_id)
      VALUES ('TL-LEGACY-LIFETIME', 'active', 'lifetime', 'owner@example.test', 'order-old');
    INSERT INTO licenses (key, status, license_type, expires_at)
      VALUES ('TL-EXISTING-ANNUAL', 'active', 'annual', 2000000000);
`);

db.exec(sql);
db.prepare("INSERT INTO licenses (key) VALUES ('TL-NEW-DEFAULT')").run();

const rows = db.prepare('SELECT key, status, license_type, email, order_id FROM licenses ORDER BY key').all();
const byKey = new Map(rows.map((row) => [row.key, row]));
assert.equal(rows.length, 3, '迁移前后的行数与新增测试行应完整');
assert.equal(byKey.get('TL-LEGACY-LIFETIME')?.license_type, 'lifetime', '既有终身版必须保留');
assert.equal(byKey.get('TL-LEGACY-LIFETIME')?.email, 'owner@example.test', '找回字段不得丢失');
assert.equal(byKey.get('TL-LEGACY-LIFETIME')?.order_id, 'order-old', '订单号不得丢失');
assert.equal(byKey.get('TL-EXISTING-ANNUAL')?.license_type, 'annual', '既有年度版必须保留');
assert.equal(byKey.get('TL-NEW-DEFAULT')?.license_type, 'annual', '迁移后的数据库默认值必须是 annual');

const indexes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => row.name));
for (const name of ['idx_licenses_key', 'idx_licenses_status', 'idx_licenses_email_order']) {
    assert.ok(indexes.has(name), `迁移后索引 ${name} 必须存在`);
}

console.log('  PASS  v6 无嵌套事务，保留既有 License，并把新默认值改为 annual');
