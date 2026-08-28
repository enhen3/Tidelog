/**
 * TideLog License API — Cloudflare Worker + D1
 * v2: License types (monthly/annual; lifetime legacy) + multi-device (3 devices per key)
 * v3: Self-serve portal (GET /portal, POST /portal/lookup, POST /portal/unbind)
 *
 * Endpoints:
 *   POST /license/activate    — Activate a key + bind device
 *   POST /license/verify      — Check if a key is valid
 *   POST /license/deactivate  — Unbind a device from key
 *   POST /admin/generate      — Batch-generate keys (Admin Token)
 *   GET  /admin/list          — List all keys (Admin Token)
 *   GET  /portal              — Self-serve license lookup page (HTML)
 *   POST /portal/lookup       — Lookup licenses by email + orderId
 *   POST /portal/unbind       — Unbind a device (authenticated by email + orderId)
 */

import type { D1Database, ExportedHandler } from '@cloudflare/workers-types';
import { ANCHOR_SALT_MISSING, hmacHex, readAnchorSalt } from './anchor';
import { handleAIGenerate, handleAIQuota, handleTrialStart, handleTrialStatus } from './ai';
import { readJsonWithLimit } from './request';

const MAX_CONTROL_BODY_BYTES = 64 * 1024;

export interface Env {
	DB: D1Database;
	ADMIN_TOKEN: string;
	DEEPSEEK_API_KEY: string;
	DEEPSEEK_MODEL?: string;
	/**
	 * 匿名化盐值（wrangler secret）。用于把 IP / deviceId 派生成不可反解的锚点。
	 *
	 * 没有它时，锚点是无盐 SHA-256：IPv4 空间仅 2^32，可穷举反解出原始 IP，
	 * 属于「去标识化」而非「匿名化」，在个人信息认定上是两回事。
	 * 缺失时服务端拒绝提供 AI 服务（fail closed），不静默退回可反解的写法。
	 */
	ANCHOR_SALT?: string;
}

export interface LicenseRow {
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

async function readJsonObject(request: Request): Promise<Record<string, unknown> | Response> {
	const parsed = await readJsonWithLimit(request, MAX_CONTROL_BODY_BYTES);
	if (!parsed.ok) {
		return parsed.error === 'body_too_large'
			? error('Request body too large', 413)
			: error('Invalid JSON body');
	}
	const value = parsed.value;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return error('Invalid JSON body');
	return value as Record<string, unknown>;
}

function boundedString(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	return normalized && normalized.length <= maxLength ? normalized : null;
}

function getClientIp(request: Request): string {
	return request.headers.get('CF-Connecting-IP')
		|| request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
		|| 'unknown';
}

async function checkRateLimit(
	request: Request,
	env: Env,
	scope: string,
	limit: number,
	windowSeconds: number,
): Promise<Response | null> {
	// 限流键同样是 IP 派生值，落在 `rate_limits` 里长期可读。
	// 用无盐 SHA-256 时，已知 scope 与时间窗即可穷举 2^32 个 IPv4 反解出原始 IP——
	// 这条路径此前被漏掉了，`ai.ts` 改成 HMAC 并不能替它消除风险。
	const salt = readAnchorSalt(env);
	if (!salt) {
		// fail closed：宁可整条路由不可用，也不写入可反解的 IP 派生值。
		console.error('[TideLog API] ANCHOR_SALT 未配置，限流拒绝服务');
		return error(ANCHOR_SALT_MISSING, 503);
	}
	const now = Math.floor(Date.now() / 1000);
	const resetAt = Math.floor(now / windowSeconds) * windowSeconds + windowSeconds;
	const clientHash = await hmacHex(salt, `ratelimit:${scope}:${getClientIp(request)}:${resetAt}`);

	const consumed = await env.DB.prepare(
		`INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
		 ON CONFLICT(key) DO UPDATE SET count = rate_limits.count + 1
		 WHERE rate_limits.count < ?`,
	).bind(clientHash, resetAt, limit).run();
	if ((consumed.meta.changes ?? 0) === 0) {
		return json(
			{ success: false, error: 'Too many requests. Please try again later.', retryAfter: Math.max(1, resetAt - now) },
			429,
		);
	}

	if (Math.random() < 0.01) {
		await env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?')
			.bind(now - 3600)
			.run();
	}

	return null;
}

/**
 * 对客户端提供的身份线索做独立限流。原值只参与 HMAC，不写入数据库。
 * 这堵住了攻击者轮换 IP 后继续枚举邮箱 + 订单号的路径。
 */
async function checkIdentityRateLimit(
	env: Env,
	scope: string,
	identity: string,
	limit: number,
	windowSeconds: number,
): Promise<Response | null> {
	const salt = readAnchorSalt(env);
	if (!salt) return error(ANCHOR_SALT_MISSING, 503);
	const now = Math.floor(Date.now() / 1000);
	const resetAt = Math.floor(now / windowSeconds) * windowSeconds + windowSeconds;
	const key = await hmacHex(salt, `ratelimit:${scope}:${identity}:${resetAt}`);

	const consumed = await env.DB.prepare(
		`INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
		 ON CONFLICT(key) DO UPDATE SET count = rate_limits.count + 1
		 WHERE rate_limits.count < ?`,
	).bind(key, resetAt, limit).run();
	if ((consumed.meta.changes ?? 0) === 0) {
		return json({
			success: false,
			error: 'Too many attempts. Please try again later.',
			retryAfter: Math.max(1, resetAt - now),
		}, 429);
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
	return row.license_type !== 'lifetime'
		&& (row.expires_at === null || Math.floor(Date.now() / 1000) > row.expires_at);
}

function expiryOneMonthFromNow(): number {
	const now = new Date();
	const expiry = new Date(Date.UTC(
		now.getUTCFullYear(), now.getUTCMonth() + 1, 1,
		now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds(),
	));
	const lastDayOfTargetMonth = new Date(Date.UTC(
		expiry.getUTCFullYear(), expiry.getUTCMonth() + 1, 0,
	)).getUTCDate();
	expiry.setUTCDate(Math.min(now.getUTCDate(), lastDayOfTargetMonth));
	return Math.floor(expiry.getTime() / 1000);
}

// =============================================================================
// Route Handlers
// =============================================================================

async function handleActivate(request: Request, env: Env): Promise<Response> {
	const body = await readJsonObject(request);
	if (body instanceof Response) return body;
	const key = boundedString(body.key, 128);
	const deviceId = boundedString(body.deviceId, 256);
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

	// Every non-lifetime license has an expiry.
	if (isExpired(row)) {
		return error('This license has expired', 403);
	}

	// 数量检查必须和 INSERT 在同一条 SQL 中。先 COUNT 再 INSERT 会让并发设备
	// 同时看到空位，最终突破 max_devices。
	const insert = await env.DB.prepare(
		`INSERT INTO license_devices (license_key, device_id)
		 SELECT ?, ?
		 WHERE (SELECT COUNT(*) FROM license_devices WHERE license_key = ?) < ?
		   AND NOT EXISTS (
		     SELECT 1 FROM license_devices WHERE license_key = ? AND device_id = ?
		   )`,
	).bind(normalizedKey, deviceId, normalizedKey, row.max_devices, normalizedKey, deviceId).run();

	if ((insert.meta.changes ?? 0) === 0) {
		const alreadyBound = await env.DB.prepare(
			'SELECT 1 AS found FROM license_devices WHERE license_key = ? AND device_id = ?',
		).bind(normalizedKey, deviceId).first<{ found: number }>();
		const count = await env.DB.prepare(
			'SELECT COUNT(*) AS n FROM license_devices WHERE license_key = ?',
		).bind(normalizedKey).first<{ n: number }>();
		if (!alreadyBound) {
			return error(
				`Device limit reached (${row.max_devices}/${row.max_devices}). Deactivate another device first.`,
				409,
			);
		}
		return json({
			success: true,
			status: 'active',
			licenseType: row.license_type,
			expiresAt: row.expires_at,
			deviceCount: count?.n ?? row.max_devices,
			maxDevices: row.max_devices,
			message: 'Already activated on this device',
		});
	}

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
		deviceCount: (await env.DB.prepare(
			'SELECT COUNT(*) AS n FROM license_devices WHERE license_key = ?',
		).bind(normalizedKey).first<{ n: number }>())?.n ?? 1,
		maxDevices: row.max_devices,
		message: 'License activated successfully',
	});
}

async function handleVerify(request: Request, env: Env): Promise<Response> {
	const body = await readJsonObject(request);
	if (body instanceof Response) return body;
	const key = boundedString(body.key, 128);
	const deviceId = boundedString(body.deviceId, 256);
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
	const body = await readJsonObject(request);
	if (body instanceof Response) return body;
	const key = boundedString(body.key, 128);
	const deviceId = boundedString(body.deviceId, 256);
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
	const body = await readJsonObject(request);
	if (body instanceof Response) return body;

	const requestedCount = Number.isInteger(body.count) ? body.count as number : 10;
	const count = Math.max(1, Math.min(requestedCount, 500));
	if (typeof body.licenseType !== 'string' || !body.licenseType) {
		return error('Missing license type. Expected monthly or annual.', 400);
	}
	const licenseType = body.licenseType;
	if (licenseType === 'lifetime') {
		return error('Lifetime licenses are no longer sold and cannot be issued from this endpoint.', 400);
	}
	if (licenseType !== 'monthly' && licenseType !== 'annual') {
		return error('Invalid license type. Expected monthly or annual.', 400);
	}

	if (body.email !== undefined && typeof body.email !== 'string') return error('Invalid email', 400);
	if (body.orderId !== undefined && typeof body.orderId !== 'string') return error('Invalid orderId', 400);
	const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() || null : null;
	const orderId = typeof body.orderId === 'string' ? body.orderId.trim() || null : null;
	if ((email && email.length > 254) || (orderId && orderId.length > 128)) {
		return error('Invalid email or orderId', 400);
	}
	const expiresAt = licenseType === 'monthly'
		? expiryOneMonthFromNow()
		: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

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
			SUM(CASE WHEN license_type = 'monthly' THEN 1 ELSE 0 END) as monthly,
			SUM(CASE WHEN license_type = 'annual' THEN 1 ELSE 0 END) as annual,
			SUM(CASE WHEN license_type = 'lifetime' THEN 1 ELSE 0 END) as lifetime
		 FROM licenses`
	).first<{ total: number; unused: number; active: number; revoked: number; monthly: number; annual: number; lifetime: number }>();

	return json({ success: true, stats, licenses: enriched });
}

// =============================================================================
// Portal Handlers
// =============================================================================

async function handlePortalLookup(request: Request, env: Env): Promise<Response> {
	const body = await readJsonObject(request);
	if (body instanceof Response) return body;
	const email = boundedString(body.email, 254);
	const orderId = boundedString(body.orderId, 128);
	if (!email || !orderId) {
		return error('Missing email or orderId');
	}

	const normalizedEmail = email.trim().toLowerCase();
	const normalizedOrderId = orderId.trim();
	if (normalizedEmail.length > 254 || normalizedOrderId.length < 6 || normalizedOrderId.length > 128) {
		return error('Invalid email or orderId');
	}
	const identityLimited = await checkIdentityRateLimit(
		env, 'portal-lookup-email', normalizedEmail, 10, 15 * 60,
	);
	if (identityLimited) return identityLimited;

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
	const body = await readJsonObject(request);
	if (body instanceof Response) return body;
	const email = boundedString(body.email, 254);
	const orderId = boundedString(body.orderId, 128);
	const deviceId = boundedString(body.deviceId, 256);
	if (!email || !orderId || !deviceId) {
		return error('Missing email, orderId, or deviceId');
	}

	const normalizedEmail = email.trim().toLowerCase();
	const normalizedOrderId = orderId.trim();
	if (normalizedEmail.length > 254 || normalizedOrderId.length < 6 || normalizedOrderId.length > 128) {
		return error('Invalid email or orderId');
	}
	const identityLimited = await checkIdentityRateLimit(
		env, 'portal-unbind-email', normalizedEmail, 10, 15 * 60,
	);
	if (identityLimited) return identityLimited;

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
		monthly: isEn ? 'Monthly' : '月度版',
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
  .license-type-badge.monthly {
    background: #f5f3ff;
    color: #6d28d9;
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
        var isLifetime = lic.type === 'lifetime';
        var badgeClass = lic.status === 'revoked' ? 'revoked' : (isLifetime ? '' : lic.type);
        var typeLabel = isLifetime ? STR.lifetime : (lic.type === 'monthly' ? STR.monthly : STR.annual);
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

async function timingSafeTextEqual(provided: string, expected: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const [providedHash, expectedHash] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(provided)),
		crypto.subtle.digest('SHA-256', encoder.encode(expected)),
	]);
	const subtle = crypto.subtle as SubtleCrypto & {
		timingSafeEqual?: (a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView) => boolean;
	};
	if (typeof subtle.timingSafeEqual === 'function') {
		return subtle.timingSafeEqual(providedHash, expectedHash);
	}
	// Node 的 Web Crypto 尚未提供 Cloudflare 扩展。两个 SHA-256 摘要固定为 32 字节，
	// 用无提前返回的完整 XOR 循环作为测试/本地运行兜底。
	const a = new Uint8Array(providedHash);
	const b = new Uint8Array(expectedHash);
	let different = 0;
	for (let index = 0; index < a.length; index += 1) different |= a[index] ^ b[index];
	return different === 0;
}

async function checkAdmin(request: Request, env: Env): Promise<Response | null> {
	const auth = request.headers.get('Authorization');
	if (!auth || !env.ADMIN_TOKEN || !await timingSafeTextEqual(auth, `Bearer ${env.ADMIN_TOKEN}`)) {
		return error('Unauthorized', 401);
	}
	return null;
}

export default {
	async fetch(request: Request, env: Env, ctx): Promise<Response> {
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
			if (path === '/ai/generate' && request.method === 'POST') {
				const limited = await checkRateLimit(request, env, 'ai-generate', 10, 60);
				if (limited) return limited;
				return await handleAIGenerate(request, env, ctx);
			}
			if (path === '/ai/quota' && request.method === 'GET') {
				const limited = await checkRateLimit(request, env, 'ai-quota', 10, 60);
				if (limited) return limited;
				return await handleAIQuota(request, env);
			}
			if (path === '/trial/start' && request.method === 'POST') {
				const limited = await checkRateLimit(request, env, 'trial-start', 10, 60);
				if (limited) return limited;
				return await handleTrialStart(request, env);
			}
			if (path === '/trial/status' && request.method === 'GET') {
				const limited = await checkRateLimit(request, env, 'trial-status', 30, 60);
				if (limited) return limited;
				return await handleTrialStatus(request, env);
			}

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
				const authError = await checkAdmin(request, env);
				if (authError) return authError;

				if (path === '/admin/generate' && request.method === 'POST') {
					return await handleAdminGenerate(request, env);
				}
				if (path === '/admin/list' && request.method === 'GET') {
					return await handleAdminList(env);
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
