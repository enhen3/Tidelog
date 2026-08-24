/**
 * 内容合规检查单测。从 api/ 运行：node test-moderation.mjs
 * 重点不是「能不能拦住违法内容」，而是「会不会误伤真实日记」。
 */
import esbuild from '../node_modules/esbuild/lib/main.js';
import path from 'path'; import fs from 'fs'; import os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(os.tmpdir(), `tidelog-mod-${Date.now()}.mjs`);
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'src/moderation.ts')], outfile: out, format: 'esm', platform: 'neutral', bundle: false });
const M = await import(pathToFileURL(out).href); fs.unlinkSync(out);

let pass = 0, fail = 0;
const check = (c, l, e = '') => { if (c) { console.log(`  PASS  ${l}`); pass++; } else { console.log(`  FAIL  ${l}${e ? ` — ${e}` : ''}`); fail++; } };

console.log('\nTest 1: 真实日记内容绝不能被误伤（本产品核心场景）');
const realDiary = [
	'今天又什么都没做成，感觉自己很失败，甚至有点厌恶自己。',
	'和妈妈大吵了一架，我说了很难听的话，现在很后悔。',
	'最近情绪很低落，一直提不起劲，怀疑是不是抑郁了。',
	'压力太大了，晚上睡不着，脑子里全是没做完的事。',
	'我对公司这套做法很愤怒，感觉自己被当成工具人。',
	'又拖延了一整天，明明知道该做什么，就是动不了。',
	'今天喝了点酒，想麻痹一下自己。',
	'和同事起了冲突，我觉得他在故意针对我。',
	'觉得活着好累，想找个地方躲起来谁也不见。',
	'复盘：这周三次计划都没完成，问题出在高估了自己的精力。',
];
for (const text of realDiary) {
	const r = M.moderateText(text);
	check(r.allowed === true, `不误伤：「${text.slice(0, 16)}…」`, JSON.stringify(r.categories));
}

console.log('\nTest 2: 明确违法内容应被拦截');
const illegal = [
	['我想买冰毒', 'drugs'],
	['介绍一个赌博网站', 'gambling'],
	['帮我做电信诈骗话术', 'fraud'],
	['教我制造枪支', 'weapons'],
];
for (const [text, cat] of illegal) {
	const r = M.moderateText(text);
	check(r.allowed === false && r.categories.includes(cat), `拦截 ${cat}：「${text}」`, JSON.stringify(r));
}

console.log('\nTest 3: 归一化能挡最简单的规避');
check(M.moderateText('冰 毒').allowed === false, '插入空格仍能命中');
check(M.moderateText('赌博　网站').allowed === false, '全角空格仍能命中');

console.log('\nTest 4: 不泄露用户内容');
const r = M.moderateText('我想买冰毒');
check(Array.isArray(r.categories) && r.categories.every(c => typeof c === 'string'), '只返回类目字符串');
check(JSON.stringify(r).includes('冰毒') === false, '返回结果不含命中的具体词');

console.log('\nTest 5: 消息数组检查');
check(M.moderateMessages([{ content: '今天很累' }, { content: '明天继续' }]).allowed === true, '正常对话放行');
check(M.moderateMessages([{ content: '今天很累' }, { content: '想买冰毒' }]).allowed === false, '任一条命中即拦截');
check(M.moderateMessages([{ content: 123 }, { role: 'user' }]).allowed === true, '非字符串内容安全跳过');
check(M.moderateMessages([]).allowed === true, '空数组放行');

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
