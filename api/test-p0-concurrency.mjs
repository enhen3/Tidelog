/**
 * P0 原子写入与缺盐路由集成测试。
 *
 * 使用 Node 内置 node:sqlite 承载一个最小 D1 适配层。SQL 由真实 SQLite 执行，
 * `meta.changes` 直接来自 SQLite changes()，因此 INSERT ... SELECT ... WHERE
 * 是否真的拒绝写入由数据库决定，而不是测试替身猜测。
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, webcrypto } from 'node:crypto';
import esbuild from '../node_modules/esbuild/lib/main.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
const check = (label, condition) => {
	assert.ok(condition, label);
	console.log(`  PASS  ${label}`);
	passed += 1;
};

function compile(entry, extra = '') {
	const sourcePath = path.join(__dirname, 'src', entry);
	const output = path.join(os.tmpdir(), `tidelog-${entry}-${Date.now()}-${Math.random()}.mjs`);
	esbuild.buildSync({
		stdin: { contents: fs.readFileSync(sourcePath, 'utf8') + extra, resolveDir: path.dirname(sourcePath), sourcefile: entry, loader: 'ts' },
		outfile: output, bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
	});
	return { output, module: import(pathToFileURL(output).href) };
}

const builtAi = compile('ai.ts', '\nexport { resolveIdentity, reserveUsage };');
const builtWorker = compile('index.ts');
const AI = await builtAi.module;
const Worker = (await builtWorker.module).default;

function d1() {
	const db = new DatabaseSync(':memory:');
	db.exec(`
		CREATE TABLE licenses (
			id INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL, status TEXT DEFAULT 'unused', license_type TEXT DEFAULT 'lifetime',
			expires_at INTEGER, max_devices INTEGER DEFAULT 3, email TEXT, order_id TEXT, created_at INTEGER
		);
		CREATE TABLE license_devices (license_key TEXT NOT NULL, device_id TEXT NOT NULL, activated_at INTEGER, UNIQUE(license_key, device_id));
		CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
		CREATE TABLE device_trials (anchor TEXT PRIMARY KEY, ip_hash TEXT NOT NULL, started_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
		CREATE INDEX idx_device_trials_ip_started ON device_trials(ip_hash, started_at);
		CREATE TABLE ai_usage (
			id TEXT PRIMARY KEY, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, feature TEXT NOT NULL,
			period TEXT NOT NULL, created_at INTEGER NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0,
			output_tokens INTEGER NOT NULL DEFAULT 0, session_id TEXT, ip_anchor TEXT
		);
	`);
	const database = {
		prepare(sql) {
			let params = [];
			const statement = {
				bind(...values) { params = values; return statement; },
				async run() {
					db.prepare(sql).run(...params);
					return { meta: { changes: Number(db.prepare('SELECT changes() AS changes').get().changes) } };
				},
				async first() { return db.prepare(sql).get(...params) ?? null; },
				async all() { return { results: db.prepare(sql).all(...params) }; },
			};
			return statement;
		},
	};
	return { db, database };
}

const env = (DB, overrides = {}) => ({ DB, ADMIN_TOKEN: 'test-admin', DEEPSEEK_API_KEY: 'test-key', ...overrides });
const request = (url, init = {}) => new Request(`https://api.test${url}`, init);
const count = (db, sql, ...params) => Number(db.prepare(sql).get(...params).n);
const hmac = (salt, text) => createHmac('sha256', salt).update(text).digest('hex');
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const ctx = { waitUntil() {} };

console.log('\nTest 1: 缺失 ANCHOR_SALT 时所有限流路由 fail closed，且不写 rate_limits');
for (const [url, method, body] of [
	['/ai/generate', 'POST', { feature: 'daily_insight', messages: [{ role: 'user', content: 'x' }], deviceId: 'd' }],
	['/ai/quota?deviceId=d', 'GET'],
	['/trial/start', 'POST', { deviceId: 'd' }],
	['/trial/status?deviceId=d', 'GET'],
	['/license/activate', 'POST', { key: 'TL-X', deviceId: 'd' }],
	['/license/verify', 'POST', { key: 'TL-X', deviceId: 'd' }],
	['/license/deactivate', 'POST', { key: 'TL-X', deviceId: 'd' }],
	['/portal/lookup', 'POST', { email: 'a@b.test', orderId: 'o' }],
	['/portal/unbind', 'POST', { email: 'a@b.test', orderId: 'o', deviceId: 'd' }],
]) {
	const { db, database } = d1();
	const response = await Worker.fetch(request(url, {
		method, headers: { 'CF-Connecting-IP': '203.0.113.10', ...(body ? { 'Content-Type': 'application/json' } : {}) },
		...(body ? { body: JSON.stringify(body) } : {}),
	}), env(database), ctx);
	const json = await response.json();
	check(`${method} ${url} 返回 503`, response.status === 503);
	check(`${method} ${url} 返回 anchor_salt_not_configured`, json.error === 'anchor_salt_not_configured');
	check(`${method} ${url} 未写入 rate_limits`, count(db, 'SELECT COUNT(*) AS n FROM rate_limits') === 0);
	}

console.log('\nTest 2: 限流键是带盐 HMAC，不会回退到旧无盐 SHA-256');
{
	const keys = [];
	for (const salt of ['salt-one', 'salt-two']) {
		const { db, database } = d1();
		const response = await Worker.fetch(request('/license/verify', {
			method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.7' },
			body: JSON.stringify({ key: 'TL-X', deviceId: 'device' }),
		}), env(database, { ANCHOR_SALT: salt }), ctx);
		check(`盐 ${salt} 的路由通过限流并到达业务处理`, response.status === 404);
		const row = db.prepare('SELECT key, reset_at FROM rate_limits').get();
		keys.push(row.key);
		check(`盐 ${salt} 的实际键等于 HMAC`, row.key === hmac(salt, `ratelimit:license-verify:198.51.100.7:${row.reset_at}`));
		check(`盐 ${salt} 的实际键不是旧 SHA-256`, row.key !== sha256(`license-verify198.51.100.7${row.reset_at}`));
	}
	check('相同 IP/scope/时间窗，换盐得到不同键', keys[0] !== keys[1]);
}

console.log('\nTest 2b: 免费主体跨网络稳定，IP 护栏仍彼此独立');
{
	const salt = 'stable-subject-salt';
	const wifi = request('/ai/quota', { headers: { 'CF-Connecting-IP': '198.51.100.8' } });
	const mobile = request('/ai/quota', { headers: { 'CF-Connecting-IP': '203.0.113.9' } });
	check('同 deviceId 换网络仍是同一免费主体',
		await AI.makeFreeAnchor(wifi, 'same-device', salt) === await AI.makeFreeAnchor(mobile, 'same-device', salt));
	check('不同网络仍有不同 IP 成本护栏',
		await AI.makeIpAnchor(wifi, salt) !== await AI.makeIpAnchor(mobile, salt));
}

console.log('\nTest 2c: 通用限流在并发边界最多放行 limit 次');
{
	const { database } = d1();
	const testEnv = env(database, { ANCHOR_SALT: 'atomic-rate-limit-salt' });
	const responses = await Promise.all(Array.from({ length: 16 }, () => Worker.fetch(request('/ai/quota?deviceId=rate-limit-device', {
		headers: { 'CF-Connecting-IP': '198.51.100.88' },
	}), testEnv, ctx)));
	check('并发 16 次恰有 10 次通过', responses.filter((response) => response.status === 200).length === 10);
	check('其余 6 次明确返回 429', responses.filter((response) => response.status === 429).length === 6);
}

console.log('\nTest 2d: License 激活设备上限由单条原子写入保护');
{
	const { db, database } = d1();
	db.prepare(`INSERT INTO licenses (key, status, license_type, max_devices, created_at)
		VALUES ('TL-ATOMIC-ACTIVATE', 'unused', 'lifetime', 3, ?)`).run(Math.floor(Date.now() / 1000));
	const testEnv = env(database, { ANCHOR_SALT: 'activation-concurrency-salt' });
	const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => Worker.fetch(request('/license/activate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.77' },
		body: JSON.stringify({ key: 'TL-ATOMIC-ACTIVATE', deviceId: `dev-concurrent-${index}` }),
	}), testEnv, ctx)));
	check('并发激活最终严格只有 3 个设备', count(db, "SELECT COUNT(*) AS n FROM license_devices WHERE license_key = 'TL-ATOMIC-ACTIVATE'") === 3);
	check('恰有 3 个激活成功', responses.filter((response) => response.status === 200).length === 3);
	check('其余请求被设备上限拒绝', responses.filter((response) => response.status === 409).length === 5);
}

console.log('\nTest 2e: 找回接口按邮箱身份限流，轮换 IP 不能暴力枚举');
{
	const { db, database } = d1();
	const salt = 'portal-identity-rate-limit-salt';
	const testEnv = env(database, { ANCHOR_SALT: salt });
	const email = 'Owner@Example.Test';
	const responses = [];
	for (let index = 0; index < 11; index += 1) {
		responses.push(await Worker.fetch(request('/portal/lookup', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `198.51.100.${index + 1}` },
			body: JSON.stringify({ email, orderId: `wrong-${index}` }),
		}), testEnv, ctx));
	}
	check('轮换 IP 的前 10 次查询仍受统一身份窗口计数', responses.slice(0, 10).every((response) => response.status === 200));
	check('第 11 次查询返回 429', responses[10].status === 429);
	const identityRow = db.prepare('SELECT key, count, reset_at FROM rate_limits WHERE count = 10').get();
	check('身份限流键只保存带盐 HMAC，不落原始邮箱', identityRow?.key === hmac(
		salt,
		`ratelimit:portal-lookup-email:owner@example.test:${identityRow.reset_at}`,
	) && !identityRow.key.toLowerCase().includes('owner@example.test'));
}

console.log('\nTest 2f: 畸形、错误类型和超大 JSON 均在边界拒绝');
{
	const { database } = d1();
	const testEnv = env(database, { ANCHOR_SALT: 'invalid-input-salt' });
	const malformed = await Worker.fetch(request('/license/activate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.120' },
		body: '{',
	}), testEnv, ctx);
	const wrongTypes = await Worker.fetch(request('/portal/lookup', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.121' },
		body: JSON.stringify({ email: 42, orderId: ['not', 'a', 'string'] }),
	}), testEnv, ctx);
	const nullTrial = await Worker.fetch(request('/trial/start', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.122' },
		body: 'null',
	}), testEnv, ctx);
	const nullGenerate = await Worker.fetch(request('/ai/generate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.123' },
		body: 'null',
	}), testEnv, ctx);
	const oversizedControl = await Worker.fetch(request('/license/activate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.124' },
		body: JSON.stringify({ padding: 'x'.repeat(70 * 1024) }),
	}), testEnv, ctx);
	const oversizedAI = await Worker.fetch(request('/ai/generate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.125' },
		body: JSON.stringify({ padding: 'x'.repeat(520 * 1024) }),
	}), testEnv, ctx);
	check('破损 JSON 返回 400', malformed.status === 400);
	check('错误字段类型返回 400', wrongTypes.status === 400);
	check('null 试用请求返回 400', nullTrial.status === 400);
	check('null AI 请求返回 400', nullGenerate.status === 400);
	check('控制接口实际读取超过 64 KiB 时返回 413', oversizedControl.status === 413);
	check('AI 接口实际读取超过 512 KiB 时返回 413', oversizedAI.status === 413);
}

console.log('\nTest 2g: 管理端 Token 使用固定长度摘要比较');
{
	const { database } = d1();
	const testEnv = env(database, { ANCHOR_SALT: 'admin-auth-salt' });
	const denied = await Worker.fetch(request('/admin/list', {
		headers: { Authorization: 'Bearer definitely-wrong' },
	}), testEnv, ctx);
	const allowed = await Worker.fetch(request('/admin/list', {
		headers: { Authorization: 'Bearer test-admin' },
	}), testEnv, ctx);
	check('错误管理 Token 返回 401', denied.status === 401);
	check('正确管理 Token 通过固定时序比较', allowed.status === 200);
}

console.log('\nTest 3: NAT 风险阈值不拒绝，试用 IP 硬上限仍在并发下严格生效');
{
	const { db, database } = d1();
	const salt = 'trial-concurrency-salt';
	const req = request('/ai/generate', { headers: { 'CF-Connecting-IP': '192.0.2.8' } });
	const results = await Promise.all(Array.from({ length: 16 }, (_, i) => AI.resolveIdentity(req, env(database), undefined, `device-${i}`, true, null, true, salt)));
	check('device_trials 仅有 12 行', count(db, 'SELECT COUNT(*) AS n FROM device_trials') === 12);
	check('16 个结果中恰有 12 个 trial', results.filter((x) => !(x instanceof Response) && x.tier === 'trial').length === 12);
	const refused = results.filter((x) => x instanceof Response);
	check('4 个超上限请求得到明确 429', refused.length === 4 && refused.every((x) => x.status === 429));
	const refusedBodies = await Promise.all(refused.map((x) => x.json()));
	check('拒绝体明确标注 IP 试用护栏', refusedBodies.every((body) => body.error === 'trial_start_refused' && body.scope === 'ip'));
}

console.log('\nTest 4: 同 deviceId 并发只建一条试用，所有请求获得同一到期时间');
{
	const { db, database } = d1();
	const salt = 'same-device-salt';
	const req = request('/ai/generate', { headers: { 'CF-Connecting-IP': '192.0.2.9' } });
	const results = await Promise.all(Array.from({ length: 8 }, () => AI.resolveIdentity(req, env(database), undefined, 'one-device', true, null, true, salt)));
	const identities = results.filter((x) => !(x instanceof Response));
	check('device_trials 只有一行', count(db, 'SELECT COUNT(*) AS n FROM device_trials') === 1);
	check('所有并发请求均为 trial', identities.every((x) => x.tier === 'trial'));
	check('所有并发请求的 trialExpiresAt 一致', new Set(identities.map((x) => x.trialExpiresAt)).size === 1);
}

console.log('\nTest 4b: 试用只由专用端点开启，重试幂等且过期不可重开');
{
	const { db, database } = d1();
	const testEnv = env(database, { ANCHOR_SALT: 'trial-endpoint-salt' });
	const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.44' };
	const startRequest = () => request('/trial/start', {
		method: 'POST', headers, body: JSON.stringify({ deviceId: 'trial-endpoint-device' }),
	});

	const first = await Worker.fetch(startRequest(), testEnv, ctx);
	const firstJson = await first.json();
	check('首次点击立即由服务端开启试用', first.status === 200 && firstJson.state === 'active' && firstJson.newly_started === true);
	check('服务端保存的窗口恰好 7 天', firstJson.expires_at - firstJson.started_at === 7 * 24 * 60 * 60);
	check('首次点击只写一条试用记录', count(db, 'SELECT COUNT(*) AS n FROM device_trials') === 1);

	const second = await Worker.fetch(startRequest(), testEnv, ctx);
	const secondJson = await second.json();
	check('网络重试返回同一窗口而不续期', second.status === 200
		&& secondJson.newly_started === false
		&& secondJson.started_at === firstJson.started_at
		&& secondJson.expires_at === firstJson.expires_at);

	const status = await Worker.fetch(request('/trial/status?deviceId=trial-endpoint-device', {
		headers: { 'CF-Connecting-IP': '203.0.113.99' },
	}), testEnv, ctx);
	const statusJson = await status.json();
	check('换网络查询仍读到同一服务端试用', status.status === 200
		&& statusJson.state === 'active'
		&& statusJson.expires_at === firstJson.expires_at);

	const expiredStart = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;
	db.prepare('UPDATE device_trials SET started_at = ?, expires_at = ?').run(expiredStart, expiredStart + 7 * 24 * 60 * 60);
	const expiredRetry = await Worker.fetch(startRequest(), testEnv, ctx);
	const expiredJson = await expiredRetry.json();
	check('已过期设备重试得到 409', expiredRetry.status === 409 && expiredJson.error === 'trial_already_used');
	check('过期重试没有改写原到期时间', expiredJson.expires_at === expiredStart + 7 * 24 * 60 * 60);
}

console.log('\nTest 4c: 1.1.49 本地试用迁移保留原窗口，普通 AI 请求不能偷开试用');
{
	const { db, database } = d1();
	const testEnv = env(database, { ANCHOR_SALT: 'trial-migration-salt' });
	const nowSec = Math.floor(Date.now() / 1000);
	const legacyStart = nowSec - 2 * 24 * 60 * 60;
	const legacyExpires = legacyStart + 7 * 24 * 60 * 60;
	const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.45' };
	const migrated = await Worker.fetch(request('/trial/start', {
		method: 'POST', headers, body: JSON.stringify({
			deviceId: 'legacy-device', legacyStartedAt: legacyStart, legacyExpiresAt: legacyExpires,
		}),
	}), testEnv, ctx);
	const migratedJson = await migrated.json();
	check('旧试用迁移成功且不从升级日重新计时', migrated.status === 200
		&& migratedJson.started_at === legacyStart
		&& migratedJson.expires_at === legacyExpires);

	const invalid = await Worker.fetch(request('/trial/start', {
		method: 'POST', headers, body: JSON.stringify({
			deviceId: 'invalid-legacy', legacyStartedAt: legacyStart, legacyExpiresAt: legacyExpires + 1,
		}),
	}), testEnv, ctx);
	check('伪造非 7 天旧窗口被拒绝且不落库', invalid.status === 400
		&& count(db, "SELECT COUNT(*) AS n FROM device_trials WHERE anchor != ?", await AI.makeTrialAnchor('legacy-device', 'trial-migration-salt')) === 0);

	const generate = await AI.handleAIGenerate(request('/ai/generate', {
		method: 'POST', headers, body: JSON.stringify({
			feature: 'weekly', messages: [{ role: 'user', content: 'x' }],
			deviceId: 'generate-cannot-start', trial: true, stream: false,
		}),
	}), testEnv, ctx);
	check('普通 AI 请求即使伪造 trial:true 也不能开启试用', generate.status === 403
		&& count(db, 'SELECT COUNT(*) AS n FROM device_trials') === 1);
}

function freeIdentity(i, ipAnchor = 'shared-ip') {
	return {
		tier: 'free', subjectType: 'free', subjectId: `subject-${i}`, freeAnchor: `subject-${i}`,
		ipAnchor, sessionId: `session-${i}`, trialExpiresAt: null, trialStartedAt: null,
	};
}
const period = '2026-08';
const now = Date.parse('2026-08-27T04:00:00Z');

console.log('\nTest 5: 免费 IP 月上限在并发轮换 device/session 下不超过 10');
{
	const { db, database } = d1();
	const results = await Promise.all(Array.from({ length: 16 }, (_, i) => AI.reserveUsage(database, freeIdentity(i), 'daily_insight', period, 1, now)));
	check('ai_usage 计入的独立单位恰为 10', count(db, "SELECT COUNT(DISTINCT COALESCE(session_id, id)) AS n FROM ai_usage WHERE ip_anchor = 'shared-ip' AND period = ?", period) === 10);
	check('10 个预占成功', results.filter((x) => !(x instanceof Response)).length === 10);
	check('6 个请求被 IP 上限拒绝', results.filter((x) => x instanceof Response && x.status === 429).length === 6);
}

console.log('\nTest 6: IP 上限与 feature 上限的拒绝信息不混淆');
{
	const { db, database } = d1();
	for (let i = 0; i < 9; i += 1) await AI.reserveUsage(database, freeIdentity(i), 'daily_insight', period, 1, now);
	const ipRace = await Promise.all([10, 11].map((i) => AI.reserveUsage(database, freeIdentity(i), 'daily_insight', period, 1, now)));
	const ipRejected = ipRace.find((x) => x instanceof Response);
	check('IP 原子竞争失败返回 429', ipRejected instanceof Response && ipRejected.status === 429);
	check('IP 原子竞争失败标明 scope: ip', (await ipRejected.json()).scope === 'ip');

	const { db: featureDb, database: featureDatabase } = d1();
	const one = { ...freeIdentity('feature-a', 'feature-ip'), sessionId: 'feature-1' };
	for (let i = 0; i < 2; i += 1) await AI.reserveUsage(featureDatabase, { ...one, sessionId: `feature-${i}` }, 'daily_insight', period, 1, now);
	const featureRace = await Promise.all([2, 3].map((i) => AI.reserveUsage(featureDatabase, { ...one, sessionId: `feature-${i}` }, 'daily_insight', period, 1, now)));
	const featureRejected = featureRace.find((x) => x instanceof Response);
	check('feature 原子竞争失败返回 429', featureRejected instanceof Response && featureRejected.status === 429);
	const featureBody = await featureRejected.json();
	check('feature 配额失败不带 scope: ip', !Object.hasOwn(featureBody, 'scope'));
	check('feature 配额最终只计 3 个单位', count(featureDb, "SELECT COUNT(DISTINCT COALESCE(session_id, id)) AS n FROM ai_usage WHERE subject_id = 'subject-feature-a'",) === 3);
}

console.log('\nTest 7: session 的第 12 条并发边界严格原子化');
{
	const { db, database } = d1();
	const identity = { ...freeIdentity('session-cap', 'session-cap-ip'), sessionId: 'same-session' };
	for (let i = 0; i < 11; i += 1) {
		db.prepare(`INSERT INTO ai_usage (id, subject_type, subject_id, feature, period, created_at, input_tokens, output_tokens, session_id, ip_anchor)
			VALUES (?, 'free', 'subject-session-cap', 'daily_insight', ?, ?, 1, 0, 'same-session', 'session-cap-ip')`)
			.run(`seed-${i}`, period, Math.floor(now / 1000));
	}
	const results = await Promise.all(Array.from({ length: 3 }, () => AI.reserveUsage(database, identity, 'daily_insight', period, 1, now)));
	check('三个边界请求都完成预占', results.every((x) => !(x instanceof Response)));
	check('同一 session 严格最多 12 行', count(db, "SELECT COUNT(*) AS n FROM ai_usage WHERE session_id = 'same-session'") === 12);
	check('超出 session 上限的两条请求独立计量', count(db, "SELECT COUNT(*) AS n FROM ai_usage WHERE session_id IS NULL") === 2);
}

console.log('\nTest 8: 免费画像只成功一次，同月与跨月都不重置');
{
	const { db, database } = d1();
	const first = await AI.reserveUsage(database, { ...freeIdentity('profile', 'profile-ip'), sessionId: 'profile-1' }, 'profile', '2026-08', 1, now);
	const sameMonth = await AI.reserveUsage(database, { ...freeIdentity('profile', 'profile-ip'), sessionId: 'profile-2' }, 'profile', '2026-08', 1, now);
	const nextMonth = await AI.reserveUsage(database, { ...freeIdentity('profile', 'profile-ip'), sessionId: 'profile-3' }, 'profile', '2026-09', 1, Date.parse('2026-09-27T04:00:00Z'));

	check('免费主体第一次画像预占成功', !(first instanceof Response));
	check('同月第二次画像返回 429', sameMonth instanceof Response && sameMonth.status === 429);
	check('跨月第二次画像仍返回 429', nextMonth instanceof Response && nextMonth.status === 429);
	check('跨月后历史成功记录仍只有一条', count(db, "SELECT COUNT(*) AS n FROM ai_usage WHERE subject_id = 'subject-profile' AND feature = 'profile'") === 1);
	const body = await nextMonth.json();
	check('一次性配额拒绝不声称未来会重置', body.limit === 1 && body.resets_at === null);
}

console.log('\nTest 8b: 总 token 护栏跨 feature 且在并发边界原子生效');
{
	const { db, database } = d1();
	const nowSec = Math.floor(now / 1000);
	const identity = {
		...freeIdentity('token-budget', 'token-budget-ip'),
		tier: 'trial',
		subjectId: 'subject-token-budget',
		trialStartedAt: nowSec - 3600,
		trialExpiresAt: nowSec + 6 * 24 * 60 * 60,
		sessionId: null,
	};
	db.prepare(`INSERT INTO ai_usage
		(id, subject_type, subject_id, feature, period, created_at, input_tokens, output_tokens, session_id, ip_anchor)
		VALUES ('token-seed', 'free', 'subject-token-budget', 'weekly', ?, ?, 748000, 1000, NULL, 'token-budget-ip')`)
		.run(period, nowSec);
	const results = await Promise.all([
		AI.reserveUsage(database, identity, 'daily_insight', period, 2000, now),
		AI.reserveUsage(database, identity, 'chat', period, 2000, now),
	]);
	check('伪造不同 feature 仍共享同一总量边界', results.filter((result) => !(result instanceof Response)).length === 1);
	const rejected = results.find((result) => result instanceof Response);
	check('越过总量边界的并发请求返回明确 429', rejected instanceof Response
		&& rejected.status === 429
		&& (await rejected.json()).error === 'fair_use_limit_reached');
	check('成功请求先原子预占 8192 输出 token', count(db,
		"SELECT COUNT(*) AS n FROM ai_usage WHERE subject_id = 'subject-token-budget' AND output_tokens = 8192") === 1);
}

console.log('\nTest 9: 失败回滚后可重试，配额查询与实际生成一致');
{
	const { db, database } = d1();
	const salt = 'profile-retry-salt';
	const testEnv = env(database, { ANCHOR_SALT: salt });
	const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.33' };
	const body = {
		feature: 'profile',
		messages: [{ role: 'user', content: '请根据这些日记生成首次画像。' }],
		deviceId: 'profile-retry-device',
		sessionId: 'profile-retry-session',
		stream: false,
	};
	const quotaUrl = '/ai/quota?deviceId=profile-retry-device';
	const before = await AI.handleAIQuota(request(quotaUrl, { headers }), testEnv);
	const beforeJson = await before.json();
	check('生成前查询显示免费画像尚未使用', beforeJson.features.profile.used === 0 && beforeJson.features.profile.limit === 1);

	const originalFetch = globalThis.fetch;
	try {
		globalThis.fetch = async () => new Response('{"error":"upstream failed"}', { status: 500 });
		const failed = await AI.handleAIGenerate(request('/ai/generate', {
			method: 'POST', headers, body: JSON.stringify(body),
		}), testEnv, ctx);
		check('上游失败返回 502', failed.status === 502);
		check('失败后预占已回滚', count(db, "SELECT COUNT(*) AS n FROM ai_usage WHERE feature = 'profile'") === 0);
		const afterFailure = await AI.handleAIQuota(request(quotaUrl, { headers }), testEnv);
		check('失败后查询仍显示可用', (await afterFailure.json()).features.profile.used === 0);

		globalThis.fetch = async () => Response.json({
			choices: [{ message: { content: '' } }],
			usage: { prompt_tokens: 10, completion_tokens: 0 },
		});
		const empty = await AI.handleAIGenerate(request('/ai/generate', {
			method: 'POST', headers, body: JSON.stringify(body),
		}), testEnv, ctx);
		check('空画像响应返回 502 且不消耗终身一次额度', empty.status === 502
			&& count(db, "SELECT COUNT(*) AS n FROM ai_usage WHERE feature = 'profile'") === 0);

		globalThis.fetch = async () => new Response(new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('{"choices":'));
				controller.error(new DOMException('The operation was aborted', 'AbortError'));
			},
		}));
		const interrupted = await AI.handleAIGenerate(request('/ai/generate', {
			method: 'POST', headers, body: JSON.stringify(body),
		}), testEnv, ctx);
		check('缓冲响应中断返回 502 且释放预占', interrupted.status === 502
			&& count(db, "SELECT COUNT(*) AS n FROM ai_usage WHERE feature = 'profile'") === 0);

		let upstreamBody;
		globalThis.fetch = async (_url, init) => {
			upstreamBody = JSON.parse(init.body);
			return Response.json({
				choices: [{ message: { content: '画像完成' } }],
				usage: { prompt_tokens: 10, completion_tokens: 4 },
			});
		};
		const retried = await AI.handleAIGenerate(request('/ai/generate', {
			method: 'POST', headers, body: JSON.stringify(body),
		}), testEnv, ctx);
		check('失败后的重试成功', retried.status === 200);
		check('上游每次输出硬限制为 8192 token', upstreamBody.max_tokens === 8192);
		check('V4 显式关闭思考模式，输出额度留给用户可见正文', upstreamBody.thinking?.type === 'disabled');
		const afterSuccess = await AI.handleAIQuota(request(quotaUrl, { headers }), testEnv);
		const afterSuccessJson = await afterSuccess.json();
		check('成功后查询显示一次已用且永不重置', afterSuccessJson.features.profile.used === 1
			&& afterSuccessJson.features.profile.limit === 1
			&& afterSuccessJson.features.profile.resets_at === null);

		const rejected = await AI.handleAIGenerate(request('/ai/generate', {
			method: 'POST', headers, body: JSON.stringify({ ...body, sessionId: 'profile-second-attempt' }),
		}), testEnv, ctx);
		check('成功后实际生成与查询一致地拒绝', rejected.status === 429);
	} finally {
		globalThis.fetch = originalFetch;
	}
}

console.log('\nTest 10: 旧画像记录算已使用，trial / Pro 行为不变');
{
	const { db, database } = d1();
	db.prepare(`INSERT INTO ai_usage
		(id, subject_type, subject_id, feature, period, created_at, input_tokens, output_tokens, session_id, ip_anchor)
		VALUES ('old-profile', 'free', 'subject-old-profile', 'profile', '2026-01', ?, 10, 10, NULL, 'old-profile-ip')`)
		.run(Math.floor(Date.parse('2026-01-10T04:00:00Z') / 1000));
	const oldIdentity = { ...freeIdentity('old-profile', 'old-profile-ip'), sessionId: 'new-profile-session' };
	const oldRejected = await AI.reserveUsage(database, oldIdentity, 'profile', '2026-08', 1, now);
	check('旧 ai_usage 中的成功画像阻止新画像', oldRejected instanceof Response && oldRejected.status === 429);

	const trialIdentity = { ...freeIdentity('trial-profile', null), tier: 'trial', sessionId: 'trial-profile-1' };
	const trialFirst = await AI.reserveUsage(database, trialIdentity, 'profile', '2026-08', 1, now);
	const trialSecond = await AI.reserveUsage(database, { ...trialIdentity, sessionId: 'trial-profile-2' }, 'profile', '2026-09', 1, now);
	check('trial 画像仍可多次生成', !(trialFirst instanceof Response) && !(trialSecond instanceof Response));

	const proIdentity = { ...freeIdentity('pro-profile', null), tier: 'pro', subjectType: 'license', sessionId: 'pro-profile-1' };
	const proFirst = await AI.reserveUsage(database, proIdentity, 'profile', '2026-08', 1, now);
	const proSecond = await AI.reserveUsage(database, { ...proIdentity, sessionId: 'pro-profile-2' }, 'profile', '2026-09', 1, now);
	check('Pro 画像仍可多次生成', !(proFirst instanceof Response) && !(proSecond instanceof Response));
}

for (const built of [builtAi, builtWorker]) fs.unlinkSync(built.output);
console.log(`\n=== Results: ${passed} passed, 0 failed ===`);
