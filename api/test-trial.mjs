/**
 * 试用判定单元测试（纯函数，无网络、无 wrangler）
 * 从 api/ 目录运行：node test-trial.mjs
 *
 * 这些用例针对的是一个真实发生过的 P0：
 * 客户端从不发送 trial，服务端又把 body.trial 无条件当真。
 * 两个方向都错，且当时 36 条 onboarding 测试全绿。
 */
import fs from 'fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./src/trial.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const T = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

let pass = 0, fail = 0;
const check = (cond, label, extra = '') => {
	if (cond) { console.log(`  PASS  ${label}`); pass++; }
	else { console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ''}`); fail++; }
};

const NOW = 1_756_000_000;
const DAY = 86_400;

console.log('\nTest 1: 没有历史记录时，客户端的申请才有意义');
check(T.evaluateTrial(false, null, 0, NOW).kind === 'none', '未申请 → none');
check(T.evaluateTrial(true, null, 0, NOW).kind === 'start', '已申请 → start');
check(T.tierFromTrial(T.evaluateTrial(false, null, 0, NOW)) === 'free', '未申请归为 free');
check(T.tierFromTrial(T.evaluateTrial(true, null, 0, NOW)) === 'trial', '开启即为 trial');

console.log('\nTest 2: 开启时长由服务端决定，恰好 7 天');
const started = T.evaluateTrial(true, null, 0, NOW);
check(started.expiresAt - started.startedAt === 7 * DAY, '试用期为 7 天');
check(started.expiresAt === NOW + 7 * DAY, '到期时间自服务端当前时间推算');

console.log('\nTest 3: 已有记录时，客户端说什么都不影响判定');
const active = { started_at: NOW - DAY, expires_at: NOW + 6 * DAY };
const expired = { started_at: NOW - 30 * DAY, expires_at: NOW - 23 * DAY };
check(T.evaluateTrial(true, active, 0, NOW).kind === 'active', '未到期 → active');
check(T.evaluateTrial(false, active, 0, NOW).kind === 'active', '即使客户端不声称，未到期仍是 active');
check(T.evaluateTrial(true, expired, 0, NOW).kind === 'expired', '已到期 → expired');
check(T.tierFromTrial(T.evaluateTrial(true, expired, 0, NOW)) === 'free', '过期后降级为 free');

console.log('\nTest 4: 客户端不能靠反复自报延长试用');
// 攻击者持续发送 trial:true。服务端始终以自己保存的 expires_at 为准。
let refusedAfterExpiry = true;
for (let i = 0; i < 100; i += 1) {
	const outcome = T.evaluateTrial(true, expired, 0, NOW + i * DAY);
	if (T.tierFromTrial(outcome) !== 'free') refusedAfterExpiry = false;
}
check(refusedAfterExpiry, '过期后自报 100 次仍为 free');

console.log('\nTest 5: 边界——恰好到期的瞬间');
check(T.evaluateTrial(true, { started_at: NOW - 7 * DAY, expires_at: NOW }, 0, NOW).kind === 'expired',
	'expires_at 等于当前时间即视为过期');
check(T.evaluateTrial(true, { started_at: NOW - 7 * DAY, expires_at: NOW + 1 }, 0, NOW).kind === 'active',
	'还差 1 秒仍为 active');

console.log('\nTest 6: NAT 友好的 IP 风险阈值与硬上限');
const cap = T.TRIAL_STARTS_PER_IP_MONTHLY;
const risk = T.TRIAL_STARTS_PER_IP_RISK_THRESHOLD;
check(T.evaluateTrial(true, null, risk, NOW).kind === 'start', `达到风险阈值（${risk}）的 NAT 用户仍可开启`);
check(T.evaluateTrial(true, null, cap - 1, NOW).kind === 'start', `未达硬上限（${cap - 1} < ${cap}）可开启`);
check(T.evaluateTrial(true, null, cap, NOW).kind === 'refused_ip_cap', `达到上限（${cap}）拒绝开启`);
check(T.tierFromTrial(T.evaluateTrial(true, null, cap, NOW)) === 'free', '被拒后归为 free');
// 已在试用中的设备不受 IP 上限影响，否则同一 WiFi 下的正常用户会被误伤。
check(T.evaluateTrial(true, active, cap + 10, NOW).kind === 'active', '已有试用记录不受 IP 上限影响');

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail === 0 ? 0 : 1);
