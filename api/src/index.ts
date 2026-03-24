/**
 * TideLog License API — Cloudflare Worker + D1
 *
 * Endpoints:
 *   POST /license/activate    — Activate a key + bind device
 *   POST /license/verify      — Check if a key is valid
 *   POST /license/deactivate  — Unbind device from key
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
	device_id: string | null;
	email: string | null;
	order_id: string | null;
	activated_at: number | null;
	created_at: number;
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
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 to avoid confusion
	const segment = () => {
		let s = '';
		for (let i = 0; i < 4; i++) {
			s += chars[Math.floor(Math.random() * chars.length)];
		}
		return s;
	};
	return `TL-${segment()}-${segment()}-${segment()}`;
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

	const row = await env.DB.prepare('SELECT * FROM licenses WHERE key = ?')
		.bind(key.trim().toUpperCase())
		.first<LicenseRow>();

	if (!row) {
		return error('Invalid license key', 404);
	}

	if (row.status === 'revoked') {
		return error('This license has been revoked', 403);
	}

	if (row.status === 'active') {
		// Same device re-activating — OK
		if (row.device_id === deviceId) {
			return json({ success: true, status: 'active', message: 'Already activated on this device' });
		}
		// Different device
		return error('This license is already activated on another device. Deactivate it first.', 409);
	}

	// status === 'unused' → activate
	await env.DB.prepare(
		'UPDATE licenses SET status = ?, device_id = ?, activated_at = ? WHERE key = ?'
	)
		.bind('active', deviceId, Math.floor(Date.now() / 1000), key.trim().toUpperCase())
		.run();

	return json({ success: true, status: 'active', message: 'License activated successfully' });
}

async function handleVerify(request: Request, env: Env): Promise<Response> {
	const body = await request.json<{ key: string; deviceId: string }>();
	const { key, deviceId } = body;

	if (!key || !deviceId) {
		return error('Missing key or deviceId');
	}

	const row = await env.DB.prepare('SELECT * FROM licenses WHERE key = ?')
		.bind(key.trim().toUpperCase())
		.first<LicenseRow>();

	if (!row) {
		return json({ success: false, valid: false, error: 'Invalid license key' }, 404);
	}

	const valid = row.status === 'active' && row.device_id === deviceId;

	return json({
		success: true,
		valid,
		status: row.status,
		deviceMatch: row.device_id === deviceId,
	});
}

async function handleDeactivate(request: Request, env: Env): Promise<Response> {
	const body = await request.json<{ key: string; deviceId: string }>();
	const { key, deviceId } = body;

	if (!key || !deviceId) {
		return error('Missing key or deviceId');
	}

	const row = await env.DB.prepare('SELECT * FROM licenses WHERE key = ?')
		.bind(key.trim().toUpperCase())
		.first<LicenseRow>();

	if (!row) {
		return error('Invalid license key', 404);
	}

	if (row.status !== 'active') {
		return error('License is not active');
	}

	if (row.device_id !== deviceId) {
		return error('Device mismatch — cannot deactivate from a different device', 403);
	}

	await env.DB.prepare(
		'UPDATE licenses SET status = ?, device_id = NULL, activated_at = NULL WHERE key = ?'
	)
		.bind('unused', key.trim().toUpperCase())
		.run();

	return json({ success: true, message: 'License deactivated' });
}

async function handleAdminGenerate(request: Request, env: Env): Promise<Response> {
	const body = await request.json<{ count?: number; email?: string; orderId?: string }>();
	const count = Math.min(body.count || 10, 500); // Max 500 at a time

	const keys: string[] = [];

	for (let i = 0; i < count; i++) {
		const key = generateKey();
		await env.DB.prepare(
			'INSERT INTO licenses (key, email, order_id) VALUES (?, ?, ?)'
		)
			.bind(key, body.email || null, body.orderId || null)
			.run();
		keys.push(key);
	}

	return json({ success: true, count: keys.length, keys });
}

async function handleAdminList(env: Env): Promise<Response> {
	const { results } = await env.DB.prepare(
		'SELECT id, key, status, device_id, email, order_id, activated_at, created_at FROM licenses ORDER BY created_at DESC LIMIT 200'
	).all<LicenseRow>();

	const stats = await env.DB.prepare(
		`SELECT 
			COUNT(*) as total,
			SUM(CASE WHEN status = 'unused' THEN 1 ELSE 0 END) as unused,
			SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
			SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) as revoked
		 FROM licenses`
	).first<{ total: number; unused: number; active: number; revoked: number }>();

	return json({ success: true, stats, licenses: results });
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
		// Handle CORS preflight
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
			// Public endpoints
			if (path === '/license/activate' && request.method === 'POST') {
				return await handleActivate(request, env);
			}
			if (path === '/license/verify' && request.method === 'POST') {
				return await handleVerify(request, env);
			}
			if (path === '/license/deactivate' && request.method === 'POST') {
				return await handleDeactivate(request, env);
			}

			// Admin endpoints
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

			// Health check
			if (path === '/' || path === '/health') {
				return json({ status: 'ok', service: 'tidelog-license-api' });
			}

			return error('Not found', 404);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Internal server error';
			return error(message, 500);
		}
	},
} satisfies ExportedHandler<Env>;
