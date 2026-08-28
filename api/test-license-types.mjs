/**
 * License-plan regression tests. Uses the real Worker module and SQLite-backed
 * D1 adapter so issue, activation, verification, expiry, and admin stats share
 * the production route code.
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import esbuild from '../node_modules/esbuild/lib/main.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(os.tmpdir(), `tidelog-license-types-${Date.now()}-${Math.random()}.mjs`);
esbuild.buildSync({
	stdin: {
		contents: fs.readFileSync(path.join(__dirname, 'src/index.ts'), 'utf8'),
		resolveDir: path.join(__dirname, 'src'), sourcefile: 'index.ts', loader: 'ts',
	},
	outfile: output, bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
});
const Worker = (await import(pathToFileURL(output).href)).default;

let passed = 0;
function check(label, condition) {
	assert.ok(condition, label);
	console.log(`  PASS  ${label}`);
	passed += 1;
}

function d1() {
	const db = new DatabaseSync(':memory:');
	db.exec(`
		CREATE TABLE licenses (
			id INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL, status TEXT DEFAULT 'unused', license_type TEXT DEFAULT 'annual',
			expires_at INTEGER, max_devices INTEGER DEFAULT 3, email TEXT, order_id TEXT, created_at INTEGER
		);
		CREATE TABLE license_devices (license_key TEXT NOT NULL, device_id TEXT NOT NULL, activated_at INTEGER, UNIQUE(license_key, device_id));
		CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
		CREATE TABLE device_trials (anchor TEXT PRIMARY KEY, ip_hash TEXT NOT NULL, started_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
		CREATE TABLE ai_usage (id TEXT PRIMARY KEY, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, feature TEXT NOT NULL, period TEXT NOT NULL, created_at INTEGER NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, session_id TEXT, ip_anchor TEXT);
	`);
	return {
		db,
		database: {
			prepare(sql) {
				let params = [];
				const statement = {
					bind(...values) { params = values; return statement; },
					async run() { db.prepare(sql).run(...params); return { meta: { changes: Number(db.prepare('SELECT changes() AS changes').get().changes) } }; },
					async first() { return db.prepare(sql).get(...params) ?? null; },
					async all() { return { results: db.prepare(sql).all(...params) }; },
				};
				return statement;
			},
		},
	};
}

const { db, database } = d1();
const env = { DB: database, ADMIN_TOKEN: 'test-admin', DEEPSEEK_API_KEY: 'test-key', ANCHOR_SALT: 'license-types-salt' };
const ctx = { waitUntil() {} };
async function call(pathname, body, authorization = true) {
	const response = await Worker.fetch(new Request(`https://api.test${pathname}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: 'Bearer test-admin' } : {}) },
		body: JSON.stringify(body),
	}), env, ctx);
	return { response, body: await response.json() };
}

console.log('\nLicense type regression tests');

const missing = await call('/admin/generate', { count: 1 });
check('missing licenseType is rejected', missing.response.status === 400 && missing.body.error.includes('Missing license type'));
check('missing licenseType creates no license', Number(db.prepare('SELECT COUNT(*) AS n FROM licenses').get().n) === 0);

const discontinued = await call('/admin/generate', { count: 1, licenseType: 'lifetime' });
check('new lifetime issuance is rejected with a discontinued-plan error', discontinued.response.status === 400 && discontinued.body.error.includes('no longer sold'));

const monthly = await call('/admin/generate', { count: 1, licenseType: 'monthly' });
check('monthly license is issued', monthly.response.status === 200 && monthly.body.success === true && monthly.body.licenseType === 'monthly');
const monthlyKey = monthly.body.keys[0];
const monthlyExpiry = Date.parse(monthly.body.expiresAt) / 1000;
const now = new Date();
const expected = new Date(Date.UTC(
	now.getUTCFullYear(), now.getUTCMonth() + 1, 1,
	now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds(),
));
const lastDayOfTargetMonth = new Date(Date.UTC(expected.getUTCFullYear(), expected.getUTCMonth() + 1, 0)).getUTCDate();
expected.setUTCDate(Math.min(now.getUTCDate(), lastDayOfTargetMonth));
check('monthly expiry is one calendar month from issuance', Math.abs(monthlyExpiry - Math.floor(expected.getTime() / 1000)) <= 2);

const monthlyActivation = await call('/license/activate', { key: monthlyKey, deviceId: 'monthly-device' }, false);
check('monthly license activates', monthlyActivation.response.status === 200 && monthlyActivation.body.success === true && monthlyActivation.body.licenseType === 'monthly');
const monthlyVerify = await call('/license/verify', { key: monthlyKey, deviceId: 'monthly-device' }, false);
check('activated monthly license verifies as valid', monthlyVerify.body.valid === true && monthlyVerify.body.expiresAt === monthlyExpiry);

db.prepare("INSERT INTO licenses (key, status, license_type, expires_at) VALUES ('TL-MONTHLY-EXPIRED', 'unused', 'monthly', ?)").run(Math.floor(Date.now() / 1000) - 1);
const expiredActivation = await call('/license/activate', { key: 'TL-MONTHLY-EXPIRED', deviceId: 'expired-device' }, false);
check('expired monthly license cannot activate', expiredActivation.response.status === 403 && expiredActivation.body.error.includes('expired'));
const expiredVerify = await call('/license/verify', { key: 'TL-MONTHLY-EXPIRED', deviceId: 'expired-device' }, false);
check('expired monthly license verifies as expired', expiredVerify.body.valid === false && expiredVerify.body.status === 'expired');

db.prepare("INSERT INTO licenses (key, status, license_type, expires_at) VALUES ('TL-LEGACY-LIFETIME', 'unused', 'lifetime', NULL)").run();
const legacyActivation = await call('/license/activate', { key: 'TL-LEGACY-LIFETIME', deviceId: 'legacy-device' }, false);
check('existing lifetime license still activates', legacyActivation.response.status === 200 && legacyActivation.body.success === true);
const legacyVerify = await call('/license/verify', { key: 'TL-LEGACY-LIFETIME', deviceId: 'legacy-device' }, false);
check('existing lifetime license still verifies without expiry', legacyVerify.body.valid === true && legacyVerify.body.expiresAt === null);

const list = await Worker.fetch(new Request('https://api.test/admin/list', { headers: { Authorization: 'Bearer test-admin' } }), env, ctx);
const listed = await list.json();
check('admin statistics include monthly licenses', listed.stats.monthly === 2 && listed.stats.lifetime === 1);

fs.unlinkSync(output);
console.log(`\n=== Results: ${passed} passed, 0 failed ===`);
