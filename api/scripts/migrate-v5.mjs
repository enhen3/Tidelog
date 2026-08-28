#!/usr/bin/env node
/**
 * 可重跑的 v5 D1 migration runner。
 *
 * D1/SQLite 不支持 ADD COLUMN IF NOT EXISTS。每次先读取真实 schema，只有缺列才
 * 执行 ALTER；因此即使进程在两条 ALTER 之间中断，下次也会从缺失处继续。
 */
import { execFileSync } from 'node:child_process';

const database = 'tidelog-license-db';
const run = (args) => execFileSync('wrangler', ['d1', 'execute', database, '--remote', ...args], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
});

let schema;
try {
    schema = JSON.parse(run(['--command', 'PRAGMA table_info(ai_usage)', '--json']));
} catch (error) {
    console.error('✗ 无法读取远程 D1 schema；未执行任何迁移。请检查 wrangler 登录、网络和数据库权限。');
    process.exitCode = 1;
    throw error;
}

const rows = schema.flatMap((batch) => batch.results ?? []);
const columns = new Set(rows.map((row) => row.name));
const steps = [
    ['CREATE TABLE IF NOT EXISTS device_trials (anchor TEXT PRIMARY KEY, ip_hash TEXT NOT NULL, started_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)', '创建 device_trials'],
    ['CREATE INDEX IF NOT EXISTS idx_device_trials_ip_started ON device_trials(ip_hash, started_at)', '创建 device_trials IP 索引'],
    ...(!columns.has('session_id') ? [['ALTER TABLE ai_usage ADD COLUMN session_id TEXT', '新增 ai_usage.session_id']] : []),
    ...(!columns.has('ip_anchor') ? [['ALTER TABLE ai_usage ADD COLUMN ip_anchor TEXT', '新增 ai_usage.ip_anchor']] : []),
    ['CREATE INDEX IF NOT EXISTS idx_ai_usage_session ON ai_usage(subject_id, feature, period, session_id)', '创建 session 索引'],
    ['CREATE INDEX IF NOT EXISTS idx_ai_usage_ip_period ON ai_usage(ip_anchor, period)', '创建 IP 索引'],
];

for (const [sql, label] of steps) {
    run(['--command', sql]);
    console.log(`✓ ${label}`);
}
console.log('✓ v5 migration 完成；可安全重复运行。');
