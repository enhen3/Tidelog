/**
 * TideLog 配额逻辑（纯函数，无 IO，可单元测试）
 *
 * 档位与配额依据：TideLog AI 代理 API 的服务端配额契约。
 * 所有时间窗按 UTC+8 计算（用户主体在国内）。
 */

export type Feature = 'daily_insight' | 'weekly' | 'monthly' | 'profile' | 'chat';
export type Tier = 'free' | 'trial' | 'pro';
export type Window = 'month' | 'day';

export const FEATURES: readonly Feature[] = [
	'daily_insight', 'weekly', 'monthly', 'profile', 'chat',
] as const;

/** limit: null = 不限；0 = 该档位不提供此功能 */
export interface QuotaRule {
	limit: number | null;
	window: Window;
	/** true 表示历史上只提供一次，不随 window 周期重置。 */
	lifetime?: boolean;
}

export const QUOTA: Record<Tier, Record<Feature, QuotaRule>> = {
	free: {
		daily_insight: { limit: 3, window: 'month' },
		weekly: { limit: 0, window: 'month' },
		monthly: { limit: 0, window: 'month' },
		profile: { limit: 1, window: 'month', lifetime: true },
		chat: { limit: 0, window: 'month' },
	},
	trial: {
		daily_insight: { limit: null, window: 'month' },
		weekly: { limit: null, window: 'month' },
		monthly: { limit: null, window: 'month' },
		profile: { limit: null, window: 'month' },
		chat: { limit: 20, window: 'day' },
	},
	pro: {
		daily_insight: { limit: null, window: 'month' },
		weekly: { limit: null, window: 'month' },
		monthly: { limit: null, window: 'month' },
		profile: { limit: null, window: 'month' },
		chat: { limit: 200, window: 'month' },
	},
};

const TZ_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

/** 配额周期键：月窗 'YYYY-MM'，日窗 'YYYY-MM-DD'，均按 UTC+8 */
export function periodKey(window: Window, nowMs: number): string {
	const d = new Date(nowMs + TZ_OFFSET_MS);
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, '0');
	if (window === 'month') return `${y}-${m}`;
	return `${y}-${m}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 当前周期的重置时刻（Unix 秒），即下一个周期的起点 */
export function resetsAt(window: Window, nowMs: number): number {
	const d = new Date(nowMs + TZ_OFFSET_MS);
	const y = d.getUTCFullYear();
	const mo = d.getUTCMonth();
	const nextLocalMs = window === 'month'
		? Date.UTC(y, mo + 1, 1)
		: Date.UTC(y, mo, d.getUTCDate() + 1);
	return Math.floor((nextLocalMs - TZ_OFFSET_MS) / 1000);
}

export interface QuotaDecision {
	allowed: boolean;
	limit: number | null;
	used: number;
	remaining: number | null;
	window: Window;
	period: string;
	resetsAt: number | null;
	reason?: 'not_available_on_tier' | 'quota_exceeded';
}

/** 当前规则是否跨周期累计。现阶段只有匿名免费主体的首次画像如此。 */
export function isLifetimeQuota(tier: Tier, feature: Feature): boolean {
	return QUOTA[tier][feature].lifetime === true;
}

/**
 * 判定一次调用是否放行。
 * @param used 该 subject 在当前周期内、该 feature 已消耗的次数
 */
export function checkQuota(tier: Tier, feature: Feature, used: number, nowMs: number): QuotaDecision {
	const rule = QUOTA[tier][feature];
	const period = rule.lifetime ? 'lifetime' : periodKey(rule.window, nowMs);
	const reset = rule.lifetime ? null : resetsAt(rule.window, nowMs);
	const base = { limit: rule.limit, used, window: rule.window, period, resetsAt: reset };

	if (rule.limit === null) return { ...base, allowed: true, remaining: null };
	if (rule.limit === 0) {
		return { ...base, allowed: false, remaining: 0, reason: 'not_available_on_tier' };
	}
	const remaining = Math.max(0, rule.limit - used);
	return remaining > 0
		? { ...base, allowed: true, remaining }
		: { ...base, allowed: false, remaining: 0, reason: 'quota_exceeded' };
}

/** 由 License 状态推导档位。license 为 null 表示无有效授权。 */
export function resolveTier(
	license: { status: string; expires_at: number | null } | null,
	nowSec: number,
): Tier {
	if (!license) return 'free';
	if (license.status === 'revoked') return 'free';
	if (license.status === 'trial') {
		return license.expires_at !== null && license.expires_at <= nowSec ? 'free' : 'trial';
	}
	if (license.status !== 'active') return 'free';
	if (license.expires_at !== null && license.expires_at <= nowSec) return 'free';
	return 'pro';
}

/**
 * 单个 session 最多能庇护多少次请求。
 *
 * sessionId 由客户端生成，**不可信**：若不设上限，客户端只要永远发送同一个
 * sessionId，就能把配额消耗永久锁在 1 个单位。一次真实复盘约 6 次请求
 * （2 题 + 收尾 + 3 条计划建议），留出余量取 12。
 */
export const MAX_REQUESTS_PER_SESSION = 12;

export interface SessionUnitDecision {
	/** 是否已计过配额（true 表示本次请求不再扣减）。 */
	counted: boolean;
	/** 实际写入 ai_usage 的 session_id。超出上限时为 null，使该请求独立计一个单位。 */
	effectiveSessionId: string | null;
}

/**
 * 判定一次请求应归入哪个配额单位。
 *
 * @param sessionId       客户端提供的动作标识，null 表示按请求计量（旧客户端）
 * @param sessionRequests 该 session 此前已发起的请求数
 */
export function resolveSessionUnit(
	sessionId: string | null,
	sessionRequests: number,
): SessionUnitDecision {
	if (!sessionId) return { counted: false, effectiveSessionId: null };
	if (sessionRequests >= MAX_REQUESTS_PER_SESSION) {
		// 超出上限：不再归入该 session，本次请求自己算一个单位。
		return { counted: false, effectiveSessionId: null };
	}
	return { counted: sessionRequests > 0, effectiveSessionId: sessionId };
}
