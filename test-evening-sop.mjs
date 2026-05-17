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
    const state = { yamlUpdates: [], appendedSections: [] };
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
            sendMessage: async () => '好的，我看到了',
        }),
        kanbanService: null,
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

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);

// cleanup the mock file
try { fs.unlinkSync(path.join(__dirname, 'obsidian-mock.cjs')); } catch {}

process.exit(fail === 0 ? 0 : 1);
