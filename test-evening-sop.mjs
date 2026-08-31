/**
 * Reproduction test for the Daily review customization bug.
 *
 * Bug report: User customizes evening review questions (content + order) in
 * settings, but when they click "Daily" the system asks the default questions
 * in the default order anyway.
 *
 * This test mocks Obsidian and exercises the real EveningSOP class to see
 * whether the user's customizations actually flow through to questionFlow
 * and the messages emitted by start() / moveToNextQuestion().
 */

import { createRequire } from 'module';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Mock Obsidian module
// ---------------------------------------------------------------------------

const obsidianMock = {
    TFile: class {},
    Platform: { isMobile: false },
    Notice: class {},
    PluginSettingTab: class {},
    Setting: class {
        setName() { return this; }
        setDesc() { return this; }
        setHeading() { return this; }
        addText() { return this; }
        addDropdown() { return this; }
        addButton() { return this; }
        addSlider() { return this; }
        addExtraButton() { return this; }
    },
    moment: () => ({ format: () => '' }),
    MarkdownRenderer: { render: async () => {} },
    addIcon: () => {},
    ItemView: class {},
    Plugin: class {},
};

// Patch require for "obsidian"
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
    if (req === 'obsidian') return path.join(__dirname, 'obsidian-mock.cjs');
    return origResolve.call(this, req, parent, ...rest);
};

// Write the mock as a CJS file the bundle can require
import fs from 'fs';
fs.writeFileSync(
    path.join(__dirname, 'obsidian-mock.cjs'),
    `module.exports = ${objToSrc(obsidianMock)};`,
);

function objToSrc(obj) {
    if (typeof obj === 'function' || (obj && obj.prototype)) return obj.toString();
    if (Array.isArray(obj)) return '[' + obj.map(objToSrc).join(',') + ']';
    if (obj && typeof obj === 'object') {
        return '{' + Object.entries(obj).map(([k, v]) =>
            `${JSON.stringify(k)}: ${objToSrc(v)}`
        ).join(',') + '}';
    }
    return JSON.stringify(obj);
}

// ---------------------------------------------------------------------------
// Compile TypeScript on the fly using esbuild
// ---------------------------------------------------------------------------

import esbuild from 'esbuild';

const bundle = await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/sop/evening-sop.ts')],
    bundle: true,
    write: false,
    format: 'cjs',
    target: 'es2020',
    external: ['obsidian'],
    platform: 'node',
    logLevel: 'silent',
});

const code = bundle.outputFiles[0].text;
const moduleObj = { exports: {} };
const wrapper = new Function('module', 'exports', 'require', code);
wrapper(moduleObj, moduleObj.exports, require);
const { EveningSOP } = moduleObj.exports;

// ---------------------------------------------------------------------------
// Test framework
// ---------------------------------------------------------------------------

let pass = 0, fail = 0;
function assertEqual(actual, expected, label) {
    if (actual === expected) { console.log(`  PASS  ${label}`); pass++; }
    else {
        console.log(`  FAIL  ${label}`);
        console.log(`        expected: ${JSON.stringify(expected)}`);
        console.log(`        actual:   ${JSON.stringify(actual)}`);
        fail++;
    }
}
function assertContains(text, needle, label) {
    if (typeof text === 'string' && text.includes(needle)) { console.log(`  PASS  ${label}`); pass++; }
    else {
        console.log(`  FAIL  ${label}`);
        console.log(`        expected to contain: ${JSON.stringify(needle)}`);
        console.log(`        actual:              ${JSON.stringify(text)}`);
        fail++;
    }
}

// ---------------------------------------------------------------------------
// Mock plugin
// ---------------------------------------------------------------------------

function makePlugin(eveningQuestions, opts = {}) {
    const state = { yamlUpdates: [], appendedSections: [], aiCalls: [], onboardingCompletions: 0, offers: [] };
    return {
        __state: state,
        settings: {
            language: 'zh',
            activeProvider: 'openrouter',
            eveningQuestions,
        },
        licenseManager: {
            isPro: () => opts.pro ?? true,
            getPurchaseUrl: () => 'https://example.com',
        },
        vaultManager: {
            getUserProfileContent: async () => null,
            getOrCreateDailyNote: async () => ({ path: 'Daily/2026-05-12.md' }),
            appendToSection: async (...args) => { state.appendedSections.push(args); },
            updateDailyNoteYAML: async (_path, fields) => { state.yamlUpdates.push(fields); },
            addPrinciple: async () => {},
        },
        app: {
            vault: {
                cachedRead: async () => '',
                getAbstractFileByPath: () => null,
                create: async () => {},
                modify: async () => {},
            },
            metadataCache: { getFileCache: () => null },
        },
        getAIProvider: () => ({
            sendMessage: async (_m, _sp, onChunk, feature, sessionId) => {
                state.aiCalls.push({ feature, sessionId });
                if (opts.emitChunks) onChunk('好的，我看到了');
                return '好的，我看到了';
            },
        }),
        kanbanService: null,
        completeOnboarding: async () => { state.onboardingCompletions++; },
        showTrialOfferOnce: async (feature) => { state.offers.push(feature); },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\n=== Daily review customization tests ===\n');

console.log('Test 1: user-customized order is respected');
{
    const userQuestions = [
        { type: 'tomorrow_plan', sectionName: '明日规划', initialMessage: '【1】明天想做啥？', required: true, enabled: true },
        { type: 'success_diary', sectionName: '亮点',     initialMessage: '【2】今天亮点？', required: true, enabled: true },
        { type: 'goal_alignment', sectionName: '目标',    initialMessage: '【3】目标完成？', required: true, enabled: true },
    ];
    const plugin = makePlugin(userQuestions, { pro: true });
    const sop = new EveningSOP(plugin);

    const messages = [];
    const ctx = { type: 'evening', currentStep: 0, responses: {} };
    await sop.start(ctx, (m) => messages.push(m));

    assertContains(messages[0], '【1】明天想做啥？', 'welcome message contains user\'s first custom question');
    const flow = sop.questionFlow;
    assertEqual(flow.length, 3, 'questionFlow length matches user customization');
    assertEqual(flow[0].type, 'tomorrow_plan',  'flow[0].type respects user order (tomorrow_plan first)');
    assertEqual(flow[1].type, 'success_diary',  'flow[1].type respects user order (success_diary second)');
    assertEqual(flow[2].type, 'goal_alignment', 'flow[2].type respects user order (goal_alignment third)');
    assertEqual(flow[0].initialMessage, '【1】明天想做啥？', 'flow[0].initialMessage is user\'s text');
    assertEqual(flow[1].initialMessage, '【2】今天亮点？',   'flow[1].initialMessage is user\'s text');
    assertEqual(flow[2].initialMessage, '【3】目标完成？',   'flow[2].initialMessage is user\'s text');
}

console.log('\nTest 2: progress info uses user count + user labels');
{
    const userQuestions = [
        { type: 'tomorrow_plan',  sectionName: '明日规划', initialMessage: 'A', required: true, enabled: true },
        { type: 'success_diary',  sectionName: '亮点',     initialMessage: 'B', required: true, enabled: true },
        { type: 'goal_alignment', sectionName: '目标',     initialMessage: 'C', required: true, enabled: true },
    ];
    const plugin = makePlugin(userQuestions, { pro: true });
    const sop = new EveningSOP(plugin);
    const ctx = { type: 'evening', currentStep: 0, responses: {} };
    await sop.start(ctx, () => {});

    const p0 = sop.getProgressInfo();
    assertEqual(p0.total, 3, 'progress total reflects user count');
    assertEqual(p0.current, 0, 'progress current = 0 at start');
    assertEqual(p0.currentLabel, '明日规划', 'progress label is user-customized sectionName at step 0');
}

console.log('\nTest 3: moveToNextQuestion sends user\'s second customized question');
{
    const userQuestions = [
        { type: 'tomorrow_plan',  sectionName: '明日规划', initialMessage: '【Q1】', required: true, enabled: true },
        { type: 'success_diary',  sectionName: '亮点',     initialMessage: '【Q2】', required: true, enabled: true },
        { type: 'goal_alignment', sectionName: '目标',     initialMessage: '【Q3】', required: true, enabled: true },
    ];
    const plugin = makePlugin(userQuestions, { pro: true });
    const sop = new EveningSOP(plugin);

    const out = [];
    const ctx = { type: 'evening', currentStep: 0, responses: {} };
    await sop.start(ctx, (m) => out.push(m));
    assertContains(out[0], '【Q1】', 'first message has user Q1');

    // Simulate a user answer to Q1
    await sop.handleResponse('做完了项目报告', ctx, (m) => out.push(m));
    // After handleResponse, moveToNextQuestion should fire with Q2
    const afterQ1 = out[out.length - 1];
    assertContains(afterQ1, '【Q2】', 'after answering Q1, system asks user Q2');

    await sop.handleResponse('挺顺利', ctx, (m) => out.push(m));
    const afterQ2 = out[out.length - 1];
    assertContains(afterQ2, '【Q3】', 'after answering Q2, system asks user Q3');
}

console.log('\nTest 4: free user only sees first 2 — but they\'re the user-reordered ones');
{
    const userQuestions = [
        { type: 'tomorrow_plan',  sectionName: 'Moved-to-top', initialMessage: 'MUST-SEE', required: true, enabled: true },
        { type: 'free_writing',   sectionName: 'Second',       initialMessage: 'ALSO-SEE', required: true, enabled: true },
        { type: 'goal_alignment', sectionName: 'Off',          initialMessage: 'OFF',      required: true, enabled: false },
        { type: 'success_diary',  sectionName: 'Third',        initialMessage: 'SHOULDNT', required: true, enabled: true },
    ];
    const plugin = makePlugin(userQuestions, { pro: false });
    const sop = new EveningSOP(plugin);

    const out = [];
    const ctx = { type: 'evening', currentStep: 0, responses: {} };
    await sop.start(ctx, (m) => out.push(m));
    assertContains(out[0], 'MUST-SEE', 'free user gets user\'s first reordered question');
    assertEqual(sop.questionFlow.length, 2, 'free flow limited to 2');
    assertEqual(sop.getProgressInfo().total, 3, 'free progress total counts enabled questions only');
}

console.log('\nTest 5: disabled questions are skipped in Review Daily');
{
    const userQuestions = [
        { type: 'goal_alignment', sectionName: 'Disabled first', initialMessage: 'DO-NOT-ASK-1', required: true, enabled: false },
        { type: 'tomorrow_plan',  sectionName: 'Enabled first',  initialMessage: 'ASK-ME-1',     required: true, enabled: true },
        { type: 'success_diary',  sectionName: 'Disabled mid',   initialMessage: 'DO-NOT-ASK-2', required: true, enabled: false },
        { type: 'free_writing',   sectionName: 'Enabled second', initialMessage: 'ASK-ME-2',     required: false, enabled: true },
    ];
    const plugin = makePlugin(userQuestions, { pro: true });
    const sop = new EveningSOP(plugin);

    const out = [];
    const ctx = { type: 'evening', currentStep: 0, responses: {} };
    await sop.start(ctx, (m) => out.push(m));

    assertContains(out[0], 'ASK-ME-1', 'first enabled question is asked first');
    assertEqual(sop.questionFlow.length, 2, 'disabled questions are removed from flow');
    assertEqual(sop.questionFlow[0].sectionName, 'Enabled first', 'flow[0] skips disabled first question');
    assertEqual(sop.questionFlow[1].sectionName, 'Enabled second', 'flow[1] skips disabled middle question');

    const progress = sop.getProgressInfo();
    assertEqual(progress.total, 2, 'progress total counts enabled questions only');
    assertEqual(progress.currentLabel, 'Enabled first', 'progress label uses enabled flow');
}

console.log('\nTest 6: all-disabled configuration shows a setup message');
{
    const userQuestions = [
        { type: 'goal_alignment', sectionName: 'Off 1', initialMessage: 'A', required: true, enabled: false },
        { type: 'success_diary',  sectionName: 'Off 2', initialMessage: 'B', required: true, enabled: false },
    ];
    const plugin = makePlugin(userQuestions, { pro: true });
    const sop = new EveningSOP(plugin);

    const out = [];
    const ctx = { type: 'evening', currentStep: 0, responses: {} };
    await sop.start(ctx, (m) => out.push(m));

    assertContains(out[0], '目前没有启用的复盘问题', 'all-disabled review warns user to enable questions');
    assertEqual(sop.questionFlow.length, 0, 'all-disabled flow is empty');
}

console.log('\nTest 7: legacy questions without enabled flag remain enabled');
{
    const userQuestions = [
        { type: 'goal_alignment', sectionName: 'Legacy 1', initialMessage: 'LEGACY-1', required: true },
        { type: 'success_diary',  sectionName: 'Legacy 2', initialMessage: 'LEGACY-2', required: true },
    ];
    const plugin = makePlugin(userQuestions, { pro: true });
    const sop = new EveningSOP(plugin);

    const out = [];
    const ctx = { type: 'evening', currentStep: 0, responses: {} };
    await sop.start(ctx, (m) => out.push(m));

    assertContains(out[0], 'LEGACY-1', 'legacy question without enabled=false is still asked');
    assertEqual(sop.questionFlow.length, 2, 'legacy questions without enabled flag are included');
}

console.log('\nTest 8: final mood score does not overwrite joy/emotion answer');
{
    const userQuestions = [
        { type: 'happiness_emotion', sectionName: '开心事与情绪', initialMessage: '今天心情如何？', required: true, enabled: true },
    ];
    const plugin = makePlugin(userQuestions, { pro: true });
    const sop = new EveningSOP(plugin);

    const out = [];
    const ctx = { type: 'evening', currentStep: 0, responses: {} };
    await sop.start(ctx, (m) => out.push(m));
    await sop.handleResponse('今天很开心，因为傍晚出去散步了。', ctx, (m) => out.push(m));
    await sop.handleResponse('7', ctx, (m) => out.push(m));

    assertEqual(ctx.responses.happiness_emotion, '今天很开心，因为傍晚出去散步了。', 'joy/emotion answer is preserved');
    assertEqual(ctx.responses.emotion_score, '7', 'final numeric mood score is stored separately');
    assertEqual(plugin.__state.yamlUpdates.at(-1)?.emotion_score, 7, 'plain number mood score is written to YAML');
}


// ---------------------------------------------------------------------------
// 回归：一次复盘 = 一个配额单位
//
// 曾经的 P0-b：配额按 AI 请求计数，而免费档 daily_insight 恰为 3 次/月。
// 免费用户保留 2 个问题，每题一次调用 + 收尾一次 = 3 次，一次复盘刚好用光整月额度，
// 随后 refreshAfterDailyReview 并发的三条计划建议必然全部失败。
// ---------------------------------------------------------------------------
console.log('\nTest: 一次复盘的所有 AI 调用共用一个配额单位');
{
    const userQuestions = [
        { type: 'success_diary',  sectionName: '亮点', initialMessage: '【Q1】今天亮点？', required: true, enabled: true },
        { type: 'goal_alignment', sectionName: '目标', initialMessage: '【Q2】目标完成？', required: true, enabled: true },
    ];
    const plugin = makePlugin(userQuestions, { pro: true });
    const sop = new EveningSOP(plugin);

    const out = [];
    const ctx = { type: 'evening', currentStep: 0, responses: {} };
    await sop.start(ctx, (m) => out.push(m));
    await sop.handleResponse('做完了项目报告', ctx, (m) => out.push(m));
    await sop.handleResponse('基本达成', ctx, (m) => out.push(m));

    const calls = plugin.__state.aiCalls;
    const sessions = new Set(calls.map(c => c.sessionId));
    assertEqual(calls.length > 1, true, `本次复盘发出了多次 AI 调用（${calls.length} 次）`);
    assertEqual(sessions.size, 1, `多次调用只对应一个配额单位（实际 ${sessions.size} 个）`);
    assertEqual([...sessions][0] !== undefined, true, '配额单位标识不为空');
    assertEqual(calls.every(c => c.feature === 'daily_insight'), true, '复盘调用统一标记为 daily_insight');
}

console.log('\nTest: 不同复盘之间使用不同的配额单位');
{
    const userQuestions = [
        { type: 'success_diary', sectionName: '亮点', initialMessage: '【Q1】今天亮点？', required: true, enabled: true },
    ];
    const plugin = makePlugin(userQuestions, { pro: true });
    const sop = new EveningSOP(plugin);

    const ctx1 = { type: 'evening', currentStep: 0, responses: {} };
    await sop.start(ctx1, () => {});
    await sop.handleResponse('第一次复盘', ctx1, () => {});
    const first = new Set(plugin.__state.aiCalls.map(c => c.sessionId));

    const ctx2 = { type: 'evening', currentStep: 0, responses: {} };
    await sop.start(ctx2, () => {});
    await sop.handleResponse('第二次复盘', ctx2, () => {});
    const all = new Set(plugin.__state.aiCalls.map(c => c.sessionId));

    assertEqual(all.size > first.size, true, '第二次复盘产生了新的配额单位（否则会永远只扣一次）');
}

console.log('\nTest: 从复盘开始的新用户只在写入并收到 AI 反馈后完成 onboarding');
{
    const userQuestions = [
        { type: 'goal_alignment', sectionName: '目标', initialMessage: '【Q1】目标完成？', required: true, enabled: true },
    ];
    const plugin = makePlugin(userQuestions, { pro: true, emitChunks: true });
    const sop = new EveningSOP(plugin);
    const ctx = { type: 'evening', currentStep: 0, responses: {} };

    await sop.start(ctx, () => {});
    assertEqual(plugin.__state.onboardingCompletions, 0, '只打开复盘不会完成 onboarding');
    await sop.handleResponse('完成了主要任务，但开始得有点晚', ctx, () => {});
    assertEqual(plugin.__state.appendedSections.length, 1, '第一条复盘回答先写入日记');
    assertEqual(plugin.__state.onboardingCompletions, 0, '收到单条反馈但尚未完成复盘时不提前完成 onboarding');
    await sop.handleResponse('7', ctx, () => {});
    assertEqual(plugin.__state.onboardingCompletions, 1, '成功完成复盘后标记 onboarding 已完成');
    assertEqual(plugin.__state.offers.length, 1, '首次价值完成后才触发试用邀请');
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);


// cleanup the mock file
try { fs.unlinkSync(path.join(__dirname, 'obsidian-mock.cjs')); } catch {}

process.exit(fail === 0 ? 0 : 1);
