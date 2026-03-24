/**
 * TideLog License API — Cloudflare Worker + D1
 * v2: License types (annual/lifetime) + multi-device (3 devices per key)
 *
 * Endpoints:
 *   POST /license/activate    — Activate a key + bind device
 *   POST /license/verify      — Check if a key is valid
 *   POST /license/deactivate  — Unbind a device from key
 *   POST /admin/generate      — Batch-generate keys (Admin Token)
 *   GET  /admin/list          — List all keys (Admin Token)
 */

export interface Env {
	DB: D1Database;
	ADMIN_TOKEN: string;
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

/** Generate a license key: TL-XXXX-XXXX-XXXX */
function generateKey(): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const segment = () => {
		let s = '';
		for (let i = 0; i < 4; i++) {
			s += chars[Math.floor(Math.random() * chars.length)];
		}
		return s;
	};
	return `TL-${segment()}-${segment()}-${segment()}`;
}

/** Check if a license has expired */
function isExpired(row: LicenseRow): boolean {
	if (row.license_type === 'lifetime' || !row.expires_at) return false;
	return Math.floor(Date.now() / 1000) > row.expires_at;
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

	const count = Math.min(body.count || 10, 500);
	const licenseType = body.licenseType || 'lifetime';
	const expiresAt = licenseType === 'annual'
		? Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
		: null;

	const keys: string[] = [];

	for (let i = 0; i < count; i++) {
		const key = generateKey();
		await env.DB.prepare(
			'INSERT INTO licenses (key, license_type, expires_at, email, order_id) VALUES (?, ?, ?, ?, ?)'
		).bind(key, licenseType, expiresAt, body.email || null, body.orderId || null).run();
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
				return await handleActivate(request, env);
			}
			if (path === '/license/verify' && request.method === 'POST') {
				return await handleVerify(request, env);
			}
			if (path === '/license/deactivate' && request.method === 'POST') {
				return await handleDeactivate(request, env);
			}

			if (path.startsWith('/admin/')) {
				const authError = checkAdmin(request, env);
				if (authError) return authError;

				if (path === '/admin/generate' && request.method === 'POST') {
					return await handleAdminGenerate(request, env);
				}
				if (path === '/admin/list' && request.method === 'GET') {
					return await handleAdminList(env);
				}
			}

			if (path === '/' || path === '/health') {
				return json({ status: 'ok', service: 'tidelog-license-api', version: '2.0' });
			}

			return error('Not found', 404);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Internal server error';
			return error(message, 500);
		}
	},
} satisfies ExportedHandler<Env>;
