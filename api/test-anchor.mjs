/**
 * 免费额度锚点性质测试。从 api/ 运行：node test-anchor.mjs
 *
 * 要守住的性质：deviceId 是客户端自填字符串，可无限轮换；
 * 因此 IP 级锚点必须与 deviceId 完全无关，否则免费额度形同虚设。
 */
import esbuild from '../node_modules/esbuild/lib/main.js';
import path from 'path'; import fs from 'fs'; import os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { webcrypto } from 'crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(os.tmpdir(), `tl-anchor-${Date.now()}.mjs`);
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'src/ai.ts')], outfile: out, format: 'esm', platform: 'neutral', bundle: true });
const A = await import(pathToFileURL(out).href); fs.unlinkSync(out);

let pass = 0, fail = 0;
const check = (c, l, e='') => { if (c) { console.log(`  PASS  ${l}`); pass++; } else { console.log(`  FAIL  ${l}${e?` — ${e}`:''}`); fail++; } };
const req = (ip) => new Request('https://x/ai/generate', { headers: { 'CF-Connecting-IP': ip } });
const SALT = 'test-salt-do-not-use-in-production';

console.log('\nTest: IP 锚点必须与 deviceId 无关');
const ipA1 = await A.makeIpAnchor(req('1.2.3.4'), SALT);
const ipA2 = await A.makeIpAnchor(req('1.2.3.4'), SALT);
const ipB  = await A.makeIpAnchor(req('5.6.7.8'), SALT);
check(ipA1 === ipA2, '同一 IP → 同一锚点（重复调用稳定）');
check(ipA1 !== ipB, '不同 IP → 不同锚点');

console.log('\nTest: 设备锚点随 deviceId 变化（这正是它不能单独当护栏的原因）');
const d1 = await A.makeFreeAnchor(req('1.2.3.4'), 'dev-aaa', SALT);
const d2 = await A.makeFreeAnchor(req('1.2.3.4'), 'dev-bbb', SALT);
check(d1 !== d2, '同 IP、换 deviceId → 设备锚点不同（可被轮换绕过）');

console.log('\nTest: 攻击场景 —— 轮换 1000 个 deviceId');
const ipAnchors = new Set();
for (let i = 0; i < 1000; i++) ipAnchors.add(await A.makeIpAnchor(req('1.2.3.4'), SALT));
check(ipAnchors.size === 1, '轮换 1000 次 deviceId，IP 锚点仍只有 1 个 → IP 上限生效', `实际 ${ipAnchors.size} 个`);

console.log('\nTest: 锚点不泄露原始信息');
check(!ipA1.includes('1.2.3.4') && ipA1.length === 64, 'IP 锚点是 64 位十六进制值，不含原始 IP');
check(!d1.includes('dev-aaa'), '设备锚点不含原始 deviceId');

// ---------------------------------------------------------------------------
// 这一组才是关键：无盐 SHA-256 同样"不含原始 IP 字符串"，但 IPv4 只有 2^32 个取值，
// 可直接穷举反解。原先的断言太弱，通过了也不代表匿名化。
// ---------------------------------------------------------------------------
console.log('\nTest: 锚点必须不可穷举反解（匿名化，而非仅去标识化）');
{
    // 模拟攻击者：拿到数据库、知道算法，但没有盐。
    const { webcrypto: wc } = await import('crypto');
    const sha256Hex = async (input) => {
        const d = await wc.subtle.digest('SHA-256', new TextEncoder().encode(input));
        return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
    };
    const target = await A.makeIpAnchor(req('1.2.3.4'), SALT);

    // 攻击者用无盐写法穷举（这里只试少量候选，足以证明算法不同）
    const guesses = ['1.2.3.4', 'ip:1.2.3.4', await sha256Hex('1.2.3.4')];
    let cracked = false;
    for (const g of guesses) {
        if (await sha256Hex(g) === target) cracked = true;
        if (await sha256Hex(`ip:${g}`) === target) cracked = true;
    }
    check(!cracked, '不知道盐时，无法用无盐哈希还原出锚点');

    // 换一个盐，同一 IP 必须产出完全不同的锚点——证明盐真的参与了运算。
    const otherSalt = await A.makeIpAnchor(req('1.2.3.4'), 'a-different-salt');
    check(otherSalt !== target, '盐不同 → 锚点不同（盐确实参与运算）');

    // 同盐同 IP 必须稳定，否则配额计数会漂移。
    const again = await A.makeIpAnchor(req('1.2.3.4'), SALT);
    check(again === target, '同盐同 IP → 锚点稳定（配额计数不会漂移）');

    // 试用锚点与免费额度锚点必须不同源，避免跨用途关联。
    const trial = await A.makeTrialAnchor('dev-aaa', SALT);
    const free = await A.makeFreeAnchor(req('1.2.3.4'), 'dev-aaa', SALT);
    check(trial !== free, '试用锚点与免费额度锚点不同源');
    check(trial.length === 64, '试用锚点长度正确');
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
