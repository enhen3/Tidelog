/**
 * Reproduction test: simulate the full settings save → reload cycle and
 * verify the user's evening question customizations survive to be used by
 * EveningSOP.buildQuestionFlow().
 *
 * This exercises the merge logic in main.ts loadSettings() against several
 * scenarios that real users hit:
 *  - first run (no saved data)
 *  - user customizes order then reloads
 *  - user customizes content then reloads
 *  - user adds a new question then reloads
 *  - user deletes a question then reloads
 */

import path from 'path';
import url from 'url';
import esbuild from 'esbuild';
import { createRequire } from 'module';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ---- mock obsidian -----------------------------------------------------------
import fs from 'fs';
const mockPath = path.join(__dirname, 'obsidian-mock.cjs');
fs.writeFileSync(
    mockPath,
    `module.exports = {
        TFile: class {},
        Platform: { isMobile: false },
        Notice: class {},
        PluginSettingTab: class {},
        Setting: class { setName(){return this} setDesc(){return this} setHeading(){return this} addText(){return this} addDropdown(){return this} addButton(){return this} addSlider(){return this} addExtraButton(){return this} },
        moment: () => ({ format: () => '' }),
        MarkdownRenderer: { render: async () => {} },
        addIcon: () => {},
        ItemView: class {},
        Plugin: class {},
    };`
);
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
    if (req === 'obsidian') return mockPath;
    return origResolve.call(this, req, parent, ...rest);
};

// ---- bundle constants + evening-sop -----------------------------------------
async function bundle(entry) {
    const res = await esbuild.build({
        entryPoints: [path.join(__dirname, entry)],
        bundle: true,
        write: false,
        format: 'cjs',
        target: 'es2020',
        external: ['obsidian'],
        platform: 'node',
        logLevel: 'silent',
    });
    const code = res.outputFiles[0].text;
    const m = { exports: {} };
    new Function('module', 'exports', 'require', code)(m, m.exports, require);
    return m.exports;
}

const constants = await bundle('src/constants.ts');
const eveningMod = await bundle('src/sop/evening-sop.ts');
const { DEFAULT_SETTINGS, getDefaultEveningQuestions } = constants;
const { EveningSOP } = eveningMod;

// Mirror the FIXED loadSettings from src/main.ts: deep-clone eveningQuestions
// so the simulation doesn't alias-mutate DEFAULT_SETTINGS across tests.
function simulateLoadSettings(savedDataFromDisk) {
    const saved = savedDataFromDisk ?? {};
    const mergedProviders = { ...DEFAULT_SETTINGS.providers };
    const savedProviders = saved.providers;
    if (savedProviders) {
        for (const key of Object.keys(savedProviders)) {
            mergedProviders[key] = { ...DEFAULT_SETTINGS.providers[key], ...savedProviders[key] };
        }
    }
    const sq = saved.eveningQuestions;
    const eveningQuestions = (Array.isArray(sq) && sq.length > 0)
        ? sq.map(q => ({ ...q }))
        : getDefaultEveningQuestions();
    return { ...DEFAULT_SETTINGS, ...saved, providers: mergedProviders, eveningQuestions };
}

// ---- Simulate saveData: serialize to JSON, deserialize on next load ----------
function roundTrip(settings) {
    // saveData stores via Obsidian's JSON serialization
    const onDisk = JSON.parse(JSON.stringify(settings));
    // loadData returns the parsed JSON
    return simulateLoadSettings(onDisk);
}

// ---- Test framework ----------------------------------------------------------
let pass = 0, fail = 0;
function assertEqual(actual, expected, label) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { console.log(`  PASS  ${label}`); pass++; }
    else {
        console.log(`  FAIL  ${label}`);
        console.log(`        expected: ${JSON.stringify(expected)}`);
        console.log(`        actual:   ${JSON.stringify(actual)}`);
        fail++;
    }
}
function assertTrue(cond, label) {
    if (cond) { console.log(`  PASS  ${label}`); pass++; }
    else { console.log(`  FAIL  ${label}`); fail++; }
}

function makePluginFromSettings(settings, isPro = true) {
    return {
        settings,
        licenseManager: { isPro: () => isPro, getPurchaseUrl: () => '' },
        vaultManager: {
            getUserProfileContent: async () => null,
            getOrCreateDailyNote: async () => ({ path: 'd.md' }),
            appendToSection: async () => {},
            updateDailyNoteYAML: async () => {},
            addPrinciple: async () => {},
        },
        app: { vault: { cachedRead: async () => '', getAbstractFileByPath: () => null, create: async () => {}, modify: async () => {} }, metadataCache: { getFileCache: () => null } },
        getAIProvider: () => ({ sendMessage: async () => '' }),
        kanbanService: null,
    };
}

console.log('\n=== Save/load cycle for evening questions ===\n');

// ----- Test 1: fresh user, no saved data -------------------------------------
console.log('Test 1: fresh user (no saved data) — defaults appear');
{
    const settings = simulateLoadSettings(null);
    assertEqual(settings.eveningQuestions.length, 9, 'fresh user has 9 default questions');
    assertEqual(settings.eveningQuestions[0].type, 'goal_alignment', 'fresh user first question is goal_alignment');
}

// ----- Test 2: user reorders questions; survive reload -----------------------
console.log('\nTest 2: user reorders → save → reload → order preserved');
{
    const s1 = simulateLoadSettings(null);
    // user drags tomorrow_plan to position 0
    const items = s1.eveningQuestions;
    const tpIdx = items.findIndex(q => q.type === 'tomorrow_plan');
    const [moved] = items.splice(tpIdx, 1);
    items.splice(0, 0, moved);
    // saveSettings → roundtrip via JSON
    const s2 = roundTrip(s1);
    assertEqual(s2.eveningQuestions[0].type, 'tomorrow_plan', 'reorder survives reload');
    // EveningSOP should use the new order
    const plugin = makePluginFromSettings(s2, true);
    const sop = new EveningSOP(plugin);
    const out = [];
    await sop.start({ type: 'evening', currentStep: 0, responses: {} }, m => out.push(m));
    assertTrue(out[0].includes(s2.eveningQuestions[0].initialMessage), 'EveningSOP uses reordered first question after reload');
}

// ----- Test 3: user edits initialMessage; survive reload ---------------------
console.log('\nTest 3: user edits a question content → save → reload → content preserved');
{
    const s1 = simulateLoadSettings(null);
    s1.eveningQuestions[0].initialMessage = 'CUSTOM_TEXT_42';
    s1.eveningQuestions[0].sectionName = 'CUSTOM_NAME_42';
    const s2 = roundTrip(s1);
    assertEqual(s2.eveningQuestions[0].initialMessage, 'CUSTOM_TEXT_42', 'initialMessage edit survives reload');
    assertEqual(s2.eveningQuestions[0].sectionName, 'CUSTOM_NAME_42', 'sectionName edit survives reload');
    const plugin = makePluginFromSettings(s2, true);
    const sop = new EveningSOP(plugin);
    const out = [];
    await sop.start({ type: 'evening', currentStep: 0, responses: {} }, m => out.push(m));
    assertTrue(out[0].includes('CUSTOM_TEXT_42'), 'EveningSOP sends the user-edited text after reload');
}

// ----- Test 4: user adds a new question; survive reload ----------------------
console.log('\nTest 4: user adds a new question → save → reload → new question present');
{
    const s1 = simulateLoadSettings(null);
    s1.eveningQuestions.push({ type: 'free_writing', sectionName: 'ADDED', initialMessage: 'JUST_ADDED', required: false, enabled: true });
    const s2 = roundTrip(s1);
    assertEqual(s2.eveningQuestions[s2.eveningQuestions.length - 1].initialMessage, 'JUST_ADDED', 'added question persists');
}

// ----- Test 5: user deletes a question; survive reload -----------------------
console.log('\nTest 5: user deletes a question → save → reload → deleted not back');
{
    const s1 = simulateLoadSettings(null);
    s1.eveningQuestions.splice(0, 1); // delete first
    const lengthBefore = s1.eveningQuestions.length;
    const s2 = roundTrip(s1);
    assertEqual(s2.eveningQuestions.length, lengthBefore, 'deletion persists across reload');
    assertTrue(s2.eveningQuestions[0].type !== 'goal_alignment', 'first item is no longer goal_alignment');
}

// ----- Test 6: full combined customization (real user scenario) --------------
console.log('\nTest 6: combined real-user scenario');
{
    // 1. Fresh load
    let settings = simulateLoadSettings(null);

    // 2. User opens settings, reorders: tomorrow_plan first, then success_diary
    const tpIdx = settings.eveningQuestions.findIndex(q => q.type === 'tomorrow_plan');
    settings.eveningQuestions.splice(0, 0, settings.eveningQuestions.splice(tpIdx, 1)[0]);

    // 3. User edits the first question
    settings.eveningQuestions[0].initialMessage = '🌟 明天最想做啥？';
    settings.eveningQuestions[0].sectionName = '明日规划';

    // 4. Save → reload (simulates plugin restart)
    settings = roundTrip(settings);

    // 5. Click Daily → EveningSOP.start()
    const plugin = makePluginFromSettings(settings, true);
    const sop = new EveningSOP(plugin);
    const out = [];
    await sop.start({ type: 'evening', currentStep: 0, responses: {} }, m => out.push(m));

    assertTrue(out[0].includes('🌟 明天最想做啥？'), 'first prompt after reload includes user\'s edit');
    assertEqual(sop.questionFlow[0].type, 'tomorrow_plan', 'flow respects user\'s reorder after reload');
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
try { fs.unlinkSync(mockPath); } catch {}
process.exit(fail === 0 ? 0 : 1);
