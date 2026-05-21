/**
 * End-to-end tests for Xiaohongshu fulfilment endpoints.
 *
 * Run from the api/ directory:
 *   node test-xhs-fulfillment.mjs
 */

import { unstable_dev } from 'wrangler';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

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

function initLocalDb() {
	console.log(`\n${YELLOW}▶ Initialising local D1...${RESET}`);
	const opts = { cwd: __dirname, stdio: 'pipe' };
	for (const file of ['schema.sql', 'migration-v2.sql', 'migration-v3.sql', 'migration-v4.sql']) {
		spawnSync('npx', [
			'wrangler', 'd1', 'execute', 'tidelog-license-db',
			'--local', `--file=${file}`,
		], opts);
	}
	console.log(`  ${GREEN}✓ D1 schema applied${RESET}`);
}

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
	const { status, text } = await httpRequest(worker, 'POST', urlPath, body, headers);
	return { status, data: JSON.parse(text) };
}

async function get(worker, urlPath, headers = {}) {
	return await httpRequest(worker, 'GET', urlPath, null, headers);
}

async function main() {
	console.log(`\n${BOLD}TideLog — Xiaohongshu Fulfilment Tests${RESET}`);
	console.log('─'.repeat(56));

	initLocalDb();

	console.log(`\n${YELLOW}▶ Starting local Worker...${RESET}`);
	let worker;
	try {
		worker = await unstable_dev('src/index.ts', {
			experimental: { disableExperimentalWarning: true },
			vars: {
				ADMIN_TOKEN: 'test-token-xhs-123',
				CLAIM_BASE_URL: 'https://tidelog-api.mydreamchronicle.com/xhs/claim',
			},
			local: true,
			logLevel: 'error',
		});
		console.log(`  ${GREEN}✓ Worker started${RESET}`);
	} catch (err) {
		console.error(`  ${RED}✗ Failed to start worker: ${err.message}${RESET}`);
		process.exit(1);
	}

	const ADMIN_HEADERS = { Authorization: 'Bearer test-token-xhs-123' };
	const testRunId = Date.now().toString(36);
	const lifetimeOrder = `XHS-LIFE-${testRunId}`;
	const annualOrder = `XHS-ANNUAL-${testRunId}`;
	const email = `buyer-${testRunId}@example.com`;

	try {
		console.log(`\n${YELLOW}▶ Test: admin page and auth${RESET}`);
		const adminHtml = await get(worker, '/admin/xhs');
		assert('Admin page returns HTML', adminHtml.text.includes('小红书发码后台'));

		const stateNoAuth = await get(worker, '/admin/xhs/state');
		assert('Admin state without token is rejected', stateNoAuth.status === 401, `got ${stateNoAuth.status}`);

		console.log(`\n${YELLOW}▶ Test: unimported order is not fulfilled${RESET}`);
		const unimported = await post(worker, '/xhs/claim', {
			orderId: `XHS-MISSING-${testRunId}`,
			email,
		});
		assert('Unimported order returns pending code', unimported.data.success === false && unimported.data.code === 'order_pending', JSON.stringify(unimported.data));

		console.log(`\n${YELLOW}▶ Test: import lifetime order${RESET}`);
		const importLifetime = await post(worker, '/admin/xhs/import', {
			ordersText: lifetimeOrder,
			licenseType: 'lifetime',
			productType: 'tidelog-pro-xhs',
		}, ADMIN_HEADERS);
		assert('Import lifetime order succeeds', importLifetime.data.success === true, JSON.stringify(importLifetime.data));
		assert('Import count is 1', importLifetime.data.imported === 1, JSON.stringify(importLifetime.data));

		console.log(`\n${YELLOW}▶ Test: first claim generates a key even when email is not configured${RESET}`);
		const firstClaim = await post(worker, '/xhs/claim', { orderId: lifetimeOrder, email });
		const lifetimeKey = firstClaim.data.licenseKey;
		assert('First claim succeeds', firstClaim.data.success === true, JSON.stringify(firstClaim.data));
		assert('Generated key looks valid', typeof lifetimeKey === 'string' && lifetimeKey.startsWith('TL-'), lifetimeKey);
		assert('Email failure does not block claim', firstClaim.data.emailSent === false, JSON.stringify(firstClaim.data));
		assert('License type is lifetime', firstClaim.data.licenseType === 'lifetime');

		console.log(`\n${YELLOW}▶ Test: repeat claim is idempotent${RESET}`);
		const repeatClaim = await post(worker, '/xhs/claim', { orderId: lifetimeOrder, email: email.toUpperCase() });
		assert('Repeat claim succeeds', repeatClaim.data.success === true && repeatClaim.data.alreadyClaimed === true, JSON.stringify(repeatClaim.data));
		assert('Repeat returns same key', repeatClaim.data.licenseKey === lifetimeKey);

		console.log(`\n${YELLOW}▶ Test: different email cannot take claimed order${RESET}`);
		const wrongEmail = await post(worker, '/xhs/claim', {
			orderId: lifetimeOrder,
			email: `other-${testRunId}@example.com`,
		});
		assert('Different email is rejected', wrongEmail.status === 409 && wrongEmail.data.code === 'email_mismatch', JSON.stringify(wrongEmail.data));

		console.log(`\n${YELLOW}▶ Test: generated key activates through existing license API${RESET}`);
		const activation = await post(worker, '/license/activate', {
			key: lifetimeKey,
			deviceId: `dev-xhs-${testRunId}`,
		});
		assert('License activation succeeds', activation.data.success === true, JSON.stringify(activation.data));

		console.log(`\n${YELLOW}▶ Test: portal lookup can recover claimed XHS license${RESET}`);
		const portal = await post(worker, '/portal/lookup', {
			email,
			orderId: lifetimeOrder,
		});
		assert('Portal lookup succeeds', portal.data.success === true, JSON.stringify(portal.data));
		assert('Portal returns same key', portal.data.licenses?.[0]?.key === lifetimeKey);

		console.log(`\n${YELLOW}▶ Test: annual fulfilment uses annual license type${RESET}`);
		const importAnnual = await post(worker, '/admin/xhs/import', {
			orderIds: [annualOrder],
			licenseType: 'annual',
		}, ADMIN_HEADERS);
		assert('Import annual order succeeds', importAnnual.data.success === true, JSON.stringify(importAnnual.data));
		const annualClaim = await post(worker, '/xhs/claim', {
			orderId: annualOrder,
			email: `annual-${testRunId}@example.com`,
		});
		assert('Annual claim succeeds', annualClaim.data.success === true, JSON.stringify(annualClaim.data));
		assert('Annual type returned', annualClaim.data.licenseType === 'annual');
		assert('Annual expiry returned', typeof annualClaim.data.expiresAt === 'number');

		console.log(`\n${YELLOW}▶ Test: template settings and state${RESET}`);
		const template = await post(worker, '/admin/xhs/template', {
			claimTitle: '测试领取标题',
			claimIntro: '测试领取说明',
			supportText: '测试售后说明',
			dmTemplate: '测试私信 {claim_url}',
		}, ADMIN_HEADERS);
		assert('Template save succeeds', template.data.success === true, JSON.stringify(template.data));
		assert('Template expands claim URL', template.data.settings.dmTemplate.includes('/xhs/claim'));

		const state = await get(worker, '/admin/xhs/state', ADMIN_HEADERS);
		const stateData = JSON.parse(state.text);
		assert('Admin state succeeds', stateData.success === true, state.text);
		assert('Admin state includes recent orders', Array.isArray(stateData.recentOrders) && stateData.recentOrders.length >= 2);
		assert('Admin stats count claimed orders', stateData.stats.claimed >= 2, JSON.stringify(stateData.stats));

		console.log(`\n${YELLOW}▶ Test: resend reports email configuration failure safely${RESET}`);
		const resend = await post(worker, '/admin/xhs/resend', { orderId: lifetimeOrder }, ADMIN_HEADERS);
		assert('Resend fails without mail config but does not expose secrets', resend.data.success === false && /configured/i.test(resend.data.error || ''), JSON.stringify(resend.data));

		console.log(`\n${YELLOW}▶ Test: public claim page returns HTML${RESET}`);
		const claimHtml = await get(worker, '/xhs/claim');
		assert('Claim page contains title', claimHtml.text.includes('测试领取标题'));
		assert('Claim page posts to /xhs/claim', claimHtml.text.includes("fetch('/xhs/claim'"));
	} finally {
		await worker.stop();
	}

	const total = passed + failed;
	console.log('\n' + '─'.repeat(56));
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
