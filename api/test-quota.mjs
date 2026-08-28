/**
 * TideLog 配额逻辑单元测试（纯函数，无网络、无 wrangler）
 * 从 api/ 目录运行：node test-quota.mjs
 */
import fs from 'fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./src/quota.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const Q = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

let pass = 0, fail = 0;
const check = (cond, label, extra = '') => {
	if (cond) { console.log(`  PASS  ${label}`); pass++; }
	else { console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ''}`); fail++; }
};
const at = (iso) => Date.parse(iso);

console.log('\nTest 1: periodKey 按 UTC+8 切分');
check(Q.periodKey('month', at('2026-08-22T03:00:00Z')) === '2026-08', '月窗常规');
check(Q.periodKey('day', at('2026-08-22T03:00:00Z')) === '2026-08-22', '日窗常规');
// UTC 15:59 → 北京 23:59 同日；UTC 16:00 → 北京次日 00:00
check(Q.periodKey('day', at('2026-08-22T15:59:00Z')) === '2026-08-22', '日窗：UTC 15:59 仍属当日');
check(Q.periodKey('day', at('2026-08-22T16:00:00Z')) === '2026-08-23', '日窗：UTC 16:00 已跨日');
// 月末跨月：UTC 2026-08-31T16:00 → 北京 2026-09-01
check(Q.periodKey('month', at('2026-08-31T15:59:00Z')) === '2026-08', '月窗：月末最后一刻仍属 8 月');
check(Q.periodKey('month', at('2026-08-31T16:00:00Z')) === '2026-09', '月窗：UTC 16:00 已跨入 9 月');
// 跨年
check(Q.periodKey('month', at('2026-12-31T16:00:00Z')) === '2027-01', '月窗：跨年正确');

console.log('\nTest 2: resetsAt 指向下一周期起点');
const r1 = Q.resetsAt('month', at('2026-08-22T03:00:00Z'));
check(new Date(r1 * 1000).toISOString() === '2026-08-31T16:00:00.000Z', '月窗重置 = 北京 9/1 00:00', new Date(r1 * 1000).toISOString());
const r2 = Q.resetsAt('day', at('2026-08-22T03:00:00Z'));
check(new Date(r2 * 1000).toISOString() === '2026-08-22T16:00:00.000Z', '日窗重置 = 北京次日 00:00', new Date(r2 * 1000).toISOString());
const r3 = Q.resetsAt('month', at('2026-12-15T03:00:00Z'));
check(new Date(r3 * 1000).toISOString() === '2026-12-31T16:00:00.000Z', '月窗重置跨年正确', new Date(r3 * 1000).toISOString());
check(r1 > at('2026-08-22T03:00:00Z') / 1000, '重置时刻必须在未来');

console.log('\nTest 3: 免费档配额');
const now = at('2026-08-22T03:00:00Z');
check(Q.checkQuota('free', 'daily_insight', 0, now).allowed === true, '免费：今日洞察第 1 次放行');
check(Q.checkQuota('free', 'daily_insight', 2, now).allowed === true, '免费：今日洞察第 3 次放行');
const f3 = Q.checkQuota('free', 'daily_insight', 3, now);
check(f3.allowed === false && f3.reason === 'quota_exceeded', '免费：今日洞察第 4 次拒绝');
check(f3.remaining === 0 && f3.limit === 3, '免费：拒绝时返回 limit/remaining');
const firstProfile = Q.checkQuota('free', 'profile', 0, now);
check(firstProfile.allowed === true && firstProfile.limit === 1, '免费：首次画像放行一次');
check(firstProfile.period === 'lifetime' && firstProfile.resetsAt === null, '免费：首次画像不随月份重置');
const usedProfile = Q.checkQuota('free', 'profile', 1, now);
check(usedProfile.allowed === false && usedProfile.reason === 'quota_exceeded', '免费：画像成功一次后拒绝');
for (const feat of ['weekly', 'monthly', 'chat']) {
	const d = Q.checkQuota('free', feat, 0, now);
	check(d.allowed === false && d.reason === 'not_available_on_tier', `免费：${feat} 不提供`);
}

console.log('\nTest 4: 试用档配额');
check(Q.checkQuota('trial', 'daily_insight', 9999, now).allowed === true, '试用：今日洞察不限');
check(Q.checkQuota('trial', 'monthly', 9999, now).allowed === true, '试用：月报不限');
check(Q.checkQuota('trial', 'chat', 19, now).allowed === true, '试用：对话第 20 次放行');
const t20 = Q.checkQuota('trial', 'chat', 20, now);
check(t20.allowed === false && t20.window === 'day', '试用：对话第 21 次拒绝，且为日窗');

console.log('\nTest 5: Pro 档配额');
check(Q.checkQuota('pro', 'monthly', 9999, now).allowed === true, 'Pro：月报不限');
check(Q.checkQuota('pro', 'chat', 199, now).allowed === true, 'Pro：对话第 200 次放行');
const p200 = Q.checkQuota('pro', 'chat', 200, now);
check(p200.allowed === false && p200.window === 'month', 'Pro：对话第 201 次拒绝，且为月窗');
check(Q.checkQuota('pro', 'daily_insight', 0, now).remaining === null, '不限档位 remaining 为 null');

console.log('\nTest 6: 档位推导');
const nowSec = Math.floor(now / 1000);
check(Q.resolveTier(null, nowSec) === 'free', '无 license → free');
check(Q.resolveTier({ status: 'revoked', expires_at: null }, nowSec) === 'free', '已吊销 → free');
check(Q.resolveTier({ status: 'unused', expires_at: null }, nowSec) === 'free', '未激活 → free');
check(Q.resolveTier({ status: 'active', expires_at: null }, nowSec) === 'pro', '永久有效 → pro');
check(Q.resolveTier({ status: 'active', expires_at: nowSec + 86400 }, nowSec) === 'pro', '未到期 → pro');
check(Q.resolveTier({ status: 'active', expires_at: nowSec - 1 }, nowSec) === 'free', '已过期 → free');
check(Q.resolveTier({ status: 'active', expires_at: nowSec }, nowSec) === 'free', '恰好到期 → free（边界取严）');
check(Q.resolveTier({ status: 'trial', expires_at: nowSec + 3600 }, nowSec) === 'trial', '试用未到期 → trial');
check(Q.resolveTier({ status: 'trial', expires_at: nowSec - 1 }, nowSec) === 'free', '试用已到期 → free');

console.log('\nTest 7: 配额表与文档一致');
check(Q.QUOTA.free.daily_insight.limit === 3, '免费今日洞察 = 3/月');
check(Q.QUOTA.free.profile.limit === 1 && Q.isLifetimeQuota('free', 'profile'), '免费画像 = 历史一次');
check(!Q.isLifetimeQuota('trial', 'profile') && !Q.isLifetimeQuota('pro', 'profile'), 'trial / Pro 画像维持原周期规则');
check(Q.QUOTA.trial.chat.limit === 20 && Q.QUOTA.trial.chat.window === 'day', '试用对话 = 20/日');
check(Q.QUOTA.pro.chat.limit === 200 && Q.QUOTA.pro.chat.window === 'month', 'Pro 对话 = 200/月');
check(Q.FEATURES.length === 5, 'feature 共 5 项');


console.log('\nTest 8: 配额单位归属（防止固定 sessionId 绕过配额）');
// 背景：配额按"一次用户动作"计量，同一 sessionId 的请求只扣一个单位。
// 但 sessionId 由客户端生成，若不设上限，永远发同一个值即可无限白嫖。
{
	const first = Q.resolveSessionUnit('sess-a', 0);
	check(first.counted === false, '本动作的第一次请求需要扣减配额');
	check(first.effectiveSessionId === 'sess-a', '第一次请求归入该动作');

	const second = Q.resolveSessionUnit('sess-a', 1);
	check(second.counted === true, '同一动作的后续请求不再扣减');
	check(second.effectiveSessionId === 'sess-a', '后续请求仍归入该动作');

	const cap = Q.MAX_REQUESTS_PER_SESSION;
	const atCap = Q.resolveSessionUnit('sess-a', cap);
	check(atCap.counted === false, `超过每 session 上限（${cap}）后必须重新扣减`);
	check(atCap.effectiveSessionId === null, '超限请求不再挂在原 session 下，独立计一个单位');

	const wayOver = Q.resolveSessionUnit('sess-a', cap * 100);
	check(wayOver.counted === false, '持续复用同一 sessionId 无法逃避扣减');
	check(wayOver.effectiveSessionId === null, '持续复用时每次都独立计单位');

	const noSession = Q.resolveSessionUnit(null, 0);
	check(noSession.counted === false, '旧客户端（无 sessionId）按请求计量');
	check(noSession.effectiveSessionId === null, '无 sessionId 时写入 NULL');

	let counted = 0;
	for (let i = 0; i < 6; i += 1) {
		if (!Q.resolveSessionUnit('review-1', i).counted) counted += 1;
	}
	check(counted === 1, `一次复盘的 6 次请求只扣 1 个单位（实际 ${counted}）`);
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
