import type { D1Database, ExecutionContext } from '@cloudflare/workers-types';
import type { Env, LicenseRow } from './index';
import {
	FEATURES,
	QUOTA,
	checkQuota,
	periodKey,
	resetsAt,
	type Feature,
	type Tier,
} from './quota';

const DEEPSEEK_CHAT_COMPLETIONS_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';
const MAX_INPUT_TOKENS = 32_000;

type SubjectType = 'license' | 'free';
type AIFeature = Feature;
type AITier = Tier;

interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

interface GenerateBody {
	feature?: unknown;
	messages?: unknown;
	licenseKey?: unknown;
	deviceId?: unknown;
	trial?: unknown;
	stream?: unknown;
}

interface Identity {
	tier: AITier;
	subjectType: SubjectType;
	subjectId: string;
	freeAnchor: string | null;
}

interface ProviderRequest {
	messages: ChatMessage[];
	stream: boolean;
}

interface AIProvider {
	generate(request: ProviderRequest): Promise<Response>;
}

interface UsageTokens {
	input: number;
	output: number;
}

interface UsageCountRow {
	feature: AIFeature;
	used: number;
}

interface FreeQuotaRow {
	period: string;
	used_count: number;
}

function apiJson(data: unknown, status = 200): Response {
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

async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

function getClientIp(request: Request): string {
	return request.headers.get('CF-Connecting-IP')
		|| request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
		|| 'unknown';
}

function isLicenseExpired(row: LicenseRow, nowSeconds: number): boolean {
	return row.license_type !== 'lifetime'
		&& row.expires_at !== null
		&& nowSeconds > row.expires_at;
}

async function makeFreeAnchor(request: Request, deviceId: string): Promise<string> {
	const ipHash = await sha256Hex(getClientIp(request));
	return sha256Hex(`${deviceId}:${ipHash}`);
}

async function resolveIdentity(
	request: Request,
	env: Env,
	licenseKey: string | undefined,
	deviceId: string,
	trial: boolean,
): Promise<Identity | Response> {
	if (licenseKey) {
		const normalizedKey = licenseKey.trim().toUpperCase();
		const row = await env.DB.prepare('SELECT * FROM licenses WHERE key = ?')
			.bind(normalizedKey)
			.first<LicenseRow>();

		if (!row || isLicenseExpired(row, Math.floor(Date.now() / 1000))) {
			return apiJson({ error: 'invalid_license' }, 403);
		}

		const device = await env.DB.prepare(
			'SELECT 1 AS found FROM license_devices WHERE license_key = ? AND device_id = ?',
		).bind(normalizedKey, deviceId).first<{ found: number }>();

		if (!device || (row.status !== 'active' && row.status !== 'trial')) {
			return apiJson({ error: 'invalid_license' }, 403);
		}

		return {
			tier: row.status === 'trial' ? 'trial' : 'pro',
			subjectType: 'license',
			subjectId: normalizedKey,
			freeAnchor: null,
		};
	}

	const anchor = await makeFreeAnchor(request, deviceId);
	return {
		tier: trial ? 'trial' : 'free',
		subjectType: 'free',
		subjectId: anchor,
		freeAnchor: anchor,
	};
}

function parseMessages(value: unknown): ChatMessage[] | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	const messages: ChatMessage[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object') return null;
		const role = (item as { role?: unknown }).role;
		const content = (item as { content?: unknown }).content;
		if ((role !== 'system' && role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
			return null;
		}
		messages.push({ role, content });
	}
	return messages;
}

function isAIFeature(value: unknown): value is AIFeature {
	return typeof value === 'string' && FEATURES.includes(value as AIFeature);
}

/** Conservative tokenizer-free estimate: non-ASCII code points count as one token. */
export function estimateInputTokens(messages: ChatMessage[]): number {
	let ascii = 0;
	let nonAscii = 0;
	for (const message of messages) {
		for (const char of `${message.role}:${message.content}`) {
			if (char.codePointAt(0)! <= 0x7f) ascii += 1;
			else nonAscii += 1;
		}
	}
	return Math.ceil(ascii / 4) + nonAscii;
}

class DeepSeekProvider implements AIProvider {
	constructor(private readonly apiKey: string) {}

	generate(request: ProviderRequest): Promise<Response> {
		return fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
				Accept: request.stream ? 'text/event-stream' : 'application/json',
			},
			body: JSON.stringify({
				model: DEEPSEEK_MODEL,
				messages: request.messages,
				stream: request.stream,
				...(request.stream ? { stream_options: { include_usage: true } } : {}),
			}),
		});
	}
}

function providerFor(env: Env): AIProvider | null {
	return env.DEEPSEEK_API_KEY ? new DeepSeekProvider(env.DEEPSEEK_API_KEY) : null;
}

async function getUsedCount(
	db: D1Database,
	identity: Identity,
	feature: AIFeature,
	period: string,
	nowMs: number,
): Promise<number> {
	if (identity.tier === 'free' && feature === 'daily_insight' && identity.freeAnchor) {
		const row = await db.prepare('SELECT period, used_count FROM free_quota WHERE anchor = ?')
			.bind(identity.freeAnchor)
			.first<FreeQuotaRow>();
		return row?.period === period ? row.used_count : 0;
	}

	const rule = QUOTA[identity.tier][feature];
	const dailyClause = rule.window === 'day' ? ' AND created_at >= ?' : '';
	const statement = db.prepare(
		`SELECT COUNT(*) AS used FROM ai_usage
		 WHERE subject_type = ? AND subject_id = ? AND feature = ? AND period = ?${dailyClause}`,
	);
	const bindings: Array<string | number> = [
		identity.subjectType,
		identity.subjectId,
		feature,
		period,
	];
	if (rule.window === 'day') bindings.push(resetsAt('day', nowMs) - 86400);
	const row = await statement.bind(...bindings).first<{ used: number }>();
	return row?.used ?? 0;
}

async function reserveUsage(
	db: D1Database,
	identity: Identity,
	feature: AIFeature,
	period: string,
	estimatedInputTokens: number,
	nowMs: number,
): Promise<{ id: string; used: number } | Response> {
	const nowSeconds = Math.floor(nowMs / 1000);
	const rule = QUOTA[identity.tier][feature];
	const usedBefore = await getUsedCount(db, identity, feature, period, nowMs);
	const decision = checkQuota(identity.tier, feature, usedBefore, nowMs);

	if (rule.limit === 0) {
		return apiJson({ error: 'feature_not_available', feature }, 403);
	}
	if (!decision.allowed) {
		return apiJson({
			error: 'quota_exceeded',
			feature,
			used: decision.used,
			limit: decision.limit,
			resets_at: decision.resetsAt,
		}, 429);
	}

	if (identity.tier === 'free' && identity.freeAnchor) {
		await db.prepare(
			`INSERT INTO free_quota (anchor, period, used_count, created_at, updated_at)
			 VALUES (?, ?, 0, ?, ?)
			 ON CONFLICT(anchor) DO UPDATE SET
			   period = excluded.period,
			   used_count = CASE WHEN free_quota.period = excluded.period THEN free_quota.used_count ELSE 0 END,
			   updated_at = excluded.updated_at`,
		).bind(identity.freeAnchor, period, nowSeconds, nowSeconds).run();

		const increment = await db.prepare(
			'UPDATE free_quota SET used_count = used_count + 1, updated_at = ? WHERE anchor = ? AND period = ? AND used_count < ?',
		).bind(nowSeconds, identity.freeAnchor, period, rule.limit).run();
		if ((increment.meta.changes ?? 0) === 0) {
			const used = await getUsedCount(db, identity, feature, period, nowMs);
			return apiJson({
				error: 'quota_exceeded',
				feature,
				used,
				limit: rule.limit,
				resets_at: decision.resetsAt,
			}, 429);
		}
	}

	const id = crypto.randomUUID();
	let insert;
	if (rule.limit === null || identity.tier === 'free') {
		insert = await db.prepare(
			`INSERT INTO ai_usage
			 (id, subject_type, subject_id, feature, period, created_at, input_tokens, output_tokens)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
		).bind(id, identity.subjectType, identity.subjectId, feature, period, nowSeconds, estimatedInputTokens).run();
	} else {
		const dayStart = rule.window === 'day' ? resetsAt('day', nowMs) - 86400 : 0;
		insert = await db.prepare(
			`INSERT INTO ai_usage
			 (id, subject_type, subject_id, feature, period, created_at, input_tokens, output_tokens)
			 SELECT ?, ?, ?, ?, ?, ?, ?, 0
			 WHERE (
			   SELECT COUNT(*) FROM ai_usage
			   WHERE subject_type = ? AND subject_id = ? AND feature = ? AND period = ?
			     AND (? = 0 OR created_at >= ?)
			 ) < ?`,
		).bind(
			id, identity.subjectType, identity.subjectId, feature, period, nowSeconds, estimatedInputTokens,
			identity.subjectType, identity.subjectId, feature, period, dayStart, dayStart, rule.limit,
		).run();
	}

	if ((insert.meta.changes ?? 0) === 0) {
		if (identity.tier === 'free' && identity.freeAnchor) {
			await db.prepare(
				'UPDATE free_quota SET used_count = MAX(0, used_count - 1), updated_at = ? WHERE anchor = ? AND period = ?',
			).bind(nowSeconds, identity.freeAnchor, period).run();
		}
		const used = await getUsedCount(db, identity, feature, period, nowMs);
		return apiJson({
			error: 'quota_exceeded',
			feature,
			used,
			limit: rule.limit,
			resets_at: decision.resetsAt,
		}, 429);
	}

	return { id, used: usedBefore + 1 };
}

async function releaseReservation(
	db: D1Database,
	usageId: string,
	identity: Identity,
	period: string,
): Promise<void> {
	await db.prepare('DELETE FROM ai_usage WHERE id = ?').bind(usageId).run();
	if (identity.tier === 'free' && identity.freeAnchor) {
		await db.prepare(
			'UPDATE free_quota SET used_count = MAX(0, used_count - 1), updated_at = ? WHERE anchor = ? AND period = ?',
		).bind(Math.floor(Date.now() / 1000), identity.freeAnchor, period).run();
	}
}

async function finalizeUsage(db: D1Database, usageId: string, usage: UsageTokens): Promise<void> {
	await db.prepare('UPDATE ai_usage SET input_tokens = ?, output_tokens = ? WHERE id = ?')
		.bind(usage.input, usage.output, usageId)
		.run();
}

function parseUsage(value: unknown, fallback: UsageTokens): UsageTokens {
	if (!value || typeof value !== 'object') return fallback;
	const usage = value as { prompt_tokens?: unknown; completion_tokens?: unknown };
	return {
		input: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : fallback.input,
		output: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : fallback.output,
	};
}

function proxyStream(
	upstream: Response,
	db: D1Database,
	usageId: string,
	estimatedInputTokens: number,
	ctx: ExecutionContext,
): Response {
	if (!upstream.body) return apiJson({ error: 'provider_empty_response' }, 502);

	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
	const pump = (async () => {
		const reader = upstream.body!.getReader();
		const writer = writable.getWriter();
		const decoder = new TextDecoder();
		let buffer = '';
		let outputText = '';
		let reportedUsage: UsageTokens | null = null;

		const consumeLine = (rawLine: string) => {
			const line = rawLine.trim();
			if (!line.startsWith('data:')) return;
			const payload = line.slice(5).trim();
			if (!payload || payload === '[DONE]') return;
			try {
				const parsed = JSON.parse(payload) as {
					usage?: unknown;
					choices?: Array<{ delta?: { content?: string } }>;
				};
				outputText += parsed.choices?.[0]?.delta?.content ?? '';
				if (parsed.usage) {
					reportedUsage = parseUsage(parsed.usage, {
						input: estimatedInputTokens,
						output: Math.ceil(outputText.length / 4),
					});
				}
			} catch {
				// Ignore provider keep-alives and malformed telemetry; bytes still pass through.
			}
		};

		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';
				for (const line of lines) consumeLine(line);
				await writer.write(value);
			}
			buffer += decoder.decode();
			if (buffer) consumeLine(buffer);
			await writer.close();
		} catch (streamError) {
			await writer.abort(streamError).catch(() => undefined);
		} finally {
			const usage = reportedUsage ?? {
				input: estimatedInputTokens,
				output: Math.ceil(outputText.length / 4),
			};
			await finalizeUsage(db, usageId, usage).catch((error) => {
				console.error('[TideLog AI API] Failed to finalize streaming usage', error);
			});
		}
	})();
	ctx.waitUntil(pump);

	const headers = new Headers(upstream.headers);
	headers.set('Content-Type', 'text/event-stream; charset=utf-8');
	headers.set('Cache-Control', 'no-cache');
	headers.set('Access-Control-Allow-Origin', '*');
	headers.delete('Content-Length');
	return new Response(readable, { status: upstream.status, headers });
}

export async function handleAIGenerate(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
): Promise<Response> {
	let body: GenerateBody;
	try {
		body = await request.json<GenerateBody>();
	} catch {
		return apiJson({ error: 'invalid_json' }, 400);
	}

	if (!isAIFeature(body.feature)) return apiJson({ error: 'invalid_feature' }, 400);
	const messages = parseMessages(body.messages);
	if (!messages) return apiJson({ error: 'invalid_messages' }, 400);
	if (typeof body.deviceId !== 'string' || !body.deviceId.trim() || body.deviceId.length > 256) {
		return apiJson({ error: 'invalid_device_id' }, 400);
	}
	if (body.licenseKey !== undefined && typeof body.licenseKey !== 'string') {
		return apiJson({ error: 'invalid_license' }, 403);
	}

	const estimatedInputTokens = estimateInputTokens(messages);
	if (estimatedInputTokens > MAX_INPUT_TOKENS) {
		return apiJson({
			error: 'input_too_large',
			max_input_tokens: MAX_INPUT_TOKENS,
			estimated_input_tokens: estimatedInputTokens,
		}, 413);
	}

	const provider = providerFor(env);
	if (!provider) return apiJson({ error: 'provider_not_configured' }, 503);

	const identity = await resolveIdentity(
		request,
		env,
		typeof body.licenseKey === 'string' && body.licenseKey.trim() ? body.licenseKey : undefined,
		body.deviceId.trim(),
		body.trial === true,
	);
	if (identity instanceof Response) return identity;

	const nowMs = Date.now();
	const period = periodKey('month', nowMs);
	const reservation = await reserveUsage(
		env.DB,
		identity,
		body.feature,
		period,
		estimatedInputTokens,
		nowMs,
	);
	if (reservation instanceof Response) return reservation;

	let upstream: Response;
	try {
		upstream = await provider.generate({ messages, stream: body.stream !== false });
	} catch (providerError) {
		console.error('[TideLog AI API] DeepSeek request failed', providerError);
		await releaseReservation(env.DB, reservation.id, identity, period);
		return apiJson({ error: 'provider_unavailable' }, 502);
	}

	if (!upstream.ok) {
		console.error('[TideLog AI API] DeepSeek rejected request', upstream.status);
		await releaseReservation(env.DB, reservation.id, identity, period);
		return apiJson({ error: 'provider_error', status: upstream.status }, 502);
	}

	if (body.stream !== false) {
		if (!upstream.body) {
			await releaseReservation(env.DB, reservation.id, identity, period);
			return apiJson({ error: 'provider_empty_response' }, 502);
		}
		return proxyStream(upstream, env.DB, reservation.id, estimatedInputTokens, ctx);
	}

	const text = await upstream.text();
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		await releaseReservation(env.DB, reservation.id, identity, period);
		return apiJson({ error: 'provider_invalid_response' }, 502);
	}
	const usage = parseUsage(
		parsed && typeof parsed === 'object' ? (parsed as { usage?: unknown }).usage : undefined,
		{
			input: estimatedInputTokens,
			output: 0,
		},
	);
	await finalizeUsage(env.DB, reservation.id, usage);
	return apiJson(parsed);
}

export async function handleAIQuota(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const deviceId = url.searchParams.get('deviceId')?.trim();
	if (!deviceId || deviceId.length > 256) return apiJson({ error: 'invalid_device_id' }, 400);

	const identity = await resolveIdentity(
		request,
		env,
		url.searchParams.get('licenseKey')?.trim() || undefined,
		deviceId,
		url.searchParams.get('trial') === '1' || url.searchParams.get('trial') === 'true',
	);
	if (identity instanceof Response) return identity;

	const nowMs = Date.now();
	const period = periodKey('month', nowMs);
	const { results } = await env.DB.prepare(
		`SELECT feature, COUNT(*) AS used FROM ai_usage
		 WHERE subject_type = ? AND subject_id = ? AND period = ?
		 GROUP BY feature`,
	).bind(identity.subjectType, identity.subjectId, period).all<UsageCountRow>();
	const monthlyUsage = new Map(results.map((row) => [row.feature, row.used]));
	const features: Record<string, { used: number; limit: number | null; resets_at: number }> = {};

	for (const feature of FEATURES) {
		const rule = QUOTA[identity.tier][feature];
		let used = monthlyUsage.get(feature) ?? 0;
		if (identity.tier === 'free' && feature === 'daily_insight') {
			used = await getUsedCount(env.DB, identity, feature, period, nowMs);
		} else if (rule.window === 'day') {
			used = await getUsedCount(env.DB, identity, feature, period, nowMs);
		}
		const decision = checkQuota(identity.tier, feature, used, nowMs);
		features[feature] = {
			used,
			limit: decision.limit,
			resets_at: decision.resetsAt,
		};
	}

	return apiJson({ identity: identity.tier, period, features });
}
