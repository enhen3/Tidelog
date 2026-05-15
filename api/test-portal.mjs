/**
 * End-to-end tests for the portal self-serve endpoints.
 *
 * How it works:
 *   1. Applies the D1 schema locally (schema.sql + migration-v2.sql)
 *   2. Starts a local Cloudflare Worker via wrangler unstable_dev
 *   3. Seeds a test license via POST /admin/generate
 *   4. Exercises POST /portal/lookup and POST /portal/unbind
 *   5. Stops the worker and reports results
 *
 * Run from the api/ directory:
 *   node test-portal.mjs
 */

import { unstable_dev } from 'wrangler';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── colours ──────────────────────────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

let passed = 0;
let failed = 0;

function assert(label, condition, extra = '') {
	if (condition) {
		console.log(`  ${GREEN}✓${RESET} ${label}`);
		passed++;
	} else {
		console.log(`  ${RED}✗${RESET} ${label}${extra ? ' — ' + extra : ''}`);
		failed++;
	}
}

// ── D1 local init ─────────────────────────────────────────────────────────────
function initLocalDb() {
	console.log(`\n${YELLOW}▶ Initialising local D1...${RESET}`);
	const opts = { cwd: __dirname, stdio: 'pipe' };

	const schema = spawnSync('npx', [
		'wrangler', 'd1', 'execute', 'tidelog-license-db',
		'--local', '--file=schema.sql',
	], opts);

	const migration = spawnSync('npx', [
		'wrangler', 'd1', 'execute', 'tidelog-license-db',
		'--local', '--file=migration-v2.sql',
	], opts);

	const migrationV3 = spawnSync('npx', [
		'wrangler', 'd1', 'execute', 'tidelog-license-db',
		'--local', '--file=migration-v3.sql',
	], opts);

	if (schema.status !== 0 && migration.status !== 0 && migrationV3.status !== 0) {
		// Schema might already exist — that's OK.
		// Just warn and continue.
		console.log(`  ${YELLOW}⚠ DB init returned non-zero — schema may already exist, continuing.${RESET}`);
	} else {
		console.log(`  ${GREEN}✓ D1 schema applied${RESET}`);
	}
}

// ── worker helpers ────────────────────────────────────────────────────────────
// Use Node.js http module directly to bypass system proxy settings.
function httpRequest(worker, method, urlPath, body = null, extraHeaders = {}) {
	return new Promise((resolve, reject) => {
		const bodyStr = body !== null ? JSON.stringify(body) : null;
		const opts = {
			hostname: worker.address,
			port: worker.port,
			path: urlPath,
			method,
			headers: {
				...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
				...extraHeaders,
			},
		};
		const req = http.request(opts, (res) => {
			let data = '';
			res.on('data', chunk => { data += chunk; });
			res.on('end', () => resolve({ status: res.statusCode, text: data }));
		});
		req.on('error', reject);
		if (bodyStr) req.write(bodyStr);
		req.end();
	});
}

async function post(worker, urlPath, body, headers = {}) {
	const { text } = await httpRequest(worker, 'POST', urlPath, body, headers);
	return JSON.parse(text);
}

async function get(worker, urlPath) {
	const { text } = await httpRequest(worker, 'GET', urlPath);
	return text;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
	console.log(`\n${BOLD}TideLog — Portal Endpoint Tests${RESET}`);
	console.log('─'.repeat(48));

	initLocalDb();

	console.log(`\n${YELLOW}▶ Starting local Worker...${RESET}`);
	let worker;
	try {
		worker = await unstable_dev('src/index.ts', {
			experimental: { disableExperimentalWarning: true },
			vars: { ADMIN_TOKEN: 'test-token-portal-123' },
			local: true,
			logLevel: 'error',
		});
		console.log(`  ${GREEN}✓ Worker started${RESET}`);
	} catch (err) {
		console.error(`  ${RED}✗ Failed to start worker: ${err.message}${RESET}`);
		process.exit(1);
	}

	const ADMIN_HEADERS = { Authorization: 'Bearer test-token-portal-123' };
	const testRunId = Date.now().toString(36);
	const testEmail = `portal-test-${testRunId}@example.com`;
	const testOrderId = `ORDER-TEST-${testRunId}`;

	try {
		// ── Seed: generate a license with email + orderId ─────────────────────
		console.log(`\n${YELLOW}▶ Seeding test data...${RESET}`);
		const seedRes = await post(worker, '/admin/generate', {
			count: 1,
			licenseType: 'lifetime',
			email: testEmail,
			orderId: testOrderId,
		}, ADMIN_HEADERS);

		assert('Admin generate succeeded', seedRes.success === true, JSON.stringify(seedRes));
		const testKey = seedRes.keys?.[0];
		assert('Generated key looks valid', testKey && testKey.startsWith('TL-'), testKey);

		// Bind two devices to the license
		if (testKey) {
			await post(worker, '/license/activate', { key: testKey, deviceId: 'dev-alpha-001' });
			await post(worker, '/license/activate', { key: testKey, deviceId: 'dev-beta-002' });
		}

		// ── Test 1: correct email + orderId returns license ───────────────────
		console.log(`\n${YELLOW}▶ Test: lookup with correct credentials${RESET}`);
		const lookupOk = await post(worker, '/portal/lookup', {
			email: testEmail,
			orderId: testOrderId,
		});
		assert('Returns success: true', lookupOk.success === true, JSON.stringify(lookupOk));
		assert('Returns at least 1 license', Array.isArray(lookupOk.licenses) && lookupOk.licenses.length >= 1);
		const lic = lookupOk.licenses?.[0];
		assert('License key matches generated key', lic?.key === testKey);
		assert('License has 2 devices', lic?.devices?.length === 2, `got ${lic?.devices?.length}`);

		// ── Test 2: wrong email returns empty ─────────────────────────────────
		console.log(`\n${YELLOW}▶ Test: lookup with wrong email${RESET}`);
		const lookupBadEmail = await post(worker, '/portal/lookup', {
			email: 'wrong@example.com',
			orderId: testOrderId,
		});
		assert('Wrong email → success: false', lookupBadEmail.success === false);
		assert('No licenses array on failure', !lookupBadEmail.licenses || lookupBadEmail.licenses.length === 0);

		// ── Test 3: wrong orderId returns empty ───────────────────────────────
		console.log(`\n${YELLOW}▶ Test: lookup with wrong orderId${RESET}`);
		const lookupBadOrder = await post(worker, '/portal/lookup', {
			email: testEmail,
			orderId: 'ORDER-WRONG-0000',
		});
		assert('Wrong orderId → success: false', lookupBadOrder.success === false);

		// ── Test 4: email normalisation (mixed-case) ──────────────────────────
		console.log(`\n${YELLOW}▶ Test: email case normalisation${RESET}`);
		const lookupCase = await post(worker, '/portal/lookup', {
			email: testEmail.toUpperCase(),
			orderId: testOrderId,
		});
		assert('Mixed-case email still finds license', lookupCase.success === true && lookupCase.licenses?.length >= 1);

		// ── Test 5: unbind a device ───────────────────────────────────────────
		console.log(`\n${YELLOW}▶ Test: unbind a device${RESET}`);
		const unbindOk = await post(worker, '/portal/unbind', {
			email: testEmail,
			orderId: testOrderId,
			deviceId: 'dev-alpha-001',
		});
		assert('Unbind returns success: true', unbindOk.success === true, JSON.stringify(unbindOk));
		assert('remainingDevices is 1', unbindOk.remainingDevices === 1, `got ${unbindOk.remainingDevices}`);

		// Verify device list shrank
		const lookupAfterUnbind = await post(worker, '/portal/lookup', {
			email: testEmail,
			orderId: testOrderId,
		});
		const devs = lookupAfterUnbind.licenses?.[0]?.devices ?? [];
		assert('Device list now has 1 entry', devs.length === 1, `got ${devs.length}`);
		assert('Remaining device is dev-beta-002', devs[0]?.deviceId === 'dev-beta-002', `got ${devs[0]?.deviceId}`);

		// ── Test 6: unbind device not on license ──────────────────────────────
		console.log(`\n${YELLOW}▶ Test: unbind device not belonging to this license${RESET}`);
		const unbindWrong = await post(worker, '/portal/unbind', {
			email: testEmail,
			orderId: testOrderId,
			deviceId: 'dev-alpha-001', // already unbound
		});
		assert('Unbind unknown device → success: false', unbindWrong.success === false);

		// ── Test 7: unbind with wrong credentials ─────────────────────────────
		console.log(`\n${YELLOW}▶ Test: unbind with wrong orderId${RESET}`);
		const unbindBadAuth = await post(worker, '/portal/unbind', {
			email: testEmail,
			orderId: 'ORDER-WRONG',
			deviceId: 'dev-beta-002',
		});
		assert('Wrong credentials → success: false', unbindBadAuth.success === false);

		// ── Test 8: portal HTML page returns HTML ─────────────────────────────
		console.log(`\n${YELLOW}▶ Test: GET /portal returns HTML${RESET}`);
		const html = await get(worker, '/portal');
		assert('Portal page contains DOCTYPE', html.includes('<!DOCTYPE html>'));
		assert('Portal page contains TideLog', html.includes('TideLog'));
		assert('Portal page has lookup form', html.includes('portal/lookup'));

		const htmlEn = await get(worker, '/portal?lang=en');
		assert('English portal page has English text', htmlEn.includes('Look up'));

	} finally {
		await worker.stop();
	}

	// ── Results ───────────────────────────────────────────────────────────────
	const total = passed + failed;
	console.log('\n' + '─'.repeat(48));
	if (failed === 0) {
		console.log(`${GREEN}${BOLD}All ${total} tests passed ✓${RESET}`);
	} else {
		console.log(`${RED}${BOLD}${failed}/${total} tests FAILED${RESET}`);
		process.exit(1);
	}
}

main().catch(err => {
	console.error(`\n${RED}Unhandled error: ${err.message}${RESET}`);
	console.error(err.stack);
	process.exit(1);
});
