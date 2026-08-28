/** 新建 D1 必须一次初始化到当前 Worker 所需的完整 schema。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
for (const name of ['licenses', 'license_devices', 'rate_limits', 'ai_usage', 'free_quota', 'device_trials']) {
    assert.ok(tables.has(name), `新库必须包含 ${name}`);
}

const aiColumns = new Set(db.prepare('PRAGMA table_info(ai_usage)').all().map((row) => row.name));
for (const name of ['session_id', 'ip_anchor']) assert.ok(aiColumns.has(name), `ai_usage 必须包含 ${name}`);

const indexes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => row.name));
for (const name of ['idx_ai_usage_session', 'idx_ai_usage_ip_period', 'idx_device_trials_ip_started']) {
    assert.ok(indexes.has(name), `新库必须包含索引 ${name}`);
}

console.log('  PASS  schema.sql 可一次建立当前 Worker 所需的完整 D1 结构');
