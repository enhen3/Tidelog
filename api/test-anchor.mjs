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

console.log('\nTest: IP 锚点必须与 deviceId 无关');
const ipA1 = await A.makeIpAnchor(req('1.2.3.4'));
const ipA2 = await A.makeIpAnchor(req('1.2.3.4'));
const ipB  = await A.makeIpAnchor(req('5.6.7.8'));
check(ipA1 === ipA2, '同一 IP → 同一锚点（重复调用稳定）');
check(ipA1 !== ipB, '不同 IP → 不同锚点');

console.log('\nTest: 设备锚点随 deviceId 变化（这正是它不能单独当护栏的原因）');
const d1 = await A.makeFreeAnchor(req('1.2.3.4'), 'dev-aaa');
const d2 = await A.makeFreeAnchor(req('1.2.3.4'), 'dev-bbb');
check(d1 !== d2, '同 IP、换 deviceId → 设备锚点不同（可被轮换绕过）');

console.log('\nTest: 攻击场景 —— 轮换 1000 个 deviceId');
const ipAnchors = new Set();
for (let i = 0; i < 1000; i++) ipAnchors.add(await A.makeIpAnchor(req('1.2.3.4')));
check(ipAnchors.size === 1, '轮换 1000 次 deviceId，IP 锚点仍只有 1 个 → IP 上限生效', `实际 ${ipAnchors.size} 个`);

console.log('\nTest: 锚点不泄露原始信息');
check(!ipA1.includes('1.2.3.4') && ipA1.length === 64, 'IP 锚点是 64 位十六进制哈希，不含原始 IP');
check(!d1.includes('dev-aaa'), '设备锚点不含原始 deviceId');

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
