/**
 * Repro + verification test for the Daily review customization bug.
 *
 * Two underlying defects in the old loadSettings caused user-facing pain:
 *   (1) Aliasing — when the user has no saved `eveningQuestions` field, the
 *       shallow merge `{...DEFAULT_SETTINGS, ...saved}` aliased
 *       `settings.eveningQuestions` directly to
 *       `DEFAULT_SETTINGS.eveningQuestions`. Settings UI edits then mutated
 *       the module-level defaults.
 *   (2) Language-stale defaults — `DEFAULT_SETTINGS.eveningQuestions` is
 *       computed at module load while the i18n language is still the
 *       startup default ('zh'). Users who saved `language: 'en'` got Chinese
 *       default questions, mixed in with whatever they customized — a
 *       confusing experience that reads as "customizations aren't taking
 *       effect".
 *
 * The fix in src/main.ts loadSettings:
 *   - apply saved language BEFORE any default generation
 *   - deep-clone saved.eveningQuestions instead of aliasing
 *   - regenerate fresh defaults (via getDefaultEveningQuestions()) when
 *     saved.eveningQuestions is missing or empty
 *
 * This test compares the BROKEN old behavior against the FIXED new behavior.
 */

import path from 'path';
import url from 'url';
import fs from 'fs';
import esbuild from 'esbuild';
import { createRequire } from 'module';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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

// Bundle all three modules from a single virtual entry point so they share
// the i18n module instance (so setLanguage() affects getDefaultEveningQuestions()).
const entrySrc = `
export { DEFAULT_SETTINGS, getDefaultEveningQuestions } from ${JSON.stringify(path.join(__dirname, 'src/constants.ts'))};
export { EveningSOP } from ${JSON.stringify(path.join(__dirname, 'src/sop/evening-sop.ts'))};
export { setLanguage, getLanguage } from ${JSON.stringify(path.join(__dirname, 'src/i18n/index.ts'))};
`;
const entryPath = path.join(__dirname, '.test-entry.ts');
fs.writeFileSync(entryPath, entrySrc);

async function bundleEntry() {
    const res = await esbuild.build({
        entryPoints: [entryPath],
        bundle: true,
        write: false,
        format: 'cjs',
        target: 'es2020',
        external: ['obsidian'],
        platform: 'node',
        logLevel: 'silent',
    });
    const m = { exports: {} };
    new Function('module', 'exports', 'require', res.outputFiles[0].text)(m, m.exports, require);
    return m.exports;
}

const all = await bundleEntry();
const { DEFAULT_SETTINGS, getDefaultEveningQuestions, EveningSOP, setLanguage } = all;

// --- The old, buggy loadSettings (kept for regression-witness only) ---------
function loadSettings_OLD(savedFromDisk) {
    const saved = savedFromDisk ?? {};
    const mergedProviders = { ...DEFAULT_SETTINGS.providers };
    const savedProviders = saved.providers;
    if (savedProviders) {
        for (const key of Object.keys(savedProviders)) {
            mergedProviders[key] = { ...DEFAULT_SETTINGS.providers[key], ...savedProviders[key] };
        }
    }
    return { ...DEFAULT_SETTINGS, ...saved, providers: mergedProviders };
}

// --- The fixed loadSettings (mirrors src/main.ts) ---------------------------
function loadSettings_FIXED(savedFromDisk) {
    const saved = savedFromDisk ?? {};
    if (saved.language) setLanguage(saved.language);
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

function makePlugin(settings, pro = true) {
    return {
        settings,
        licenseManager: { isPro: () => pro, getPurchaseUrl: () => '' },
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

let pass = 0, fail = 0;
function check(cond, label) {
    if (cond) { console.log(`  PASS  ${label}`); pass++; }
    else { console.log(`  FAIL  ${label}`); fail++; }
}

// --- Snapshot pristine defaults for cleanup between tests --------------------
const pristine = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.eveningQuestions));
function restoreDefaults() {
    DEFAULT_SETTINGS.eveningQuestions.length = 0;
    for (const q of pristine) DEFAULT_SETTINGS.eveningQuestions.push({ ...q });
    setLanguage('zh');
}

console.log('\n=== BUG REPRODUCTION + FIX VERIFICATION ===\n');

// ---- Bug 1: aliasing (was a bug, now fixed) --------------------------------
console.log('Bug 1: shallow-merge aliases settings.eveningQuestions to DEFAULT_SETTINGS');
restoreDefaults();
{
    const settings = loadSettings_OLD(null);
    check(settings.eveningQuestions === DEFAULT_SETTINGS.eveningQuestions, '[OLD] settings.eveningQuestions IS aliased to DEFAULT_SETTINGS (bug)');
    settings.eveningQuestions[0].initialMessage = 'CORRUPTED';
    check(DEFAULT_SETTINGS.eveningQuestions[0].initialMessage === 'CORRUPTED', '[OLD] UI edits leak into DEFAULT_SETTINGS (bug)');
}
restoreDefaults();
{
    const settings = loadSettings_FIXED(null);
    check(settings.eveningQuestions !== DEFAULT_SETTINGS.eveningQuestions, '[FIXED] settings.eveningQuestions is NOT aliased');
    settings.eveningQuestions[0].initialMessage = 'CORRUPTED';
    check(DEFAULT_SETTINGS.eveningQuestions[0].initialMessage !== 'CORRUPTED', '[FIXED] UI edits do NOT leak into DEFAULT_SETTINGS');
}

// ---- Bug 2: English user gets Chinese default questions --------------------
console.log('\nBug 2: english user gets default questions in the wrong language');
restoreDefaults();
{
    const settings = loadSettings_OLD({ language: 'en' });
    const firstQ = settings.eveningQuestions[0].initialMessage;
    const isEnglish = /^[\x00-\x7f\s]+$/.test(firstQ);
    check(!isEnglish, `[OLD] English user's first default question is in Chinese (bug): "${firstQ.substring(0,30)}..."`);
}
restoreDefaults();
{
    const settings = loadSettings_FIXED({ language: 'en' });
    const firstQ = settings.eveningQuestions[0].initialMessage;
    const isEnglish = /^[\x00-\x7f\s]+$/.test(firstQ);
    check(isEnglish, `[FIXED] English user's first default question is in English: "${firstQ.substring(0,40)}..."`);
}

// ---- User customization flows correctly (sanity, both old + new) -----------
console.log('\nSanity: returning user with customized order + content (no regression)');
restoreDefaults();
{
    const userSaved = {
        eveningQuestions: [
            { type: 'tomorrow_plan', sectionName: '明日规划', initialMessage: 'CUSTOM_FIRST', required: true, enabled: true },
            { type: 'success_diary', sectionName: '亮点', initialMessage: 'CUSTOM_SECOND', required: true, enabled: true },
        ],
    };
    const settings = loadSettings_FIXED(userSaved);
    check(settings.eveningQuestions[0].initialMessage === 'CUSTOM_FIRST', '[FIXED] saved customization is applied (first)');
    check(settings.eveningQuestions[1].initialMessage === 'CUSTOM_SECOND', '[FIXED] saved customization is applied (second)');
    check(settings.eveningQuestions[0].type === 'tomorrow_plan', '[FIXED] saved order respected (tomorrow_plan first)');

    const sop = new EveningSOP(makePlugin(settings, true));
    const out = [];
    await sop.start({ type: 'evening', currentStep: 0, responses: {} }, m => out.push(m));
    check(out[0].includes('CUSTOM_FIRST'), '[FIXED] EveningSOP sends the user-customized first question');
}

// ---- Empty array → regenerate defaults instead of leaving empty ------------
console.log('\nEdge case: saved.eveningQuestions is empty array → fall back to fresh defaults');
restoreDefaults();
{
    const settings = loadSettings_FIXED({ eveningQuestions: [] });
    check(settings.eveningQuestions.length === 9, `[FIXED] empty saved array gets 9 defaults (got ${settings.eveningQuestions.length})`);
}

// ---- Save/load round-trip preserves customization --------------------------
console.log('\nRound-trip: customize → save → reload preserves order + content');
restoreDefaults();
{
    let settings = loadSettings_FIXED(null);
    const tpIdx = settings.eveningQuestions.findIndex(q => q.type === 'tomorrow_plan');
    settings.eveningQuestions.unshift(settings.eveningQuestions.splice(tpIdx, 1)[0]);
    settings.eveningQuestions[0].initialMessage = 'CUSTOM_RT';
    const onDisk = JSON.parse(JSON.stringify(settings));
    settings = loadSettings_FIXED(onDisk);
    check(settings.eveningQuestions[0].initialMessage === 'CUSTOM_RT', '[FIXED] round-trip preserves edited content');
    check(settings.eveningQuestions[0].type === 'tomorrow_plan', '[FIXED] round-trip preserves order');
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
try { fs.unlinkSync(mockPath); } catch {}
try { fs.unlinkSync(entryPath); } catch {}
process.exit(fail === 0 ? 0 : 1);
