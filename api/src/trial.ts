/**
 * 试用期逻辑（纯函数，无 IO，可单元测试）
 *
 * 设计前提：客户端发来的 `trial` 只是一个**申请**，不是事实。
 * 服务端保存 started_at / expires_at 并自行判定，客户端无法延长或伪造。
 *
 * 之前的实现里 `body.trial === true` 会被无条件采信，任何人都能永久自报试用；
 * 同时客户端根本没有发送该字段，导致真实试用用户被当作 free。两个方向都错。
 */

/** 与客户端 `license-manager.ts` 的 TRIAL_PERIOD_MS 保持一致 */
export const TRIAL_PERIOD_SEC = 7 * 24 * 60 * 60;

/**
 * 同一 IP 每月可开启的试用数上限。
 *
 * deviceId 由客户端自填、可无限轮换，因此设备锚点不能单独作为护栏；
 * 只有 IP 是客户端伪造不了的。这个上限限制的是"换设备 ID 刷试用"，
 * 前 3 次只记为风险信号，不拒绝试用：IP 不是用户身份，校园、公司和 CGNAT
 * 下的第 4 位正常用户不应因此失去试用。超过硬上限才拒绝，从而令轮换 deviceId
 * 的滥用仍有明确成本。
 */
export const TRIAL_STARTS_PER_IP_RISK_THRESHOLD = 3;
export const TRIAL_STARTS_PER_IP_MONTHLY = 12;

export interface TrialRow {
	started_at: number;
	expires_at: number;
}

export type TrialOutcome =
	| { kind: 'none' }                                  // 没申请，也没有历史记录
	| { kind: 'active'; expiresAt: number }             // 试用中
	| { kind: 'expired'; expiresAt: number }            // 试用已过期
	| { kind: 'start'; startedAt: number; expiresAt: number }  // 本次应当开启
	| { kind: 'refused_ip_cap' };                       // 该 IP 本月开启次数已达上限

/**
 * 判定一次无 License 请求的试用状态。
 *
 * @param requested  客户端是否声称处于试用（仅作为申请）
 * @param existing   服务端已保存的试用记录，null 表示该设备从未开启过
 * @param ipStartsThisMonth 该 IP 本月已开启的试用数
 */
export function evaluateTrial(
	requested: boolean,
	existing: TrialRow | null,
	ipStartsThisMonth: number,
	nowSec: number,
): TrialOutcome {
	if (existing) {
		// 已有记录时，客户端说什么都不影响判定——到期就是到期。
		return existing.expires_at > nowSec
			? { kind: 'active', expiresAt: existing.expires_at }
			: { kind: 'expired', expiresAt: existing.expires_at };
	}
	if (!requested) return { kind: 'none' };
	if (ipStartsThisMonth >= TRIAL_STARTS_PER_IP_MONTHLY) return { kind: 'refused_ip_cap' };
	return { kind: 'start', startedAt: nowSec, expiresAt: nowSec + TRIAL_PERIOD_SEC };
}

/** 由试用判定结果推导档位。只有 active / 本次开启 才是 trial。 */
export function tierFromTrial(outcome: TrialOutcome): 'trial' | 'free' {
	return outcome.kind === 'active' || outcome.kind === 'start' ? 'trial' : 'free';
}
