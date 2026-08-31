import type { D1Database, ExecutionContext } from '@cloudflare/workers-types';
import type { Env, LicenseRow } from './index';
import { ANCHOR_SALT_MISSING, hmacHex, readAnchorSalt } from './anchor';
import { moderateMessages } from './moderation';
import { readJsonWithLimit } from './request';
import {
	FEATURES,
	MAX_REQUESTS_PER_SESSION,
	QUOTA,
	checkQuota,
	isLifetimeQuota,
	periodKey,
	resolveSessionUnit,
	resetsAt,
	type Feature,
	type Tier,
} from './quota';
import {
	TRIAL_STARTS_PER_IP_MONTHLY,
	TRIAL_STARTS_PER_IP_RISK_THRESHOLD,
	TRIAL_PERIOD_SEC,
	evaluateTrial,
	tierFromTrial,
	type TrialRow,
} from './trial';

const DEEPSEEK_CHAT_COMPLETIONS_URL = 'https://api.deepseek.com/chat/completions';
/**
 * 默认模型。可用 wrangler secret / vars 的 DEEPSEEK_MODEL 覆盖。
 *
 * 曾经写的是 `deepseek-chat`，那个别名**已于 2026-07-24 退役**，
 * 官方现役只有 deepseek-v4-flash / v4-pro / v4-flash-vision-exp。
 * 一个失效的默认模型不会在部署时报错，只会让每一次 AI 请求都被上游拒绝，
 * 所以下面加了显式校验，宁可启动即失败也不要静默全线 502。
 */
const DEEPSEEK_MODEL_DEFAULT = 'deepseek-v4-flash';

/**
 * 已知仍在服役的模型。用于挡住「配了个已退役的模型」这类错误。
 *
 * 这是白名单而不是黑名单：DeepSeek 上新模型时这里要跟着加一行，
 * 但代价远小于某天悄无声息地全线 502。
 */
const KNOWN_DEEPSEEK_MODELS = new Set([
	'deepseek-v4-flash',
	'deepseek-v4-pro',
	'deepseek-v4-flash-vision-exp',
]);
const MAX_INPUT_TOKENS = 32_000;
const MAX_AI_BODY_BYTES = 512 * 1024;
const MAX_CONTROL_BODY_BYTES = 64 * 1024;
/** 首次画像同时包含可见报告和完整画像；8K 留出完整正文空间，同时挡住 384K 超长输出。 */
const MAX_OUTPUT_TOKENS = 8_192;

interface TokenBudget {
	input: number;
	output: number;
}

/**
 * feature 由开源客户端声明，不能作为成本安全边界。以下总量护栏跨 feature 计数，
 * 正常重度 Pro 月用量约 1.27M 输入 / 206K 输出，仍留约 3 倍余量。
 */
const SUBJECT_TOKEN_BUDGET: Record<Tier, TokenBudget> = {
	free: { input: 250_000, output: 100_000 },
	trial: { input: 750_000, output: 250_000 },
	pro: { input: 4_000_000, output: 800_000 },
};
const FREE_IP_TOKEN_BUDGET: TokenBudget = { input: 1_000_000, output: 400_000 };
const TRIAL_IP_TOKEN_BUDGET: TokenBudget = { input: 4_000_000, output: 1_000_000 };

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
	sessionId?: unknown;
	stream?: unknown;
}

interface TrialBody {
	deviceId?: unknown;
	/** 1.1.49 本地试用向服务端迁移；必须成对出现，单位为 Unix 秒。 */
	legacyStartedAt?: unknown;
	legacyExpiresAt?: unknown;
}

type TrialState = 'eligible' | 'active' | 'expired' | 'ineligible';

interface Identity {
	tier: AITier;
	subjectType: SubjectType;
	subjectId: string;
	freeAnchor: string | null;
	/** 免费档的 IP 级锚点。deviceId 由客户端自填、可随意轮换，
	 *  只按 deviceId 计额度等于没有额度，故必须叠加一层客户端无法伪造的 IP 级上限。 */
	ipAnchor: string | null;
	/** 一次用户动作的标识。同一动作的多次 AI 请求只计一个配额单位。 */
	sessionId: string | null;
	/** 服务端判定的试用到期时间（Unix 秒）；非试用为 null。 */
	trialExpiresAt: number | null;
	/** 服务端保存的试用开始时间（Unix 秒）；从未开启为 null。 */
	trialStartedAt: number | null;
	/** 客户端只能展示这个状态，不能自行推导或开启。 */
	trialState: TrialState;
	/** 仅供 /trial/start 判断本次调用是否真正创建了记录。 */
	trialNewlyStarted: boolean;
	/** IP 仅是风险信号而非用户身份；供 quota 响应和运维日志审计。 */
	trialIpRisk: boolean;
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

function getClientIp(request: Request): string {
	return request.headers.get('CF-Connecting-IP')
		|| request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
		|| 'unknown';
}

function isLicenseExpired(row: LicenseRow, nowSeconds: number): boolean {
	return row.license_type !== 'lifetime'
		&& (row.expires_at === null || nowSeconds > row.expires_at);
}

/** 免费档单个 IP 每月可消耗的托管 AI 次数上限。
 *  高于单设备额度（3），以容纳同一 NAT/办公网下的多个真实用户；
 *  同时把「轮换 deviceId 无限刷」压到一个可接受的数字。 */
const FREE_IP_MONTHLY_CAP = 10;

/**
 * 读取匿名化盐值。
 *
 * 缺失时**拒绝服务**而不是退回无盐哈希：静默降级会让一个隐私控制在无人察觉的情况下失效，
 * 这正是本轮 trial 断链问题的成因模式。
 */
function anchorSalt(env: Env): string | Response {
	const salt = readAnchorSalt(env);
	if (!salt) {
		console.error('[TideLog AI API] ANCHOR_SALT 未配置，拒绝服务');
		return apiJson({ error: ANCHOR_SALT_MISSING }, 503);
	}
	return salt;
}

export async function makeFreeAnchor(request: Request, deviceId: string, salt: string): Promise<string> {
	// 主体必须跨网络稳定，否则换一个 Wi-Fi 就能重新获得“终身一次”的免费画像。
	// IP 成本护栏由独立的 ipAnchor 承担，不应混进用户主体标识。
	return hmacHex(salt, `free:${deviceId}`);
}

/** 只由 IP 决定的锚点。客户端无法伪造 CF-Connecting-IP。 */
export async function makeIpAnchor(request: Request, salt: string): Promise<string> {
	return hmacHex(salt, `ip:${getClientIp(request)}`);
}

/** 试用记录的设备锚点。与免费额度锚点分开，避免同一值被跨用途关联。 */
export async function makeTrialAnchor(deviceId: string, salt: string): Promise<string> {
	return hmacHex(salt, `trial:${deviceId}`);
}

/** 本月起点（UTC+8），与 quota.ts 的周期口径一致。计数与原子插入必须用同一个边界。 */
function monthStartSec(nowMs: number): number {
	const TZ = 8 * 60 * 60 * 1000;
	const d = new Date(nowMs + TZ);
	return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - TZ) / 1000);
}

/** 该 IP 本月开启了多少个试用。用于限制"换 deviceId 刷试用"。 */
async function countTrialStartsForIp(db: D1Database, ipHash: string, nowMs: number): Promise<number> {
	const startSec = monthStartSec(nowMs);
	const row = await db.prepare(
		'SELECT COUNT(*) AS n FROM device_trials WHERE ip_hash = ? AND started_at >= ?',
	).bind(ipHash, startSec).first<{ n: number }>();
	return row?.n ?? 0;
}

async function resolveIdentity(
	request: Request,
	env: Env,
	licenseKey: string | undefined,
	deviceId: string,
	trialRequested: boolean,
	sessionId: string | null,
	/** 只有用户明确点击的 /trial/start 才允许落库；生成与配额查询都不得开启试用。 */
	persistTrialStart: boolean,
	salt: string,
	legacyTrialWindow: TrialRow | null = null,
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
			ipAnchor: null,
			sessionId,
			trialExpiresAt: null,
			trialStartedAt: null,
			trialState: 'ineligible',
			trialNewlyStarted: false,
			trialIpRisk: false,
		};
	}

	const anchor = await makeFreeAnchor(request, deviceId, salt);
	const ipAnchor = await makeIpAnchor(request, salt);

	// —— 服务端权威试用 ——
	// 客户端发来的 trial 只是申请。是否处于试用、何时到期，一律由服务端记录决定。
	const nowMs = Date.now();
	const nowSec = Math.floor(nowMs / 1000);
	const trialAnchor = await makeTrialAnchor(deviceId, salt);
	// 试用记录里的 IP 哈希与 ipAnchor 同源，同样不可反解。
	const ipHash = ipAnchor;

	let persistedTrial = await env.DB.prepare(
		'SELECT started_at, expires_at FROM device_trials WHERE anchor = ?',
	).bind(trialAnchor).first<TrialRow>();

	let ipStarts = 0;
	if (!persistedTrial && trialRequested) {
		ipStarts = await countTrialStartsForIp(env.DB, ipHash, nowMs);
	}

	let outcome = evaluateTrial(trialRequested, persistedTrial ?? null, ipStarts, nowSec);
	let trialNewlyStarted = false;

	if (outcome.kind === 'start' && persistTrialStart) {
		// 1.1.49 已经由用户点击开启、但只保存在本地。升级时把原窗口迁入服务端，
		// 避免续送 7 天或让仍在试用中的用户突然降级。窗口在入口处严格校验。
		if (legacyTrialWindow) {
			outcome = {
				kind: 'start',
				startedAt: legacyTrialWindow.started_at,
				expiresAt: legacyTrialWindow.expires_at,
			};
		}
		// 「先 COUNT 再 INSERT」挡不住并发：多个 deviceId 不同的请求会读到同一个低计数，
		// 各自插入成功，IP 上限就不是硬上限了。把 anchor 去重与 IP 上限都写进 INSERT 自身，
		// 由 SQLite 在单条语句内保证原子性。
		const insert = await env.DB.prepare(
			`INSERT INTO device_trials (anchor, ip_hash, started_at, expires_at)
			 SELECT ?, ?, ?, ?
			 WHERE NOT EXISTS (SELECT 1 FROM device_trials WHERE anchor = ?)
			   AND (
			     SELECT COUNT(*) FROM device_trials WHERE ip_hash = ? AND started_at >= ?
			   ) < ?`,
		).bind(
			trialAnchor, ipHash, outcome.startedAt, outcome.expiresAt,
			trialAnchor,
			ipHash, monthStartSec(nowMs), TRIAL_STARTS_PER_IP_MONTHLY,
		).run();

		if ((insert.meta.changes ?? 0) === 0) {
			// 两种可能：并发请求已经为同一设备建好记录（那条记录才是权威），
			// 或这一刻该 IP 的名额刚好被占满。回读来区分，不要猜。
			persistedTrial = await env.DB.prepare(
				'SELECT started_at, expires_at FROM device_trials WHERE anchor = ?',
			).bind(trialAnchor).first<TrialRow>();
			outcome = persistedTrial
				? evaluateTrial(trialRequested, persistedTrial, 0, nowSec)
				: { kind: 'refused_ip_cap' };
		} else {
			trialNewlyStarted = true;
			if (legacyTrialWindow) {
				persistedTrial = legacyTrialWindow;
				outcome = evaluateTrial(true, legacyTrialWindow, 0, nowSec);
			}
		}
	}

	const trialExpiresAt = outcome.kind === 'active'
		|| outcome.kind === 'start'
		|| outcome.kind === 'expired'
		? outcome.expiresAt
		: null;
	const trialStartedAt = outcome.kind === 'start'
		? outcome.startedAt
		: persistedTrial?.started_at ?? null;
	const trialState: TrialState = outcome.kind === 'active' || outcome.kind === 'start'
		? 'active'
		: outcome.kind === 'expired'
			? 'expired'
			: 'eligible';

	if (outcome.kind === 'refused_ip_cap') {
		// 这是唯一由 IP 试用护栏引起的拒绝。显式错误码让客户端和日志都能区分它，
		// 而不是把用户伪装成 free 后再报 feature_not_available。
		console.warn('[TideLog AI API] trial_ip_cap_reached', { limit: TRIAL_STARTS_PER_IP_MONTHLY });
		return apiJson({
			error: 'trial_start_refused',
			scope: 'ip',
			limit: TRIAL_STARTS_PER_IP_MONTHLY,
			resets_at: monthStartSec(nowMs + 32 * 24 * 60 * 60 * 1000),
		}, 429);
	}

	return {
		tier: tierFromTrial(outcome),
		subjectType: 'free',
		subjectId: anchor,
		freeAnchor: anchor,
		ipAnchor,
		sessionId,
		trialExpiresAt,
		trialStartedAt,
		trialState,
		trialNewlyStarted,
		trialIpRisk: !persistedTrial && trialRequested && ipStarts >= TRIAL_STARTS_PER_IP_RISK_THRESHOLD,
	};
}

function parseDeviceId(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const deviceId = value.trim();
	return deviceId && deviceId.length <= 256 ? deviceId : null;
}

function parseLegacyTrialWindow(body: TrialBody, nowSec: number): TrialRow | null | 'invalid' {
	const hasStarted = body.legacyStartedAt !== undefined;
	const hasExpires = body.legacyExpiresAt !== undefined;
	if (!hasStarted && !hasExpires) return null;
	if (!hasStarted || !hasExpires) return 'invalid';
	if (!Number.isInteger(body.legacyStartedAt) || !Number.isInteger(body.legacyExpiresAt)) return 'invalid';
	const startedAt = body.legacyStartedAt as number;
	const expiresAt = body.legacyExpiresAt as number;
	const oldestAccepted = nowSec - 180 * 24 * 60 * 60;
	if (startedAt < oldestAccepted || startedAt > nowSec + 60) return 'invalid';
	if (expiresAt - startedAt !== TRIAL_PERIOD_SEC) return 'invalid';
	if (expiresAt > nowSec + TRIAL_PERIOD_SEC + 60) return 'invalid';
	return { started_at: startedAt, expires_at: expiresAt };
}

function trialPayload(identity: Identity): Record<string, unknown> {
	return {
		state: identity.trialState,
		started_at: identity.trialStartedAt,
		expires_at: identity.trialExpiresAt,
		newly_started: identity.trialNewlyStarted,
	};
}

/** 只读查询服务端试用状态；客户端本地时间从来不是权威。 */
export async function handleTrialStatus(request: Request, env: Env): Promise<Response> {
	const deviceId = parseDeviceId(new URL(request.url).searchParams.get('deviceId'));
	if (!deviceId) return apiJson({ error: 'invalid_device_id' }, 400);

	const salt = anchorSalt(env);
	if (salt instanceof Response) return salt;
	const identity = await resolveIdentity(request, env, undefined, deviceId, false, null, false, salt);
	if (identity instanceof Response) return identity;
	return apiJson(trialPayload(identity));
}

/**
 * 用户点击按钮时唯一允许创建试用记录的入口。
 * 重试是幂等的；已过期时返回 409，且绝不更新原有起止时间。
 */
export async function handleTrialStart(request: Request, env: Env): Promise<Response> {
	const parsed = await readJsonWithLimit(request, MAX_CONTROL_BODY_BYTES);
	if (!parsed.ok) {
		return apiJson({ error: parsed.error }, parsed.error === 'body_too_large' ? 413 : 400);
	}
	const body = parsed.value as TrialBody;
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return apiJson({ error: 'invalid_json' }, 400);
	}
	const deviceId = parseDeviceId(body.deviceId);
	if (!deviceId) return apiJson({ error: 'invalid_device_id' }, 400);
	const nowSec = Math.floor(Date.now() / 1000);
	const legacyTrialWindow = parseLegacyTrialWindow(body, nowSec);
	if (legacyTrialWindow === 'invalid') return apiJson({ error: 'invalid_legacy_trial_window' }, 400);

	const salt = anchorSalt(env);
	if (salt instanceof Response) return salt;
	const identity = await resolveIdentity(
		request, env, undefined, deviceId, true, null, true, salt, legacyTrialWindow,
	);
	if (identity instanceof Response) return identity;

	if (identity.trialState === 'expired') {
		return apiJson({ error: 'trial_already_used', ...trialPayload(identity) }, 409);
	}
	if (identity.trialState !== 'active') {
		return apiJson({ error: 'trial_start_failed', ...trialPayload(identity) }, 500);
	}
	return apiJson({ success: true, ...trialPayload(identity) });
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
	constructor(private readonly apiKey: string, private readonly model: string) {}

	generate(request: ProviderRequest): Promise<Response> {
		return fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
				Accept: request.stream ? 'text/event-stream' : 'application/json',
			},
			body: JSON.stringify({
				model: this.model,
				messages: request.messages,
				// V4 默认开启思考模式。TideLog 过去使用的 deepseek-chat 是非思考模式；
				// 若迁移模型名却不显式关闭，4096 token 可能全耗在 reasoning_content，
				// 最终 message.content 为空，客户端只能看到 TL-5002。
				thinking: { type: 'disabled' },
				max_tokens: MAX_OUTPUT_TOKENS,
				stream: request.stream,
				...(request.stream ? { stream_options: { include_usage: true } } : {}),
			}),
		});
	}
}

function providerFor(env: Env): AIProvider | null {
	// 防御性 trim：wrangler secret put 经由管道注入时极易混入尾部换行，
	// 带空白的 Authorization 头会被 DeepSeek 以 401 拒绝，且极难排查。
	const key = env.DEEPSEEK_API_KEY?.trim();
	const model = env.DEEPSEEK_MODEL?.trim() || DEEPSEEK_MODEL_DEFAULT;
	if (!KNOWN_DEEPSEEK_MODELS.has(model)) {
		// 不阻断（DeepSeek 上新时不应该被这里卡住），但要留下可检索的证据。
		console.error(
			`[TideLog AI API] DEEPSEEK_MODEL="${model}" 不在已知现役模型列表内，`
			+ `已知：${[...KNOWN_DEEPSEEK_MODELS].join(', ')}。若上游返回 model not found，先查这里。`,
		);
	}
	return key ? new DeepSeekProvider(key, model) : null;
}

/**
 * 已消耗的配额单位数。
 *
 * 单位是"一次用户动作"，不是"一次 AI 请求"。一次复盘会发出多次请求
 * （每题一次 + 收尾一次 + 3 条计划建议），按请求计数会让免费用户
 * 一次复盘就用光整月额度。同一 session_id 的所有请求只计一个单位；
 * 没有 session_id 的老请求各自计一个单位（COALESCE 到行 id）。
 */
async function getUsedCount(
	db: D1Database,
	identity: Identity,
	feature: AIFeature,
	period: string,
	nowMs: number,
): Promise<number> {
	if (isLifetimeQuota(identity.tier, feature)) {
		const row = await db.prepare(
			`SELECT COUNT(*) AS used FROM ai_usage
			 WHERE subject_type = ? AND subject_id = ? AND feature = ?`,
		).bind(identity.subjectType, identity.subjectId, feature).first<{ used: number }>();
		return row?.used ?? 0;
	}

	const rule = QUOTA[identity.tier][feature];
	const dailyClause = rule.window === 'day' ? ' AND created_at >= ?' : '';
	const statement = db.prepare(
		`SELECT COUNT(DISTINCT COALESCE(session_id, id)) AS used FROM ai_usage
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

/** 该 IP 本周期消耗的配额单位数（跨 feature）。客户端伪造不了 IP，这是免费档真正的成本护栏。 */
async function getIpUnitCount(db: D1Database, ipAnchor: string, period: string): Promise<number> {
	const row = await db.prepare(
		`SELECT COUNT(DISTINCT COALESCE(session_id, id)) AS used FROM ai_usage
		 WHERE ip_anchor = ? AND period = ?`,
	).bind(ipAnchor, period).first<{ used: number }>();
	return row?.used ?? 0;
}

/** 该动作已经发起过多少次请求。0 表示这是本动作的第一次请求（需要扣减配额）。 */
async function countSessionRequests(
	db: D1Database,
	identity: Identity,
	feature: AIFeature,
	period: string,
): Promise<number> {
	if (!identity.sessionId) return 0;
	const row = await db.prepare(
		`SELECT COUNT(*) AS n FROM ai_usage
		 WHERE subject_type = ? AND subject_id = ? AND feature = ? AND period = ? AND session_id = ?`,
	).bind(identity.subjectType, identity.subjectId, feature, period, identity.sessionId)
		.first<{ n: number }>();
	return row?.n ?? 0;
}

interface TokenUsageRow {
	input: number;
	output: number;
}

async function getTokenUsage(
	db: D1Database,
	field: 'subject_id' | 'ip_anchor',
	value: string,
	windowStart: number,
	subjectType?: Identity['subjectType'],
): Promise<TokenUsageRow> {
	if (field === 'subject_id' && !subjectType) {
		throw new Error('subjectType is required for subject token usage');
	}
	const subjectClause = field === 'subject_id' ? ' AND subject_type = ?' : '';
	const bindings: Array<string | number> = [value, windowStart];
	if (field === 'subject_id') bindings.push(subjectType!);
	const row = await db.prepare(
		`SELECT COALESCE(SUM(input_tokens), 0) AS input,
		        COALESCE(SUM(output_tokens), 0) AS output
		 FROM ai_usage WHERE ${field} = ? AND created_at >= ?${subjectClause}`,
	).bind(...bindings).first<TokenUsageRow>();
	return { input: row?.input ?? 0, output: row?.output ?? 0 };
}

function budgetResetAt(identity: Identity, nowMs: number): number {
	if (identity.tier === 'trial' && identity.trialExpiresAt) return identity.trialExpiresAt;
	return resetsAt('month', nowMs);
}

async function tokenBudgetError(
	db: D1Database,
	identity: Identity,
	estimatedInputTokens: number,
	nowMs: number,
): Promise<Response | null> {
	const subjectStart = identity.tier === 'trial' && identity.trialStartedAt
		? identity.trialStartedAt
		: monthStartSec(nowMs);
	const subjectBudget = SUBJECT_TOKEN_BUDGET[identity.tier];
	const subjectUsage = await getTokenUsage(
		db,
		'subject_id',
		identity.subjectId,
		subjectStart,
		identity.subjectType,
	);
	if (subjectUsage.input + estimatedInputTokens > subjectBudget.input
		|| subjectUsage.output + MAX_OUTPUT_TOKENS > subjectBudget.output) {
		return apiJson({
			error: 'fair_use_limit_reached',
			scope: 'subject',
			resets_at: budgetResetAt(identity, nowMs),
		}, 429);
	}

	const ipBudget = identity.tier === 'free'
		? FREE_IP_TOKEN_BUDGET
		: identity.tier === 'trial'
			? TRIAL_IP_TOKEN_BUDGET
			: null;
	if (ipBudget && identity.ipAnchor) {
		const ipUsage = await getTokenUsage(db, 'ip_anchor', identity.ipAnchor, monthStartSec(nowMs));
		if (ipUsage.input + estimatedInputTokens > ipBudget.input
			|| ipUsage.output + MAX_OUTPUT_TOKENS > ipBudget.output) {
			return apiJson({
				error: 'fair_use_limit_reached',
				scope: 'ip',
				resets_at: resetsAt('month', nowMs),
			}, 429);
		}
	}
	return null;
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
	const lifetimeQuota = isLifetimeQuota(identity.tier, feature);
	const usedBefore = await getUsedCount(db, identity, feature, period, nowMs);
	// 一次性画像本身只有一个请求；不能让客户端复用 sessionId 绕过“一次”。
	const meteringSessionId = lifetimeQuota ? null : identity.sessionId;
	const sessionRequests = lifetimeQuota ? 0 : await countSessionRequests(db, identity, feature, period);
	const { counted } = resolveSessionUnit(meteringSessionId, sessionRequests);
	// 已经计过配额的动作直接放行——否则一次复盘的后续请求会被自己的第一条请求挡住。
	if (!counted) {
		if (rule.limit === 0) {
			return apiJson({ error: 'feature_not_available', feature }, 403);
		}
		const decision = checkQuota(identity.tier, feature, usedBefore, nowMs);
		if (!decision.allowed) {
			return apiJson({
				error: 'quota_exceeded',
				feature,
				used: decision.used,
				limit: decision.limit,
				resets_at: decision.resetsAt,
			}, 429);
		}
		if (identity.tier === 'free' && identity.ipAnchor) {
			const ipUnits = await getIpUnitCount(db, identity.ipAnchor, period);
			if (ipUnits >= FREE_IP_MONTHLY_CAP) {
				return apiJson({
					error: 'quota_exceeded',
					feature,
					scope: 'ip',
					limit: FREE_IP_MONTHLY_CAP,
					resets_at: resetsAt('month', nowMs),
				}, 429);
			}
		}
	}

	// 先返回 feature/quota 的产品语义，再检查跨 feature 的防滥用总量。
	const budgetError = await tokenBudgetError(db, identity, estimatedInputTokens, nowMs);
	if (budgetError) return budgetError;

	const id = crypto.randomUUID();
	const cols = '(id, subject_type, subject_id, feature, period, created_at, input_tokens, output_tokens, session_id, ip_anchor)';
	const values: Array<string | number | null> = [
		id, identity.subjectType, identity.subjectId, feature, period, nowSeconds,
		estimatedInputTokens, MAX_OUTPUT_TOKENS, meteringSessionId, identity.ipAnchor,
	];

	// 上面的预检查只是为了给出准确的错误信息。真正的上限判定必须写进 INSERT 本身：
	// 并发请求会同时通过预检查，此前 IP 上限就是这样被绕过的
	// ——轮换 deviceId/sessionId 即可让多条请求都在 used < 上限 时通过。
	const conditions: string[] = [];
	const conditionBindings: Array<string | number> = [];

	// session 请求数也必须由 INSERT 原子判定。预读只用于更好的错误信息；并发
	// 第 12 条请求会在这里串行看到最新计数，超过 12 的请求写 NULL 并独立扣减。
	const sessionCanReuse = meteringSessionId
		? `(SELECT COUNT(*) FROM ai_usage WHERE subject_type = ? AND subject_id = ? AND feature = ? AND period = ? AND session_id = ?) BETWEEN 1 AND ${MAX_REQUESTS_PER_SESSION - 1}`
		: '0';
	const sessionHasRoom = meteringSessionId
		? `(SELECT COUNT(*) FROM ai_usage WHERE subject_type = ? AND subject_id = ? AND feature = ? AND period = ? AND session_id = ?) < ${MAX_REQUESTS_PER_SESSION}`
		: '0';
	const sessionBindings = meteringSessionId
		? [identity.subjectType, identity.subjectId, feature, period, meteringSessionId]
		: [];

	if (rule.limit !== null) {
		if (lifetimeQuota) {
			conditions.push(
				`(SELECT COUNT(*) FROM ai_usage
				  WHERE subject_type = ? AND subject_id = ? AND feature = ?) < ?`,
			);
			conditionBindings.push(identity.subjectType, identity.subjectId, feature, rule.limit);
		} else {
			const dayStart = rule.window === 'day' ? resetsAt('day', nowMs) - 86400 : 0;
			conditions.push(
				`((${sessionCanReuse}) OR (SELECT COUNT(DISTINCT COALESCE(session_id, id)) FROM ai_usage
				  WHERE subject_type = ? AND subject_id = ? AND feature = ? AND period = ?
				    AND (? = 0 OR created_at >= ?)) < ?)`,
			);
			conditionBindings.push(...sessionBindings,
				identity.subjectType, identity.subjectId, feature, period, dayStart, dayStart, rule.limit,
			);
		}
	}

	// IP 上限与 feature 上限相互独立：档位不限次（limit === null）时它依然要生效。
	if (identity.tier === 'free' && identity.ipAnchor) {
		conditions.push(
			`((${sessionCanReuse}) OR (SELECT COUNT(DISTINCT COALESCE(session_id, id)) FROM ai_usage
			  WHERE ip_anchor = ? AND period = ?) < ?)`,
		);
		conditionBindings.push(...sessionBindings, identity.ipAnchor, period, FREE_IP_MONTHLY_CAP);
	}

	// 总 token 护栏跨 feature 生效，且必须与预占写在同一条 INSERT 中，否则并发
	// 伪造 feature 仍能一起越过成本上限。output_tokens 先预占 MAX_OUTPUT_TOKENS，
	// 上游结束后再用真实值覆盖。
	const subjectStart = identity.tier === 'trial' && identity.trialStartedAt
		? identity.trialStartedAt
		: monthStartSec(nowMs);
	const subjectBudget = SUBJECT_TOKEN_BUDGET[identity.tier];
	conditions.push(
		`(SELECT COALESCE(SUM(input_tokens), 0) FROM ai_usage
		  WHERE subject_type = ? AND subject_id = ? AND created_at >= ?) + ? <= ?`,
		`(SELECT COALESCE(SUM(output_tokens), 0) FROM ai_usage
		  WHERE subject_type = ? AND subject_id = ? AND created_at >= ?) + ? <= ?`,
	);
	conditionBindings.push(
		identity.subjectType, identity.subjectId, subjectStart, estimatedInputTokens, subjectBudget.input,
		identity.subjectType, identity.subjectId, subjectStart, MAX_OUTPUT_TOKENS, subjectBudget.output,
	);
	const ipBudget = identity.tier === 'free'
		? FREE_IP_TOKEN_BUDGET
		: identity.tier === 'trial'
			? TRIAL_IP_TOKEN_BUDGET
			: null;
	if (ipBudget && identity.ipAnchor) {
		const ipStart = monthStartSec(nowMs);
		conditions.push(
			`(SELECT COALESCE(SUM(input_tokens), 0) FROM ai_usage
			  WHERE ip_anchor = ? AND created_at >= ?) + ? <= ?`,
			`(SELECT COALESCE(SUM(output_tokens), 0) FROM ai_usage
			  WHERE ip_anchor = ? AND created_at >= ?) + ? <= ?`,
		);
		conditionBindings.push(
			identity.ipAnchor, ipStart, estimatedInputTokens, ipBudget.input,
			identity.ipAnchor, ipStart, MAX_OUTPUT_TOKENS, ipBudget.output,
		);
	}

	const insert = conditions.length === 0
		? await db.prepare(`INSERT INTO ai_usage ${cols} VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ${sessionHasRoom} THEN ? ELSE NULL END, ?)`)
			.bind(...values.slice(0, 8), ...sessionBindings, meteringSessionId, identity.ipAnchor).run()
		: await db.prepare(
			`INSERT INTO ai_usage ${cols}
			 SELECT ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ${sessionHasRoom} THEN ? ELSE NULL END, ?
			 WHERE ${conditions.join('\n\t\t\t   AND ')}`,
		).bind(...values.slice(0, 8), ...sessionBindings, meteringSessionId, identity.ipAnchor, ...conditionBindings).run();

	if ((insert.meta.changes ?? 0) === 0) {
		const budgetErrorAfterRace = await tokenBudgetError(db, identity, estimatedInputTokens, nowMs);
		if (budgetErrorAfterRace) return budgetErrorAfterRace;
		// 哪一条上限挡住了这次请求？回查一次，别把 IP 护栏报成 feature 配额用尽。
		if (identity.tier === 'free' && identity.ipAnchor) {
			const ipUnits = await getIpUnitCount(db, identity.ipAnchor, period);
			if (ipUnits >= FREE_IP_MONTHLY_CAP) {
				return apiJson({
					error: 'quota_exceeded',
					feature,
					scope: 'ip',
					limit: FREE_IP_MONTHLY_CAP,
					resets_at: resetsAt('month', nowMs),
				}, 429);
			}
		}
		const used = await getUsedCount(db, identity, feature, period, nowMs);
		return apiJson({
			error: 'quota_exceeded',
			feature,
			used,
			limit: rule.limit,
			resets_at: lifetimeQuota ? null : resetsAt(rule.window, nowMs),
		}, 429);
	}

	return { id, used: counted ? usedBefore : usedBefore + 1 };
}

/**
 * 释放预占。
 *
 * 配额消耗现在完全由 ai_usage 的行推导，删掉行即等于退回配额，
 * 不再需要手工加减计数器——原先三处回滚逻辑必须两两保持一致，是个易错点。
 */
async function releaseReservation(db: D1Database, usageId: string): Promise<void> {
	await db.prepare('DELETE FROM ai_usage WHERE id = ?').bind(usageId).run();
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
		let completed = false;

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
			completed = true;
		} catch (streamError) {
			await writer.abort(streamError).catch(() => undefined);
		} finally {
			if (completed && outputText.trim()) {
				const usage = reportedUsage ?? {
					input: estimatedInputTokens,
					output: Math.ceil(outputText.length / 4),
				};
				await finalizeUsage(db, usageId, usage).catch((error) => {
					console.error('[TideLog AI API] Failed to finalize streaming usage', error);
				});
			} else {
				await releaseReservation(db, usageId).catch((error) => {
					console.error('[TideLog AI API] Failed to release interrupted streaming usage', error);
				});
			}
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
	const parsedBody = await readJsonWithLimit(request, MAX_AI_BODY_BYTES);
	if (!parsedBody.ok) {
		return apiJson({ error: parsedBody.error }, parsedBody.error === 'body_too_large' ? 413 : 400);
	}
	const body = parsedBody.value as GenerateBody;
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
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
	// sessionId 标识"一次用户动作"。缺省时退化为按请求计量（旧客户端行为）。
	const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim()
		? body.sessionId.trim().slice(0, 128)
		: null;

	// 内容合规检查（DeepSeek 服务协议 3.4 条要求）。
	// 在扣减配额和转发之前执行；只返回类目，不记录任何笔记内容。
	const moderation = moderateMessages(messages);
	if (!moderation.allowed) {
		return apiJson({
			error: 'content_blocked',
			categories: moderation.categories,
		}, 422);
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

	const salt = anchorSalt(env);
	if (salt instanceof Response) return salt;

	const identity = await resolveIdentity(
		request,
		env,
		typeof body.licenseKey === 'string' && body.licenseKey.trim() ? body.licenseKey : undefined,
		body.deviceId.trim(),
		// 普通生成只能读取试用记录，绝不能顺带创建或延长试用。
		false,
		sessionId,
		false,
		salt,
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
		await releaseReservation(env.DB, reservation.id);
		return apiJson({ error: 'provider_unavailable' }, 502);
	}

	if (!upstream.ok) {
		// 上游错误体通常写明了原因（无效 Key、模型不存在、余额不足等）。
		// 只写日志、不返回给客户端，避免把上游细节暴露给终端用户。
		let detail = '';
		try { detail = (await upstream.clone().text()).slice(0, 500); } catch { /* 忽略 */ }
		console.error('[TideLog AI API] DeepSeek rejected request', upstream.status, detail);
		// 模型不存在是配置错误，不是用户问题。单独打一条醒目日志，
		// 否则它会混在普通的 502 里，等到用户来报障才被发现。
		if (/model.*(not\s*found|does\s*not\s*exist|invalid)/i.test(detail)) {
			console.error(
				'[TideLog AI API] 配置的模型不被上游接受，请检查 DEEPSEEK_MODEL；'
				+ `当前值=${env.DEEPSEEK_MODEL?.trim() || DEEPSEEK_MODEL_DEFAULT}`,
			);
		}
		await releaseReservation(env.DB, reservation.id);
		return apiJson({ error: 'provider_error', status: upstream.status }, 502);
	}

	if (body.stream !== false) {
		if (!upstream.body) {
			await releaseReservation(env.DB, reservation.id);
			return apiJson({ error: 'provider_empty_response' }, 502);
		}
		return proxyStream(upstream, env.DB, reservation.id, estimatedInputTokens, ctx);
	}

	let text: string;
	try {
		text = await upstream.text();
	} catch (providerError) {
		console.error('[TideLog AI API] DeepSeek buffered response interrupted', providerError);
		await releaseReservation(env.DB, reservation.id);
		return apiJson({ error: 'provider_unavailable' }, 502);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		await releaseReservation(env.DB, reservation.id);
		return apiJson({ error: 'provider_invalid_response' }, 502);
	}
	const completion = parsed && typeof parsed === 'object'
		? (parsed as { choices?: Array<{ message?: { content?: unknown } }> })
			.choices?.[0]?.message?.content
		: undefined;
	if (typeof completion !== 'string' || !completion.trim()) {
		await releaseReservation(env.DB, reservation.id);
		return apiJson({ error: 'provider_empty_response' }, 502);
	}
	const usage = parseUsage(
		parsed && typeof parsed === 'object' ? (parsed as { usage?: unknown }).usage : undefined,
		{
			input: estimatedInputTokens,
			output: 0,
		},
	);
	try {
		await finalizeUsage(env.DB, reservation.id, usage);
	} catch (accountingError) {
		console.error('[TideLog AI API] Failed to finalize buffered usage', accountingError);
		await releaseReservation(env.DB, reservation.id).catch((releaseError) => {
			console.error('[TideLog AI API] Failed to release buffered usage', releaseError);
		});
		return apiJson({ error: 'usage_finalize_failed' }, 503);
	}
	return apiJson(parsed);
}

export async function handleAIQuota(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const deviceId = url.searchParams.get('deviceId')?.trim();
	if (!deviceId || deviceId.length > 256) return apiJson({ error: 'invalid_device_id' }, 400);

	const quotaSalt = anchorSalt(env);
	if (quotaSalt instanceof Response) return quotaSalt;

	const identity = await resolveIdentity(
		request,
		env,
		url.searchParams.get('licenseKey')?.trim() || undefined,
		deviceId,
		false,
		null,
		false,
		quotaSalt,
	);
	if (identity instanceof Response) return identity;

	const nowMs = Date.now();
	const period = periodKey('month', nowMs);
	// 与扣减口径一致：按配额单位（一次用户动作）统计，而不是按请求数。
	const { results } = await env.DB.prepare(
		`SELECT feature, COUNT(DISTINCT COALESCE(session_id, id)) AS used FROM ai_usage
		 WHERE subject_type = ? AND subject_id = ? AND period = ?
		 GROUP BY feature`,
	).bind(identity.subjectType, identity.subjectId, period).all<UsageCountRow>();
	const monthlyUsage = new Map(results.map((row) => [row.feature, row.used]));
	const features: Record<string, { used: number; limit: number | null; resets_at: number | null }> = {};

	for (const feature of FEATURES) {
		const rule = QUOTA[identity.tier][feature];
		let used = monthlyUsage.get(feature) ?? 0;
		// 日窗口需要按当日重新统计，月窗口可直接用上面的分组结果。
		if (rule.window === 'day' || isLifetimeQuota(identity.tier, feature)) {
			used = await getUsedCount(env.DB, identity, feature, period, nowMs);
		}
		const decision = checkQuota(identity.tier, feature, used, nowMs);
		features[feature] = {
			used,
			limit: decision.limit,
			resets_at: decision.resetsAt,
		};
	}

	return apiJson({
		identity: identity.tier,
		period,
		features,
		trial_state: identity.trialState,
		trial_started_at: identity.trialStartedAt,
		trial_expires_at: identity.trialExpiresAt,
		// 超过 3 次只作为审计信号，不影响可用性；第 12 次才由上面的明确 429 拒绝。
		trial_ip_risk: identity.trialIpRisk,
	});
}
