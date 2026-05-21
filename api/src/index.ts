/**
 * TideLog License API — Cloudflare Worker + D1
 * v2: License types (annual/lifetime) + multi-device (3 devices per key)
 * v3: Self-serve portal (GET /portal, POST /portal/lookup, POST /portal/unbind)
 *
 * Endpoints:
 *   POST /license/activate    — Activate a key + bind device
 *   POST /license/verify      — Check if a key is valid
 *   POST /license/deactivate  — Unbind a device from key
 *   POST /admin/generate      — Batch-generate keys (Admin Token)
 *   GET  /admin/list          — List all keys (Admin Token)
 *   GET  /admin/xhs           — Xiaohongshu fulfilment admin page
 *   GET  /admin/xhs/state     — Xiaohongshu fulfilment state (Admin Token)
 *   POST /admin/xhs/import    — Import Xiaohongshu order IDs (Admin Token)
 *   POST /admin/xhs/template  — Update Xiaohongshu delivery template (Admin Token)
 *   POST /admin/xhs/resend    — Resend a fulfilment email (Admin Token)
 *   GET  /portal              — Self-serve license lookup page (HTML)
 *   POST /portal/lookup       — Lookup licenses by email + orderId
 *   POST /portal/unbind       — Unbind a device (authenticated by email + orderId)
 *   GET  /xhs/claim           — Xiaohongshu buyer claim page
 *   POST /xhs/claim           — Claim a license for an imported Xiaohongshu order
 */

import type { D1Database, ExportedHandler } from '@cloudflare/workers-types';

export interface Env {
	DB: D1Database;
	ADMIN_TOKEN: string;
	RESEND_API_KEY?: string;
	MAIL_FROM?: string;
	MAIL_REPLY_TO?: string;
	CLAIM_BASE_URL?: string;
}

interface LicenseRow {
	id: number;
	key: string;
	status: string;
	license_type: string;
	expires_at: number | null;
	max_devices: number;
	email: string | null;
	order_id: string | null;
	created_at: number;
}

interface DeviceRow {
	license_key: string;
	device_id: string;
	activated_at: number;
}

interface RateLimitRow {
	count: number;
	reset_at: number;
}

interface XhsOrderRow {
	id: number;
	order_id: string;
	product_type: string;
	license_type: string;
	status: string;
	imported_at: number;
	claimed_at: number | null;
	bound_email: string | null;
	license_key: string | null;
	email_sent_at: number | null;
	email_error: string | null;
	last_seen_at: number | null;
}

interface FulfillmentSettingRow {
	key: string;
	value: string;
}

interface FulfillmentSettings {
	claimTitle: string;
	claimIntro: string;
	supportText: string;
	dmTemplate: string;
}

// =============================================================================
// Helpers
// =============================================================================

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		},
	});
}

function error(message: string, status = 400): Response {
	return json({ success: false, error: message }, status);
}

function getClientIp(request: Request): string {
	return request.headers.get('CF-Connecting-IP')
		|| request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
		|| 'unknown';
}

async function sha256Hex(input: string): Promise<string> {
	const bytes = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

async function checkRateLimit(
	request: Request,
	env: Env,
	scope: string,
	limit: number,
	windowSeconds: number,
): Promise<Response | null> {
	const now = Math.floor(Date.now() / 1000);
	const resetAt = Math.floor(now / windowSeconds) * windowSeconds + windowSeconds;
	const clientHash = await sha256Hex(`${scope}:${getClientIp(request)}:${resetAt}`);

	const row = await env.DB.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?')
		.bind(clientHash)
		.first<RateLimitRow>();

	if (!row) {
		await env.DB.prepare('INSERT INTO rate_limits (key, count, reset_at) VALUES (?, ?, ?)')
			.bind(clientHash, 1, resetAt)
			.run();
		return null;
	}

	if (row.count >= limit) {
		return json(
			{ success: false, error: 'Too many requests. Please try again later.', retryAfter: Math.max(1, row.reset_at - now) },
			429,
		);
	}

	await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?')
		.bind(clientHash)
		.run();

	if (Math.random() < 0.01) {
		await env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?')
			.bind(now - 3600)
			.run();
	}

	return null;
}

/** Generate a license key: TL-XXXX-XXXX-XXXX */
function generateKey(): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const segment = () => {
		const bytes = new Uint8Array(4);
		crypto.getRandomValues(bytes);
		return [...bytes].map((byte) => chars[byte & 31]).join('');
	};
	return `TL-${segment()}-${segment()}-${segment()}`;
}

/** Check if a license has expired */
function isExpired(row: LicenseRow): boolean {
	if (row.license_type === 'lifetime' || !row.expires_at) return false;
	return Math.floor(Date.now() / 1000) > row.expires_at;
}

function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

function normalizeOrderId(orderId: string): string {
	return orderId.trim().replace(/\s+/g, '');
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function getClaimUrl(request: Request, env: Env): string {
	if (env.CLAIM_BASE_URL?.trim()) return env.CLAIM_BASE_URL.trim();
	const url = new URL(request.url);
	return `${url.origin}/xhs/claim`;
}

function isEmailConfigured(env: Env): boolean {
	return !!(env.RESEND_API_KEY?.trim() && env.MAIL_FROM?.trim());
}

function defaultFulfillmentSettings(request: Request, env: Env): FulfillmentSettings {
	const claimUrl = getClaimUrl(request, env);
	const mailCopy = isEmailConfigured(env)
		? '验证成功后，页面会立即显示激活码，并发送一封邮件备份。'
		: '验证成功后，页面会立即显示激活码。请先保存好激活码，之后也可以用订单号和邮箱找回。';
	return {
		claimTitle: '领取 TideLog Pro 激活码',
		claimIntro: `请填写小红书订单号和接收邮箱。${mailCopy}`,
		supportText: '如果订单刚支付完成但还无法领取，请稍后再试，或在小红书私信发送订单号和报错截图。',
		dmTemplate: `你好，感谢购买 TideLog Pro。请复制你的小红书订单号，打开 ${claimUrl}，填写订单号和邮箱领取激活码。激活路径：Obsidian → Settings → TideLog → Pro。遇到问题请私信：订单号 + 报错截图。`,
	};
}

async function getFulfillmentSettings(request: Request, env: Env): Promise<FulfillmentSettings> {
	const defaults = defaultFulfillmentSettings(request, env);
	try {
		const { results } = await env.DB.prepare(
			'SELECT key, value FROM fulfillment_settings WHERE key IN (?, ?, ?, ?)'
		).bind('claimTitle', 'claimIntro', 'supportText', 'dmTemplate').all<FulfillmentSettingRow>();

		const settings = { ...defaults };
		for (const row of results) {
			if (row.key === 'claimTitle') settings.claimTitle = row.value;
			if (row.key === 'claimIntro') settings.claimIntro = row.value;
			if (row.key === 'supportText') settings.supportText = row.value;
			if (row.key === 'dmTemplate') settings.dmTemplate = row.value.replaceAll('{claim_url}', getClaimUrl(request, env));
		}
		return settings;
	} catch {
		return defaults;
	}
}

async function saveFulfillmentSettings(env: Env, settings: Partial<FulfillmentSettings>): Promise<void> {
	const updates = Object.entries(settings).filter(([, value]) => typeof value === 'string' && value.trim());
	for (const [key, value] of updates) {
		await env.DB.prepare(
			`INSERT INTO fulfillment_settings (key, value, updated_at)
			 VALUES (?, ?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
		).bind(key, value.trim(), nowSeconds()).run();
	}
}

async function logClaimEvent(
	env: Env,
	orderId: string,
	eventType: string,
	email: string | null,
	licenseKey: string | null,
	detail: string | null = null,
): Promise<void> {
	try {
		await env.DB.prepare(
			`INSERT INTO xhs_claim_events (order_id, event_type, email, license_key, detail)
			 VALUES (?, ?, ?, ?, ?)`
		).bind(orderId, eventType, email, licenseKey, detail).run();
	} catch {
		// Audit logging must never block a paid customer from receiving a key.
	}
}

function calculateExpiresAt(licenseType: string): number | null {
	return licenseType === 'annual'
		? nowSeconds() + 365 * 24 * 60 * 60
		: null;
}

function buildLicenseEmailText(licenseKey: string, orderId: string, licenseType: string): string {
	const typeLabel = licenseType === 'annual' ? '年度版' : '终身版';
	return [
		'你好，感谢购买 TideLog Pro。',
		'',
		`小红书订单号：${orderId}`,
		`版本：${typeLabel}`,
		`激活码：${licenseKey}`,
		'',
		'激活路径：Obsidian → Settings → TideLog → Pro，输入激活码后点击激活。',
		'如果遇到问题，请在小红书私信发送订单号和报错截图。',
	].join('\n');
}

function buildLicenseEmailHtml(licenseKey: string, orderId: string, licenseType: string): string {
	const typeLabel = licenseType === 'annual' ? '年度版' : '终身版';
	return `<!DOCTYPE html>
<html lang="zh-CN">
<body style="margin:0;padding:24px;background:#f5f7fa;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e5e7eb;">
    <h1 style="font-size:22px;margin:0 0 8px;color:#2f7f95;">TideLog Pro 激活码</h1>
    <p style="margin:0 0 20px;color:#6b7280;">感谢购买 TideLog Pro。请保存这封邮件，方便之后找回激活码。</p>
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:18px;margin-bottom:18px;">
      <div style="font-size:13px;color:#64748b;margin-bottom:6px;">激活码</div>
      <div style="font-size:24px;letter-spacing:1px;font-weight:700;color:#111827;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(licenseKey)}</div>
    </div>
    <p style="margin:0 0 8px;">小红书订单号：<strong>${escapeHtml(orderId)}</strong></p>
    <p style="margin:0 0 18px;">版本：<strong>${escapeHtml(typeLabel)}</strong></p>
    <p style="margin:0;color:#374151;">激活路径：Obsidian → Settings → TideLog → Pro，输入激活码后点击激活。</p>
  </div>
</body>
</html>`;
}

async function sendLicenseEmail(
	env: Env,
	email: string,
	licenseKey: string,
	orderId: string,
	licenseType: string,
): Promise<{ sent: boolean; error?: string }> {
	if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
		return { sent: false, error: 'Email service is not configured' };
	}

	const text = buildLicenseEmailText(licenseKey, orderId, licenseType);
	const html = buildLicenseEmailHtml(licenseKey, orderId, licenseType);
	const payload: Record<string, unknown> = {
		from: env.MAIL_FROM,
		to: [email],
		subject: '你的 TideLog Pro 激活码',
		text,
		html,
	};
	if (env.MAIL_REPLY_TO) payload.reply_to = env.MAIL_REPLY_TO;

	try {
		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${env.RESEND_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			return { sent: false, error: `Resend returned ${response.status}` };
		}
		return { sent: true };
	} catch (err) {
		return { sent: false, error: err instanceof Error ? err.message : 'Email request failed' };
	}
}

// =============================================================================
// Route Handlers
// =============================================================================

async function handleActivate(request: Request, env: Env): Promise<Response> {
	const body = await request.json<{ key: string; deviceId: string }>();
	const { key, deviceId } = body;

	if (!key || !deviceId) {
		return error('Missing key or deviceId');
	}

	const normalizedKey = key.trim().toUpperCase();

	const row = await env.DB.prepare('SELECT * FROM licenses WHERE key = ?')
		.bind(normalizedKey)
		.first<LicenseRow>();

	if (!row) {
		return error('Invalid license key', 404);
	}

	if (row.status === 'revoked') {
		return error('This license has been revoked', 403);
	}

	// Check expiry for annual licenses
	if (isExpired(row)) {
		return error('This license has expired', 403);
	}

	// Check existing device bindings
	const { results: devices } = await env.DB.prepare(
		'SELECT * FROM license_devices WHERE license_key = ?'
	).bind(normalizedKey).all<DeviceRow>();

	// Already activated on this device?
	const alreadyBound = devices.some(d => d.device_id === deviceId);
	if (alreadyBound) {
		return json({
			success: true,
			status: 'active',
			licenseType: row.license_type,
			expiresAt: row.expires_at,
			deviceCount: devices.length,
			maxDevices: row.max_devices,
			message: 'Already activated on this device',
		});
	}

	// Check device limit
	if (devices.length >= row.max_devices) {
		return error(
			`Device limit reached (${row.max_devices}/${row.max_devices}). Deactivate another device first.`,
			409
		);
	}

	// Bind device
	await env.DB.prepare(
		'INSERT INTO license_devices (license_key, device_id) VALUES (?, ?)'
	).bind(normalizedKey, deviceId).run();

	// Mark license as active
	if (row.status === 'unused') {
		await env.DB.prepare(
			'UPDATE licenses SET status = ? WHERE key = ?'
		).bind('active', normalizedKey).run();
	}

	return json({
		success: true,
		status: 'active',
		licenseType: row.license_type,
		expiresAt: row.expires_at,
		deviceCount: devices.length + 1,
		maxDevices: row.max_devices,
		message: 'License activated successfully',
	});
}

async function handleVerify(request: Request, env: Env): Promise<Response> {
	const body = await request.json<{ key: string; deviceId: string }>();
	const { key, deviceId } = body;

	if (!key || !deviceId) {
		return error('Missing key or deviceId');
	}

	const normalizedKey = key.trim().toUpperCase();

	const row = await env.DB.prepare('SELECT * FROM licenses WHERE key = ?')
		.bind(normalizedKey)
		.first<LicenseRow>();

	if (!row) {
		return json({ success: false, valid: false, error: 'Invalid license key' }, 404);
	}

	// Check expiry
	if (isExpired(row)) {
		return json({
			success: true,
			valid: false,
			status: 'expired',
			licenseType: row.license_type,
			expiresAt: row.expires_at,
		});
	}

	// Check device binding
	const device = await env.DB.prepare(
		'SELECT * FROM license_devices WHERE license_key = ? AND device_id = ?'
	).bind(normalizedKey, deviceId).first<DeviceRow>();

	const valid = row.status === 'active' && !!device;

	return json({
		success: true,
		valid,
		status: row.status,
		licenseType: row.license_type,
		expiresAt: row.expires_at,
		deviceMatch: !!device,
	});
}

async function handleDeactivate(request: Request, env: Env): Promise<Response> {
	const body = await request.json<{ key: string; deviceId: string }>();
	const { key, deviceId } = body;

	if (!key || !deviceId) {
		return error('Missing key or deviceId');
	}

	const normalizedKey = key.trim().toUpperCase();

	// Remove device binding
	const result = await env.DB.prepare(
		'DELETE FROM license_devices WHERE license_key = ? AND device_id = ?'
	).bind(normalizedKey, deviceId).run();

	if (!result.meta.changes || result.meta.changes === 0) {
		return error('Device not found for this license', 404);
	}

	// Check if any devices remain
	const { results: remaining } = await env.DB.prepare(
		'SELECT * FROM license_devices WHERE license_key = ?'
	).bind(normalizedKey).all<DeviceRow>();

	// If no devices left, mark as unused
	if (remaining.length === 0) {
		await env.DB.prepare(
			'UPDATE licenses SET status = ? WHERE key = ?'
		).bind('unused', normalizedKey).run();
	}

	return json({ success: true, message: 'Device deactivated', remainingDevices: remaining.length });
}

async function handleAdminGenerate(request: Request, env: Env): Promise<Response> {
	const body = await request.json<{
		count?: number;
		licenseType?: string;
		email?: string;
		orderId?: string;
	}>();

	const requestedCount = Number.isInteger(body.count) ? body.count as number : 10;
	const count = Math.max(1, Math.min(requestedCount, 500));
	const licenseType = body.licenseType || 'lifetime';
	if (licenseType !== 'annual' && licenseType !== 'lifetime') {
		return error('Invalid license type. Expected annual or lifetime.', 400);
	}

	const email = body.email?.trim().toLowerCase() || null;
	const orderId = body.orderId?.trim() || null;
	const expiresAt = licenseType === 'annual'
		? Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
		: null;

	const keys: string[] = [];

	for (let i = 0; i < count; i++) {
		const key = generateKey();
		await env.DB.prepare(
			'INSERT INTO licenses (key, license_type, expires_at, email, order_id) VALUES (?, ?, ?, ?, ?)'
		).bind(key, licenseType, expiresAt, email, orderId).run();
		keys.push(key);
	}

	return json({
		success: true,
		count: keys.length,
		licenseType,
		expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
		keys,
	});
}

async function handleAdminList(env: Env): Promise<Response> {
	const { results } = await env.DB.prepare(
		'SELECT id, key, status, license_type, expires_at, max_devices, email, order_id, created_at FROM licenses ORDER BY created_at DESC LIMIT 200'
	).all<LicenseRow>();

	// Get device counts per license
	const enriched = await Promise.all(results.map(async (lic) => {
		const { results: devices } = await env.DB.prepare(
			'SELECT device_id, activated_at FROM license_devices WHERE license_key = ?'
		).bind(lic.key).all<DeviceRow>();
		return { ...lic, devices, deviceCount: devices.length };
	}));

	const stats = await env.DB.prepare(
		`SELECT
			COUNT(*) as total,
			SUM(CASE WHEN status = 'unused' THEN 1 ELSE 0 END) as unused,
			SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
			SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) as revoked,
			SUM(CASE WHEN license_type = 'annual' THEN 1 ELSE 0 END) as annual,
			SUM(CASE WHEN license_type = 'lifetime' THEN 1 ELSE 0 END) as lifetime
		 FROM licenses`
	).first<{ total: number; unused: number; active: number; revoked: number; annual: number; lifetime: number }>();

	return json({ success: true, stats, licenses: enriched });
}

// =============================================================================
// Xiaohongshu Fulfilment Handlers
// =============================================================================

async function handleXhsClaimPage(request: Request, env: Env): Promise<Response> {
	const settings = await getFulfillmentSettings(request, env);
	const mailBackupEnabled = isEmailConfigured(env);
	const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(settings.claimTitle)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    padding: 32px 16px;
    color: #1f2937;
    background: radial-gradient(circle at top left, rgba(59,142,165,.18), transparent 34%), #f6f8fb;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .card {
    width: min(100%, 560px);
    margin: 0 auto;
    padding: 28px;
    background: rgba(255,255,255,.94);
    border: 1px solid rgba(59,142,165,.16);
    border-radius: 18px;
    box-shadow: 0 18px 48px rgba(31,41,55,.08);
  }
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:6px; color:#2f7f95; font-weight:700; }
  h1 { margin: 0 0 8px; font-size: 24px; line-height:1.2; }
  .intro { margin: 0 0 22px; color: #667085; line-height: 1.65; font-size: 14px; }
  label { display:block; margin:16px 0 7px; font-size:13px; font-weight:650; color:#344054; }
  input {
    width: 100%;
    border: 1px solid #d7dde6;
    border-radius: 12px;
    padding: 13px 14px;
    font-size: 16px;
    outline: none;
    background: #fff;
  }
  input:focus { border-color:#3b8ea5; box-shadow:0 0 0 4px rgba(59,142,165,.12); }
  button {
    width: 100%;
    border: none;
    border-radius: 12px;
    margin-top: 22px;
    padding: 13px 16px;
    background: #3b8ea5;
    color: white;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
  }
  button:disabled { opacity:.62; cursor:not-allowed; }
  .result { display:none; margin-top:22px; border-radius:14px; padding:16px; line-height:1.6; font-size:14px; }
  .ok { display:block; background:#ecfdf3; border:1px solid #bbf7d0; color:#14532d; }
  .warn { display:block; background:#fffbeb; border:1px solid #fde68a; color:#854d0e; }
  .bad { display:block; background:#fef2f2; border:1px solid #fecaca; color:#991b1b; }
  .license {
    margin: 12px 0;
    padding: 14px;
    border-radius: 12px;
    background: white;
    border: 1px solid rgba(20,83,45,.18);
    font: 700 22px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: .8px;
    color: #111827;
    word-break: break-all;
  }
  .support { margin-top:20px; color:#667085; font-size:13px; line-height:1.6; }
</style>
</head>
<body>
<main class="card">
  <div class="brand">TideLog Pro</div>
  <h1>${escapeHtml(settings.claimTitle)}</h1>
  <p class="intro">${escapeHtml(settings.claimIntro)}</p>

  <label for="orderId">小红书订单号</label>
  <input id="orderId" autocomplete="off" placeholder="粘贴你的小红书订单号">

  <label for="email">接收邮箱</label>
  <input id="email" type="email" autocomplete="email" placeholder="用于接收激活码和之后找回">

  <button id="claimBtn" type="button">领取激活码</button>
  <div id="result" class="result"></div>
  <p class="support">${escapeHtml(settings.supportText)}</p>
</main>
<script>
(function() {
  var mailBackupEnabled = ${mailBackupEnabled ? 'true' : 'false'};
  var btn = document.getElementById('claimBtn');
  var result = document.getElementById('result');
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function show(cls, html) {
    result.className = 'result ' + cls;
    result.innerHTML = html;
  }
  btn.addEventListener('click', function() {
    var orderId = document.getElementById('orderId').value.trim();
    var email = document.getElementById('email').value.trim();
    if (!orderId || !email) {
      show('warn', '请先填写订单号和邮箱。');
      return;
    }
    btn.disabled = true;
    btn.textContent = '正在领取...';
    fetch('/xhs/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: orderId, email: email })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        var mail = data.emailSent
          ? '激活码也已发送到你的邮箱。'
          : (mailBackupEnabled ? '邮件暂未发送成功，请先保存本页激活码。' : '请先保存本页激活码；之后也可以通过邮箱和订单号找回。');
        show('ok',
          '<strong>' + (data.alreadyClaimed ? '这是你已领取过的激活码' : '领取成功') + '</strong>'
          + '<div class="license">' + esc(data.licenseKey) + '</div>'
          + '<div>激活路径：Obsidian → Settings → TideLog → Pro。</div>'
          + '<div>' + mail + '</div>'
        );
      } else {
        var message = data.error || '暂时无法领取，请稍后重试。';
        show(data.code === 'order_pending' ? 'warn' : 'bad', esc(message));
      }
    })
    .catch(function() {
      show('bad', '网络异常，请稍后重试。');
    })
    .finally(function() {
      btn.disabled = false;
      btn.textContent = '领取激活码';
    });
  });
})();
</script>
</body>
</html>`;

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-cache',
		},
	});
}

async function handleXhsClaim(request: Request, env: Env): Promise<Response> {
	const body = await request.json<{ orderId?: string; email?: string }>();
	const orderId = normalizeOrderId(body.orderId || '');
	const email = normalizeEmail(body.email || '');

	if (!orderId || !email || !isValidEmail(email)) {
		return error('请填写正确的订单号和邮箱', 400);
	}

	const order = await env.DB.prepare('SELECT * FROM xhs_orders WHERE order_id = ?')
		.bind(orderId)
		.first<XhsOrderRow>();

	if (!order) {
		await logClaimEvent(env, orderId, 'order_pending', email, null, 'Order is not imported');
		return json({
			success: false,
			code: 'order_pending',
			error: '订单还在同步，请稍后重试；如果一直无法领取，请在小红书私信发送订单号。',
		}, 404);
	}

	if (order.bound_email && normalizeEmail(order.bound_email) !== email) {
		await logClaimEvent(env, orderId, 'email_mismatch', email, order.license_key, 'Claim attempted with a different email');
		return json({
			success: false,
			code: 'email_mismatch',
			error: '这个订单已绑定其他邮箱。为了保护激活码，请使用首次领取时填写的邮箱，或私信订单号处理。',
		}, 409);
	}

	if (order.license_key) {
		await logClaimEvent(env, orderId, 'claim_repeat', email, order.license_key);
		return json({
			success: true,
			alreadyClaimed: true,
			orderId,
			email,
			licenseKey: order.license_key,
			licenseType: order.license_type,
			emailSent: !!order.email_sent_at,
		});
	}

	const licenseType = order.license_type === 'annual' ? 'annual' : 'lifetime';
	const licenseKey = generateKey();
	const expiresAt = calculateExpiresAt(licenseType);

	await env.DB.prepare(
		`INSERT INTO licenses (key, license_type, expires_at, email, order_id)
		 VALUES (?, ?, ?, ?, ?)`
	).bind(licenseKey, licenseType, expiresAt, email, orderId).run();

	const updateResult = await env.DB.prepare(
		`UPDATE xhs_orders
		 SET status = 'claimed', claimed_at = ?, bound_email = ?, license_key = ?, email_error = NULL, last_seen_at = ?
		 WHERE order_id = ? AND license_key IS NULL AND (bound_email IS NULL OR lower(bound_email) = ?)`
	).bind(nowSeconds(), email, licenseKey, nowSeconds(), orderId, email).run();

	if (!updateResult.meta.changes || updateResult.meta.changes === 0) {
		await env.DB.prepare('DELETE FROM licenses WHERE key = ?').bind(licenseKey).run();
		const latest = await env.DB.prepare('SELECT * FROM xhs_orders WHERE order_id = ?')
			.bind(orderId)
			.first<XhsOrderRow>();
		if (latest?.license_key && latest.bound_email && normalizeEmail(latest.bound_email) === email) {
			return json({
				success: true,
				alreadyClaimed: true,
				orderId,
				email,
				licenseKey: latest.license_key,
				licenseType: latest.license_type,
				emailSent: !!latest.email_sent_at,
			});
		}
		await logClaimEvent(env, orderId, 'claim_race_rejected', email, null);
		return error('订单状态刚刚发生变化，请刷新后重试', 409);
	}

	const mail = await sendLicenseEmail(env, email, licenseKey, orderId, licenseType);
	if (mail.sent) {
		await env.DB.prepare('UPDATE xhs_orders SET email_sent_at = ?, email_error = NULL WHERE order_id = ?')
			.bind(nowSeconds(), orderId)
			.run();
		await logClaimEvent(env, orderId, 'claim_success', email, licenseKey, 'Email sent');
	} else {
		await env.DB.prepare('UPDATE xhs_orders SET email_error = ? WHERE order_id = ?')
			.bind(mail.error || 'Email failed', orderId)
			.run();
		await logClaimEvent(env, orderId, 'email_failed', email, licenseKey, mail.error || 'Email failed');
	}

	return json({
		success: true,
		alreadyClaimed: false,
		orderId,
		email,
		licenseKey,
		licenseType,
		expiresAt,
		emailSent: mail.sent,
		emailError: mail.sent ? null : mail.error,
	});
}

function parseImportedOrderIds(input: string | string[] | undefined): string[] {
	const raw = Array.isArray(input) ? input : String(input || '').split(/[\n,，;\t ]+/);
	const seen = new Set<string>();
	for (const item of raw) {
		const orderId = normalizeOrderId(String(item));
		if (orderId) seen.add(orderId);
	}
	return [...seen].slice(0, 500);
}

async function handleAdminXhsImport(request: Request, env: Env): Promise<Response> {
	const body = await request.json<{
		ordersText?: string;
		orderIds?: string[];
		licenseType?: string;
		productType?: string;
	}>();
	const orderIds = parseImportedOrderIds(body.orderIds || body.ordersText);
	const licenseType = body.licenseType === 'annual' ? 'annual' : 'lifetime';
	const productType = body.productType?.trim() || 'tidelog-pro';

	if (orderIds.length === 0) {
		return error('No order IDs provided', 400);
	}

	let imported = 0;
	let updated = 0;
	let alreadyClaimed = 0;
	for (const orderId of orderIds) {
		const existing = await env.DB.prepare('SELECT * FROM xhs_orders WHERE order_id = ?')
			.bind(orderId)
			.first<XhsOrderRow>();
		if (!existing) {
			await env.DB.prepare(
				`INSERT INTO xhs_orders (order_id, product_type, license_type, last_seen_at)
				 VALUES (?, ?, ?, ?)`
			).bind(orderId, productType, licenseType, nowSeconds()).run();
			imported++;
			continue;
		}
		if (existing.license_key) {
			alreadyClaimed++;
			continue;
		}
		await env.DB.prepare(
			`UPDATE xhs_orders
			 SET product_type = ?, license_type = ?, last_seen_at = ?
			 WHERE order_id = ? AND license_key IS NULL`
		).bind(productType, licenseType, nowSeconds(), orderId).run();
		updated++;
	}

	return json({ success: true, total: orderIds.length, imported, updated, alreadyClaimed });
}

async function handleAdminXhsTemplate(request: Request, env: Env): Promise<Response> {
	const body = await request.json<Partial<FulfillmentSettings>>();
	await saveFulfillmentSettings(env, {
		claimTitle: body.claimTitle,
		claimIntro: body.claimIntro,
		supportText: body.supportText,
		dmTemplate: body.dmTemplate,
	});
	const settings = await getFulfillmentSettings(request, env);
	return json({ success: true, settings });
}

async function handleAdminXhsResend(request: Request, env: Env): Promise<Response> {
	const body = await request.json<{ orderId?: string }>();
	const orderId = normalizeOrderId(body.orderId || '');
	if (!orderId) return error('Missing orderId', 400);

	const order = await env.DB.prepare('SELECT * FROM xhs_orders WHERE order_id = ?')
		.bind(orderId)
		.first<XhsOrderRow>();
	if (!order || !order.license_key || !order.bound_email) {
		return error('This order has not been claimed yet', 404);
	}

	const mail = await sendLicenseEmail(env, order.bound_email, order.license_key, order.order_id, order.license_type);
	if (mail.sent) {
		await env.DB.prepare('UPDATE xhs_orders SET email_sent_at = ?, email_error = NULL WHERE order_id = ?')
			.bind(nowSeconds(), orderId)
			.run();
		await logClaimEvent(env, orderId, 'email_resent', order.bound_email, order.license_key);
	} else {
		await env.DB.prepare('UPDATE xhs_orders SET email_error = ? WHERE order_id = ?')
			.bind(mail.error || 'Email failed', orderId)
			.run();
		await logClaimEvent(env, orderId, 'email_resend_failed', order.bound_email, order.license_key, mail.error || 'Email failed');
	}

	return json({ success: mail.sent, emailSent: mail.sent, error: mail.error || null });
}

async function handleAdminXhsState(request: Request, env: Env): Promise<Response> {
	const settings = await getFulfillmentSettings(request, env);
	const stats = await env.DB.prepare(
		`SELECT
			COUNT(*) as total,
			SUM(CASE WHEN license_key IS NULL THEN 1 ELSE 0 END) as unclaimed,
			SUM(CASE WHEN license_key IS NOT NULL THEN 1 ELSE 0 END) as claimed,
			SUM(CASE WHEN email_error IS NOT NULL THEN 1 ELSE 0 END) as emailErrors
		 FROM xhs_orders`
	).first<{ total: number; unclaimed: number | null; claimed: number | null; emailErrors: number | null }>();

	const { results: recentOrders } = await env.DB.prepare(
		`SELECT order_id, product_type, license_type, status, imported_at, claimed_at, bound_email, license_key, email_sent_at, email_error
		 FROM xhs_orders
		 ORDER BY imported_at DESC, id DESC
		 LIMIT 50`
	).all<XhsOrderRow>();

	const { results: recentEvents } = await env.DB.prepare(
		`SELECT order_id, event_type, email, license_key, detail, created_at
		 FROM xhs_claim_events
		 ORDER BY created_at DESC, id DESC
		 LIMIT 30`
	).all<Record<string, unknown>>();

	return json({ success: true, settings, claimUrl: getClaimUrl(request, env), stats, recentOrders, recentEvents });
}

function buildAdminXhsHtml(): string {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TideLog · 小红书发码后台</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin:0; padding:24px 16px 48px; background:#f6f8fb; color:#172033; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  main { width:min(100%, 960px); margin:0 auto; }
  h1 { margin:0 0 6px; font-size:28px; }
  h2 { margin:0 0 14px; font-size:18px; }
  p { color:#667085; line-height:1.6; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }
  .card { background:#fff; border:1px solid #e4e7ec; border-radius:16px; padding:20px; box-shadow:0 12px 34px rgba(31,41,55,.06); margin-top:16px; }
  label { display:block; margin:12px 0 6px; font-size:13px; font-weight:650; color:#344054; }
  input, textarea, select { width:100%; border:1px solid #d0d5dd; border-radius:10px; padding:10px 12px; font-size:14px; background:#fff; }
  textarea { min-height:120px; resize:vertical; }
  button { border:0; border-radius:10px; padding:10px 14px; margin-top:12px; background:#3b8ea5; color:white; font-weight:700; cursor:pointer; }
  button.secondary { background:#eef4f6; color:#2f7f95; }
  .stats { display:flex; gap:10px; flex-wrap:wrap; }
  .pill { background:#f0f9ff; color:#075985; border-radius:999px; padding:7px 11px; font-size:13px; font-weight:650; }
  .notice { display:none; margin-top:12px; padding:10px 12px; border-radius:10px; font-size:14px; }
  .ok { display:block; background:#ecfdf3; color:#14532d; border:1px solid #bbf7d0; }
  .bad { display:block; background:#fef2f2; color:#991b1b; border:1px solid #fecaca; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th, td { padding:9px 8px; border-bottom:1px solid #edf0f4; text-align:left; vertical-align:top; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; word-break:break-all; }
</style>
</head>
<body>
<main>
  <h1>TideLog 小红书发码后台</h1>
  <p>这里只保存订单号、邮箱和激活码绑定关系。不要把 Admin Token、客户订单或邮箱提交到 GitHub。</p>

  <section class="card">
    <h2>登录</h2>
    <label for="adminToken">Admin Token</label>
    <input id="adminToken" type="password" placeholder="粘贴 Cloudflare Worker ADMIN_TOKEN">
    <button type="button" onclick="loadState()">进入后台</button>
    <div id="loginNotice" class="notice"></div>
  </section>

  <div id="dashboard" style="display:none">
    <section class="card">
      <h2>概览</h2>
      <div class="stats" id="stats"></div>
      <label>小红书自动私信内容</label>
      <textarea id="copyTemplate" readonly></textarea>
      <button class="secondary" type="button" onclick="copyTemplate()">复制私信话术</button>
      <p>在小红书个人售卖里，把自动私信配置为这段固定话术。随机激活码由领取页发放。</p>
    </section>

    <div class="grid">
      <section class="card">
        <h2>导入订单</h2>
        <label for="licenseType">License 类型</label>
        <select id="licenseType">
          <option value="lifetime">终身版</option>
          <option value="annual">年度版</option>
        </select>
        <label for="productType">商品标记</label>
        <input id="productType" value="tidelog-pro">
        <label for="ordersText">订单号列表</label>
        <textarea id="ordersText" placeholder="一行一个订单号，也可以用逗号分隔"></textarea>
        <button type="button" onclick="importOrders()">导入订单</button>
        <div id="importNotice" class="notice"></div>
      </section>

      <section class="card">
        <h2>编辑领取说明</h2>
        <label for="claimTitle">领取页标题</label>
        <input id="claimTitle">
        <label for="claimIntro">领取页说明</label>
        <textarea id="claimIntro"></textarea>
        <label for="supportText">售后提示</label>
        <textarea id="supportText"></textarea>
        <label for="dmTemplate">私信话术模板</label>
        <textarea id="dmTemplate"></textarea>
        <button type="button" onclick="saveTemplate()">保存话术</button>
        <div id="templateNotice" class="notice"></div>
      </section>
    </div>

    <section class="card">
      <h2>最近订单</h2>
      <div id="orders"></div>
    </section>
  </div>
</main>
<script>
function token() { return document.getElementById('adminToken').value.trim(); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function notice(id, ok, msg) { var el=document.getElementById(id); el.className='notice '+(ok?'ok':'bad'); el.textContent=msg; }
function api(path, options) {
  return fetch(path, Object.assign({}, options, { headers: Object.assign({ Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, options && options.headers || {}) })).then(function(r){ return r.json(); });
}
function loadState() {
  api('/admin/xhs/state', { method:'GET', headers: { Authorization: 'Bearer ' + token() } }).then(renderState).catch(function(){ notice('loginNotice', false, '无法加载后台，请检查 Token。'); });
}
function renderState(data) {
  if (!data.success) { notice('loginNotice', false, data.error || 'Token 无效'); return; }
  document.getElementById('dashboard').style.display='';
  notice('loginNotice', true, '已加载后台。');
  var s=data.stats||{};
  document.getElementById('stats').innerHTML =
    '<span class="pill">总订单 '+(s.total||0)+'</span>'
    + '<span class="pill">未领取 '+(s.unclaimed||0)+'</span>'
    + '<span class="pill">已领取 '+(s.claimed||0)+'</span>'
    + '<span class="pill">邮件异常 '+(s.emailErrors||0)+'</span>';
  var settings=data.settings||{};
  document.getElementById('copyTemplate').value=settings.dmTemplate||'';
  document.getElementById('claimTitle').value=settings.claimTitle||'';
  document.getElementById('claimIntro').value=settings.claimIntro||'';
  document.getElementById('supportText').value=settings.supportText||'';
  document.getElementById('dmTemplate').value=settings.dmTemplate||'';
  var rows=(data.recentOrders||[]).map(function(o){
    var key=o.license_key ? '<code>'+esc(o.license_key)+'</code>' : '未领取';
    var email=o.bound_email ? esc(o.bound_email) : '';
    var resend=o.license_key ? '<button class="secondary" onclick="resendEmail(\\''+esc(o.order_id)+'\\')">重发邮件</button>' : '';
    return '<tr><td><code>'+esc(o.order_id)+'</code></td><td>'+esc(o.license_type)+'</td><td>'+esc(o.status)+'</td><td>'+email+'</td><td>'+key+'</td><td>'+esc(o.email_error||'')+'</td><td>'+resend+'</td></tr>';
  }).join('');
  document.getElementById('orders').innerHTML='<table><thead><tr><th>订单号</th><th>类型</th><th>状态</th><th>邮箱</th><th>激活码</th><th>邮件错误</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>';
}
function copyTemplate() {
  navigator.clipboard.writeText(document.getElementById('copyTemplate').value);
}
function importOrders() {
  api('/admin/xhs/import', { method:'POST', body: JSON.stringify({
    ordersText: document.getElementById('ordersText').value,
    licenseType: document.getElementById('licenseType').value,
    productType: document.getElementById('productType').value
  }) }).then(function(data){
    notice('importNotice', !!data.success, data.success ? ('导入 '+data.imported+'，更新 '+data.updated+'，已领取跳过 '+data.alreadyClaimed) : (data.error||'导入失败'));
    if (data.success) loadState();
  });
}
function saveTemplate() {
  api('/admin/xhs/template', { method:'POST', body: JSON.stringify({
    claimTitle: document.getElementById('claimTitle').value,
    claimIntro: document.getElementById('claimIntro').value,
    supportText: document.getElementById('supportText').value,
    dmTemplate: document.getElementById('dmTemplate').value
  }) }).then(function(data){
    notice('templateNotice', !!data.success, data.success ? '已保存。' : (data.error||'保存失败'));
    if (data.success) loadState();
  });
}
function resendEmail(orderId) {
  api('/admin/xhs/resend', { method:'POST', body: JSON.stringify({ orderId: orderId }) }).then(function(data){
    alert(data.emailSent ? '邮件已发送。' : ('邮件未发送：' + (data.error || '未知错误')));
    loadState();
  });
}
</script>
</body>
</html>`;
}

// =============================================================================
// Portal Handlers
// =============================================================================

async function handlePortalLookup(request: Request, env: Env): Promise<Response> {
	const body = await request.json<{ email: string; orderId: string }>();
	const { email, orderId } = body;

	if (!email || !orderId) {
		return error('Missing email or orderId');
	}

	const normalizedEmail = email.trim().toLowerCase();
	const normalizedOrderId = orderId.trim();

	// Must match BOTH email AND orderId to prevent enumeration
	const { results: rows } = await env.DB.prepare(
		'SELECT * FROM licenses WHERE email = ? AND order_id = ?'
	).bind(normalizedEmail, normalizedOrderId).all<LicenseRow>();

	if (rows.length === 0) {
		return json({ success: false, error: 'No licenses found for this email and order ID combination' });
	}

	// Enrich each license with its device list
	const licenses = await Promise.all(rows.map(async (lic) => {
		const { results: devices } = await env.DB.prepare(
			'SELECT device_id, activated_at FROM license_devices WHERE license_key = ?'
		).bind(lic.key).all<DeviceRow>();

		return {
			key: lic.key,
			type: lic.license_type,
			status: lic.status,
			expiresAt: lic.expires_at,
			activatedAt: devices.length > 0
				? Math.min(...devices.map(d => d.activated_at))
				: null,
			devices: devices.map(d => ({
				deviceId: d.device_id,
				activatedAt: d.activated_at,
			})),
		};
	}));

	return json({ success: true, licenses });
}

async function handlePortalUnbind(request: Request, env: Env): Promise<Response> {
	const body = await request.json<{ email: string; orderId: string; deviceId: string }>();
	const { email, orderId, deviceId } = body;

	if (!email || !orderId || !deviceId) {
		return error('Missing email, orderId, or deviceId');
	}

	const normalizedEmail = email.trim().toLowerCase();
	const normalizedOrderId = orderId.trim();

	// Step 1: verify identity — find a license matching email+orderId
	const { results: rows } = await env.DB.prepare(
		'SELECT key FROM licenses WHERE email = ? AND order_id = ?'
	).bind(normalizedEmail, normalizedOrderId).all<{ key: string }>();

	if (rows.length === 0) {
		return json({ success: false, error: 'Invalid email or order ID' }, 403);
	}

	// Step 2: verify the device belongs to one of those licenses
	const licenseKeys = rows.map(r => r.key);
	let matchedKey: string | null = null;

	for (const key of licenseKeys) {
		const device = await env.DB.prepare(
			'SELECT device_id FROM license_devices WHERE license_key = ? AND device_id = ?'
		).bind(key, deviceId).first<{ device_id: string }>();

		if (device) {
			matchedKey = key;
			break;
		}
	}

	if (!matchedKey) {
		return json({ success: false, error: 'Device not found on your licenses' }, 404);
	}

	// Step 3: remove the device binding
	await env.DB.prepare(
		'DELETE FROM license_devices WHERE license_key = ? AND device_id = ?'
	).bind(matchedKey, deviceId).run();

	// Step 4: check remaining devices and update license status if needed
	const { results: remaining } = await env.DB.prepare(
		'SELECT device_id FROM license_devices WHERE license_key = ?'
	).bind(matchedKey).all<{ device_id: string }>();

	if (remaining.length === 0) {
		await env.DB.prepare(
			'UPDATE licenses SET status = ? WHERE key = ?'
		).bind('unused', matchedKey).run();
	}

	return json({ success: true, remainingDevices: remaining.length });
}

// =============================================================================
// Portal HTML Page
// =============================================================================

function buildPortalHtml(lang: string): string {
	const isEn = lang === 'en';

	const strings = {
		title: isEn ? 'TideLog · License Portal' : 'TideLog · License 自助管理',
		heading: isEn ? 'License Self-Service' : 'License 自助管理',
		subtitle: isEn
			? 'Look up your license key and manage device bindings'
			: '查询激活码 · 管理设备绑定',
		emailLabel: isEn ? 'Email' : '购买时填写的邮箱',
		emailPlaceholder: isEn ? 'you@example.com' : 'your@email.com',
		orderLabel: isEn ? 'Order ID' : '订单号',
		orderPlaceholder: isEn ? 'Order ID from Aifadian / store' : '爱发电订单号',
		searchBtn: isEn ? 'Look up' : '查询',
		searching: isEn ? 'Searching…' : '查询中…',
		foundLabel: isEn ? 'Found {n} license(s):' : '找到 {n} 个 License：',
		noFound: isEn
			? 'No licenses found. Please check your email and order ID.'
			: '未找到 License，请检查邮箱和订单号是否正确。',
		lifetime: isEn ? 'Lifetime' : '终身版',
		annual: isEn ? 'Annual' : '年度版',
		activatedAt: isEn ? 'Activated' : '激活于',
		expiresAt: isEn ? 'Expires' : '到期',
		noExpiry: isEn ? 'Never' : '永不过期',
		devices: isEn ? 'Devices:' : '已绑定设备：',
		noDevices: isEn ? 'No devices bound' : '暂无绑定设备',
		unbind: isEn ? 'Unbind' : '解绑',
		unbinding: isEn ? 'Unbinding…' : '解绑中…',
		unbindConfirm: isEn
			? 'Unbind this device? You will need to re-activate to use TideLog on it again.'
			: '确认解绑这台设备？解绑后需要重新激活才能在该设备上使用 TideLog。',
		unbindSuccess: isEn ? 'Device unbound.' : '设备已解绑。',
		unbindFail: isEn ? 'Failed to unbind device.' : '解绑失败，请稍后重试。',
		copyKey: isEn ? 'Copy' : '复制',
		copied: isEn ? 'Copied!' : '已复制！',
		langSwitch: isEn ? '中文' : 'English',
		langHref: isEn ? '?lang=zh' : '?lang=en',
		statusUnused: isEn ? 'Unused' : '未激活',
		statusActive: isEn ? 'Active' : '已激活',
		statusRevoked: isEn ? 'Revoked' : '已吊销',
		helpText: isEn
			? 'Enter the email and order ID you used when purchasing TideLog Pro.'
			: '请输入购买 TideLog Pro 时填写的邮箱和订单号（爱发电订单页可查到）。',
	};

	return `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'zh-CN'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${strings.title}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f5f7fa;
    color: #1a1a2e;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px 48px;
  }
  .lang-switch {
    align-self: flex-end;
    margin-bottom: 16px;
  }
  .lang-switch a {
    color: #3B8EA5;
    text-decoration: none;
    font-size: 14px;
    border: 1px solid #3B8EA5;
    padding: 4px 12px;
    border-radius: 20px;
  }
  .lang-switch a:hover { background: #3B8EA5; color: #fff; }
  .card {
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 2px 16px rgba(59,142,165,0.1);
    padding: 32px 28px;
    width: 100%;
    max-width: 600px;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .logo-wave { font-size: 28px; }
  .logo h1 { font-size: 22px; font-weight: 700; color: #3B8EA5; }
  .subtitle {
    color: #6b7280;
    font-size: 14px;
    margin-bottom: 24px;
  }
  .help-text {
    background: #f0f9ff;
    border-left: 3px solid #3B8EA5;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 13px;
    color: #374151;
    margin-bottom: 20px;
  }
  label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 6px;
    margin-top: 14px;
  }
  input[type="text"], input[type="email"] {
    width: 100%;
    padding: 10px 14px;
    border: 1.5px solid #d1d5db;
    border-radius: 8px;
    font-size: 15px;
    color: #1a1a2e;
    transition: border-color 0.2s;
    outline: none;
  }
  input:focus { border-color: #3B8EA5; box-shadow: 0 0 0 3px rgba(59,142,165,0.12); }
  .search-btn {
    display: block;
    width: 100%;
    margin-top: 20px;
    padding: 12px;
    background: #3B8EA5;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }
  .search-btn:hover { background: #2d7a92; }
  .search-btn:disabled { background: #9ca3af; cursor: not-allowed; }
  .divider {
    border: none;
    border-top: 1.5px solid #e5e7eb;
    margin: 24px 0;
  }
  #results { display: none; }
  .found-label {
    font-size: 15px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 16px;
  }
  .error-msg {
    color: #dc2626;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 14px;
  }
  .license-card {
    border: 1.5px solid #e5e7eb;
    border-radius: 12px;
    padding: 18px;
    margin-bottom: 16px;
  }
  .license-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }
  .license-type-badge {
    background: #ecfdf5;
    color: #065f46;
    border-radius: 20px;
    padding: 3px 10px;
    font-size: 12px;
    font-weight: 600;
  }
  .license-type-badge.annual {
    background: #eff6ff;
    color: #1d4ed8;
  }
  .license-type-badge.revoked {
    background: #fef2f2;
    color: #991b1b;
  }
  .key-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'Courier New', monospace;
    font-size: 15px;
    font-weight: 600;
    color: #1a1a2e;
    word-break: break-all;
  }
  .copy-btn {
    flex-shrink: 0;
    padding: 4px 10px;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    color: #374151;
    transition: background 0.15s;
  }
  .copy-btn:hover { background: #e5e7eb; }
  .meta-row {
    font-size: 13px;
    color: #6b7280;
    margin-top: 8px;
  }
  .devices-section {
    margin-top: 14px;
  }
  .devices-label {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 8px;
  }
  .device-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: #f9fafb;
    border-radius: 8px;
    margin-bottom: 6px;
    gap: 8px;
  }
  .device-id {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #374151;
    word-break: break-all;
    flex: 1;
  }
  .unbind-btn {
    flex-shrink: 0;
    padding: 4px 10px;
    background: #fff;
    border: 1px solid #fca5a5;
    border-radius: 6px;
    font-size: 12px;
    color: #dc2626;
    cursor: pointer;
    transition: background 0.15s;
  }
  .unbind-btn:hover { background: #fef2f2; }
  .unbind-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .no-devices {
    font-size: 13px;
    color: #9ca3af;
    font-style: italic;
  }
  @media (max-width: 480px) {
    .card { padding: 20px 16px; }
    .key-row { font-size: 13px; }
  }
</style>
</head>
<body>
<div class="lang-switch">
  <a href="${strings.langHref}">${strings.langSwitch}</a>
</div>
<div class="card">
  <div class="logo">
    <span class="logo-wave">🌊</span>
    <h1>${strings.heading}</h1>
  </div>
  <p class="subtitle">${strings.subtitle}</p>
  <div class="help-text">${strings.helpText}</div>

  <label for="email">${strings.emailLabel}</label>
  <input type="email" id="email" placeholder="${strings.emailPlaceholder}" autocomplete="email">

  <label for="orderId">${strings.orderLabel}</label>
  <input type="text" id="orderId" placeholder="${strings.orderPlaceholder}" autocomplete="off">

  <button class="search-btn" id="searchBtn" onclick="doLookup()">
    ${strings.searchBtn}
  </button>

  <hr class="divider" id="divider" style="display:none">
  <div id="results"></div>
</div>

<script>
(function() {
  var STR = ${JSON.stringify(strings)};

  function fmt(tpl, n) { return tpl.replace('{n}', n); }

  function fmtTs(ts) {
    if (!ts) return STR.noExpiry;
    var d = new Date(ts * 1000);
    return d.getFullYear() + '-'
      + String(d.getMonth()+1).padStart(2,'0') + '-'
      + String(d.getDate()).padStart(2,'0');
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  window.doLookup = function() {
    var email = document.getElementById('email').value.trim();
    var orderId = document.getElementById('orderId').value.trim();
    if (!email || !orderId) return;

    var btn = document.getElementById('searchBtn');
    btn.disabled = true;
    btn.textContent = STR.searching;

    fetch('/portal/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, orderId: orderId })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      document.getElementById('divider').style.display = '';
      var el = document.getElementById('results');
      el.style.display = '';
      if (!data.success || !data.licenses || data.licenses.length === 0) {
        el.innerHTML = '<div class="error-msg">' + escHtml(STR.noFound) + '</div>';
        return;
      }
      var html = '<div class="found-label">' + escHtml(fmt(STR.foundLabel, data.licenses.length)) + '</div>';
      data.licenses.forEach(function(lic) {
        var isLifetime = lic.type !== 'annual';
        var badgeClass = lic.status === 'revoked' ? 'revoked' : (isLifetime ? '' : 'annual');
        var typeLabel = isLifetime ? STR.lifetime : STR.annual;
        var statusLabel = lic.status === 'active' ? STR.statusActive
                        : lic.status === 'revoked' ? STR.statusRevoked
                        : STR.statusUnused;
        var devicesHtml = '';
        if (lic.devices && lic.devices.length > 0) {
          lic.devices.forEach(function(dev) {
            devicesHtml += '<div class="device-row" id="dev-' + escHtml(dev.deviceId) + '">'
              + '<span class="device-id">' + escHtml(dev.deviceId) + '</span>'
              + '<button class="unbind-btn" onclick="doUnbind('
                + JSON.stringify(email) + ','
                + JSON.stringify(orderId) + ','
                + JSON.stringify(dev.deviceId) + ','
                + JSON.stringify(lic.key)
              + ')">' + escHtml(STR.unbind) + '</button>'
              + '</div>';
          });
        } else {
          devicesHtml = '<span class="no-devices">' + escHtml(STR.noDevices) + '</span>';
        }
        html += '<div class="license-card">'
          + '<div class="license-header">'
            + '<span class="license-type-badge ' + badgeClass + '">' + escHtml(typeLabel) + ' · ' + escHtml(statusLabel) + '</span>'
          + '</div>'
          + '<div class="key-row">'
            + escHtml(lic.key)
            + '<button class="copy-btn" onclick="copyKey(this,' + JSON.stringify(lic.key) + ')">' + escHtml(STR.copyKey) + '</button>'
          + '</div>'
          + '<div class="meta-row">'
            + (lic.activatedAt ? STR.activatedAt + ' ' + fmtTs(lic.activatedAt) + ' · ' : '')
            + (isLifetime ? STR.noExpiry : STR.expiresAt + ' ' + fmtTs(lic.expiresAt))
          + '</div>'
          + '<div class="devices-section">'
            + '<div class="devices-label">' + escHtml(STR.devices) + '</div>'
            + devicesHtml
          + '</div>'
          + '</div>';
      });
      el.innerHTML = html;
    })
    .catch(function() {
      document.getElementById('divider').style.display = '';
      var el = document.getElementById('results');
      el.style.display = '';
      el.innerHTML = '<div class="error-msg">' + escHtml(STR.noFound) + '</div>';
    })
    .finally(function() {
      btn.disabled = false;
      btn.textContent = STR.searchBtn;
    });
  };

  window.copyKey = function(btn, key) {
    navigator.clipboard.writeText(key).then(function() {
      var orig = btn.textContent;
      btn.textContent = STR.copied;
      setTimeout(function() { btn.textContent = orig; }, 1500);
    });
  };

  window.doUnbind = function(email, orderId, deviceId, licKey) {
    if (!confirm(STR.unbindConfirm)) return;
    var btn = document.querySelector('#dev-' + CSS.escape(deviceId) + ' .unbind-btn');
    if (btn) { btn.disabled = true; btn.textContent = STR.unbinding; }
    fetch('/portal/unbind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, orderId: orderId, deviceId: deviceId })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        var row = document.getElementById('dev-' + deviceId);
        if (row) row.remove();
        // show temporary success notice
        var notice = document.createElement('div');
        notice.className = 'error-msg';
        notice.style.background = '#f0fdf4';
        notice.style.borderColor = '#bbf7d0';
        notice.style.color = '#166534';
        notice.textContent = STR.unbindSuccess;
        var card = document.querySelector('#results .license-card');
        if (card) card.appendChild(notice);
        setTimeout(function() { notice.remove(); }, 3000);
      } else {
        alert(STR.unbindFail);
        if (btn) { btn.disabled = false; btn.textContent = STR.unbind; }
      }
    })
    .catch(function() {
      alert(STR.unbindFail);
      if (btn) { btn.disabled = false; btn.textContent = STR.unbind; }
    });
  };

  // Allow pressing Enter in input fields to trigger search
  document.addEventListener('DOMContentLoaded', function() {
    ['email','orderId'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') window.doLookup();
      });
    });
  });
})();
</script>
</body>
</html>`;
}

function handlePortalPage(request: Request): Response {
	const url = new URL(request.url);
	const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';
	return new Response(buildPortalHtml(lang), {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-cache',
		},
	});
}

// =============================================================================
// Router
// =============================================================================

function checkAdmin(request: Request, env: Env): Response | null {
	const auth = request.headers.get('Authorization');
	if (!auth || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
		return error('Unauthorized', 401);
	}
	return null;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization',
				},
			});
		}

		const url = new URL(request.url);
		const path = url.pathname;

		try {
			if (path === '/license/activate' && request.method === 'POST') {
				const limited = await checkRateLimit(request, env, 'license-activate', 20, 60);
				if (limited) return limited;
				return await handleActivate(request, env);
			}
			if (path === '/license/verify' && request.method === 'POST') {
				const limited = await checkRateLimit(request, env, 'license-verify', 60, 60);
				if (limited) return limited;
				return await handleVerify(request, env);
			}
			if (path === '/license/deactivate' && request.method === 'POST') {
				const limited = await checkRateLimit(request, env, 'license-deactivate', 20, 60);
				if (limited) return limited;
				return await handleDeactivate(request, env);
			}

			if (path.startsWith('/admin/')) {
				if (path === '/admin/xhs' && request.method === 'GET') {
					return new Response(buildAdminXhsHtml(), {
						headers: {
							'Content-Type': 'text/html; charset=utf-8',
							'Cache-Control': 'no-cache',
						},
					});
				}

				const authError = checkAdmin(request, env);
				if (authError) return authError;

				if (path === '/admin/generate' && request.method === 'POST') {
					return await handleAdminGenerate(request, env);
				}
				if (path === '/admin/list' && request.method === 'GET') {
					return await handleAdminList(env);
				}
				if (path === '/admin/xhs/state' && request.method === 'GET') {
					return await handleAdminXhsState(request, env);
				}
				if (path === '/admin/xhs/import' && request.method === 'POST') {
					return await handleAdminXhsImport(request, env);
				}
				if (path === '/admin/xhs/template' && request.method === 'POST') {
					return await handleAdminXhsTemplate(request, env);
				}
				if (path === '/admin/xhs/resend' && request.method === 'POST') {
					return await handleAdminXhsResend(request, env);
				}
			}

			// Portal routes
			if (path === '/portal' && request.method === 'GET') {
				return handlePortalPage(request);
			}
			if (path === '/portal/lookup' && request.method === 'POST') {
				const limited = await checkRateLimit(request, env, 'portal-lookup', 15, 60);
				if (limited) return limited;
				return await handlePortalLookup(request, env);
			}
			if (path === '/portal/unbind' && request.method === 'POST') {
				const limited = await checkRateLimit(request, env, 'portal-unbind', 15, 60);
				if (limited) return limited;
				return await handlePortalUnbind(request, env);
			}
			if (path === '/xhs/claim' && request.method === 'GET') {
				return await handleXhsClaimPage(request, env);
			}
			if (path === '/xhs/claim' && request.method === 'POST') {
				const limited = await checkRateLimit(request, env, 'xhs-claim', 15, 60);
				if (limited) return limited;
				return await handleXhsClaim(request, env);
			}

			if (path === '/' || path === '/health') {
				return json({ status: 'ok', service: 'tidelog-license-api', version: '2.0' });
			}

			return error('Not found', 404);
		} catch (err) {
			console.error('[TideLog License API] Request failed', err);
			return error('Internal server error', 500);
		}
	},
} satisfies ExportedHandler<Env>;
