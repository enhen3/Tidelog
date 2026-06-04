/**
 * jsdom test for the evening questions settings UI.
 *
 * Reproduces the user-reported bug and verifies the fix:
 *   - clicking the row or triangle expands a detail panel with editable name
 *     input and editable content textarea
 *   - typing in either field updates plugin.settings.eveningQuestions[i]
 *   - typing in the name field also live-updates the row's name span
 *   - the enable checkbox controls which questions appear in Review Daily
 *   - this works for both pre-existing default questions AND for newly
 *     added (empty) questions
 *   - the row itself is no longer draggable; only the handle is, so inputs
 *     inside the row/detail panel aren't blocked by a draggable parent
 *
 * Run: node test-settings-ui.mjs
 */

import path from 'path';
import url from 'url';
import fs from 'fs';
import esbuild from 'esbuild';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// jsdom env with Obsidian's DOM prototype extensions monkey-patched in
// ---------------------------------------------------------------------------
const dom = new JSDOM(
    '<!DOCTYPE html><html><body></body></html>',
    { pretendToBeVisual: true, url: 'http://localhost/' },
);
const { window } = dom;
const { document, HTMLElement, Element } = window;

// Globals Obsidian/source code expects
globalThis.window = window;
globalThis.document = document;
globalThis.activeDocument = document;
globalThis.activeWindow = window;
globalThis.HTMLElement = HTMLElement;
globalThis.Element = Element;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.InputEvent = window.InputEvent;
globalThis.MouseEvent = window.MouseEvent;
globalThis.DocumentFragment = window.DocumentFragment;

// Obsidian's HTMLElement helpers (createDiv, createSpan, createEl,
// addClass, removeClass, hasClass, setText, setCssProps, setAttr, empty)
function applyOptions(el, options) {
    if (!options) return;
    if (typeof options === 'string') { el.className = options; return; }
    if (options.cls) {
        if (Array.isArray(options.cls)) el.classList.add(...options.cls);
        else el.classList.add(...String(options.cls).split(/\s+/).filter(Boolean));
    }
    if (options.text !== undefined) el.textContent = String(options.text);
    if (options.href !== undefined) el.setAttribute('href', String(options.href));
    if (options.attr) for (const [k, v] of Object.entries(options.attr)) el.setAttribute(k, String(v));
    if (options.type) el.setAttribute('type', options.type);
}
HTMLElement.prototype.createDiv = function (options, callback) {
    const el = document.createElement('div');
    applyOptions(el, options);
    this.appendChild(el);
    if (callback) callback(el);
    return el;
};
HTMLElement.prototype.createSpan = function (options, callback) {
    const el = document.createElement('span');
    applyOptions(el, options);
    this.appendChild(el);
    if (callback) callback(el);
    return el;
};
HTMLElement.prototype.createEl = function (tag, options, callback) {
    const el = document.createElement(tag);
    applyOptions(el, options);
    this.appendChild(el);
    if (callback) callback(el);
    return el;
};
HTMLElement.prototype.addClass = function (...c) { this.classList.add(...c); };
HTMLElement.prototype.removeClass = function (...c) { this.classList.remove(...c); };
HTMLElement.prototype.hasClass = function (c) { return this.classList.contains(c); };
HTMLElement.prototype.setText = function (t) { this.textContent = String(t); };
HTMLElement.prototype.setAttr = function (name, value) { this.setAttribute(name, String(value)); };
HTMLElement.prototype.setCssProps = function (props) {
    for (const [k, v] of Object.entries(props)) this.style.setProperty(k, String(v));
};
HTMLElement.prototype.empty = function () { while (this.firstChild) this.removeChild(this.firstChild); };
// Intentionally do NOT polyfill document.createDiv/createEl/createSpan here.
// Obsidian's reliable helpers are on HTMLElement; the settings UI should not
// require document-level helper methods to open the review question editor.

// ---------------------------------------------------------------------------
// Mock the 'obsidian' module
// ---------------------------------------------------------------------------
const mockPath = path.join(__dirname, 'obsidian-mock-ui.cjs');
fs.writeFileSync(
    mockPath,
    `
class Setting {
    constructor(containerEl) { this.containerEl = containerEl; }
    setName() { return this; }
    setDesc() { return this; }
    setHeading() { return this; }
    addText() { return this; }
    addDropdown() { return this; }
    addButton() { return this; }
    addSlider() { return this; }
    addExtraButton() { return this; }
}
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = activeDocument.createElement('div'); } display() {} }
class Modal { constructor(app) { this.app = app; this.contentEl = activeDocument.createElement('div'); } open() { this.onOpen?.(); } close() { this.onClose?.(); } }
module.exports = {
    App: class {},
    Modal,
    PluginSettingTab,
    Setting,
    Notice: class { constructor(){} },
    Platform: { isMobile: false },
    TFile: class {},
    moment: () => ({ format: () => '' }),
    MarkdownRenderer: { render: async () => {} },
    addIcon: () => {},
    ItemView: class {},
    Plugin: class {},
};
`,
);
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
    if (req === 'obsidian') return mockPath;
    return origResolve.call(this, req, parent, ...rest);
};

// ---------------------------------------------------------------------------
// Bundle the settings tab + dependencies into one CommonJS module
// ---------------------------------------------------------------------------
async function bundle(entryPath) {
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

// Shared entry so settings-tab, constants, i18n all share the same i18n instance
const entrySrc = `
export { TideLogSettingTab } from ${JSON.stringify(path.join(__dirname, 'src/settings/settings-tab.ts'))};
export { OnboardingModal } from ${JSON.stringify(path.join(__dirname, 'src/views/onboarding-modal.ts'))};
export { getDefaultEveningQuestions, DEFAULT_SETTINGS } from ${JSON.stringify(path.join(__dirname, 'src/constants.ts'))};
`;
const entryPath = path.join(__dirname, '.test-ui-entry.ts');
fs.writeFileSync(entryPath, entrySrc);
const { TideLogSettingTab, OnboardingModal, getDefaultEveningQuestions, DEFAULT_SETTINGS } = await bundle(entryPath);

// ---------------------------------------------------------------------------
// Test framework
// ---------------------------------------------------------------------------
let pass = 0, fail = 0;
function check(cond, label) {
    if (cond) { console.log(`  PASS  ${label}`); pass++; }
    else { console.log(`  FAIL  ${label}`); fail++; }
}

// Build a plugin stub
function makePlugin(eveningQuestions, { isPro = true, purchaseUrl = '' } = {}) {
    return {
        settings: { ...DEFAULT_SETTINGS, eveningQuestions },
        saveSettings: async () => {},
        licenseManager: {
            isPro: () => isPro,
            getPurchaseUrl: () => purchaseUrl,
            getLicenseLabel: () => '',
            getExpiryDate: () => null,
            activate: async () => ({ success: true, message: '' }),
        },
        getAIProvider: () => ({ sendMessage: async () => '', testConnection: async () => true }),
    };
}

function fireInput(el, value) {
    el.value = value;
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
}
function click(el) {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}
function clickTextNode(el) {
    el.firstChild.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}
function changeCheckbox(el, checked) {
    el.checked = checked;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
console.log('\n=== Evening question editor UI ===\n');

// Test 1: default questions render correctly + the row is NOT draggable
console.log('Test 1: row structure (handle is draggable, row is not)');
{
    const questions = getDefaultEveningQuestions();
    const plugin = makePlugin(questions);
    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    check(typeof document.createDiv === 'undefined', 'test environment does not polyfill document.createDiv');
    const rows = tab.containerEl.querySelectorAll('.tl-q-row');
    check(rows.length === questions.length, `${questions.length} rows rendered`);
    const firstRow = rows[0];
    check(firstRow.getAttribute('draggable') !== 'true', 'row is NOT draggable (so inputs aren\'t blocked)');
    const handle = firstRow.querySelector('.tl-q-drag-handle');
    check(handle?.getAttribute('draggable') === 'true', 'handle IS draggable');
    const toggles = tab.containerEl.querySelectorAll('.tl-q-toggle-input');
    check(toggles.length === questions.length, 'each question has an enable toggle');
    check(toggles[0]?.checked === true, 'required default question starts enabled');
    check(toggles[5]?.checked === false, 'optional default question starts disabled');
    check(rows[5]?.classList.contains('tl-q-disabled') === true, 'disabled optional question is visually dimmed');
}

// Test 1b: Free Pro card stays compact — no blank-page recovery helper in Settings
console.log('\nTest 1b: free Pro card omits blank-page recovery helper');
{
    const questions = getDefaultEveningQuestions();
    const plugin = makePlugin(questions, {
        isPro: false,
        purchaseUrl: 'https://afdian.com/item/463307362c2f11f1b39d52540025c377',
    });
    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    const proCard = tab.containerEl.querySelector('.tl-settings-pro-card');
    check(!!proCard, 'settings Pro card renders for free users');
    check(proCard?.querySelector('.tl-settings-pro-purchase-note')?.textContent?.includes('爱发电'), 'settings Pro card keeps the purchase/login/license note');
    check(proCard?.querySelector('.tl-settings-pro-trouble-note') === null, 'settings Pro card omits the blank-page recovery helper line');
    check(!proCard?.textContent?.includes('页面空白'), 'settings Pro card copy no longer contains 页面空白');
}

// Test 2: expanding a default question by clicking the row shows BOTH name input AND content textarea
console.log('\nTest 2: clicking a row reveals name input + content textarea');
{
    const questions = getDefaultEveningQuestions();
    const plugin = makePlugin(questions);
    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    const firstRow = tab.containerEl.querySelector('.tl-q-row');
    click(firstRow);

    const detail = firstRow.nextElementSibling;
    check(detail?.classList.contains('tl-q-detail'), 'detail panel inserted after row');

    const nameInput = detail?.querySelector('input.tl-q-detail-input');
    check(!!nameInput, 'detail panel has a name input');
    check(nameInput?.value === questions[0].sectionName, 'name input prefilled with sectionName');

    const textarea = detail?.querySelector('textarea.tl-q-detail-textarea');
    check(!!textarea, 'detail panel has a content textarea');
    check(textarea?.value === questions[0].initialMessage, 'textarea prefilled with initialMessage');
}

// Test 2b: real Chromium clicks can target text nodes inside the triangle/name spans
console.log('\nTest 2b: triangle/name text-node clicks open details');
{
    const questions = getDefaultEveningQuestions();
    const plugin = makePlugin(questions);
    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    const firstRow = tab.containerEl.querySelector('.tl-q-row');
    clickTextNode(firstRow.querySelector('.tl-q-triangle'));
    check(firstRow.nextElementSibling?.classList.contains('tl-q-detail') === true, 'triangle text-node click opens detail panel');

    const secondRow = tab.containerEl.querySelectorAll('.tl-q-row')[1];
    clickTextNode(secondRow.querySelector('.tl-q-name'));
    check(secondRow.nextElementSibling?.classList.contains('tl-q-detail') === true, 'name text-node click opens detail panel');
}

// Test 2c: clicking the enable toggle does NOT expand/collapse
console.log('\nTest 2c: enable toggle does not open details');
{
    const questions = getDefaultEveningQuestions();
    const plugin = makePlugin(questions);
    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    const secondRow = tab.containerEl.querySelectorAll('.tl-q-row')[1];
    click(secondRow.querySelector('.tl-q-toggle-input'));
    check(secondRow.nextElementSibling?.classList.contains('tl-q-detail') !== true, 'toggle click does not open detail panel');
}

// Test 3: typing in name input updates settings AND row name span
console.log('\nTest 3: typing in name input updates data and row label');
{
    const questions = getDefaultEveningQuestions();
    const plugin = makePlugin(questions);
    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    const firstRow = tab.containerEl.querySelector('.tl-q-row');
    click(firstRow);

    const detail = firstRow.nextElementSibling;
    const nameInput = detail.querySelector('input.tl-q-detail-input');
    fireInput(nameInput, 'CUSTOM_NAME_42');

    check(plugin.settings.eveningQuestions[0].sectionName === 'CUSTOM_NAME_42', 'settings.eveningQuestions[0].sectionName updated');
    const nameSpan = firstRow.querySelector('.tl-q-name');
    check(nameSpan?.textContent === 'CUSTOM_NAME_42', 'row name span mirrors the edit');
}

// Test 4: typing in textarea updates settings
console.log('\nTest 4: typing in content textarea updates data');
{
    const questions = getDefaultEveningQuestions();
    const plugin = makePlugin(questions);
    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    const firstRow = tab.containerEl.querySelector('.tl-q-row');
    click(firstRow);

    const textarea = firstRow.nextElementSibling.querySelector('textarea.tl-q-detail-textarea');
    fireInput(textarea, 'CUSTOM_CONTENT_77');

    check(plugin.settings.eveningQuestions[0].initialMessage === 'CUSTOM_CONTENT_77', 'settings.eveningQuestions[0].initialMessage updated');
}

// Test 5: collapsing then re-expanding preserves edits
console.log('\nTest 5: collapse → re-expand preserves the user\'s edits');
{
    const questions = getDefaultEveningQuestions();
    const plugin = makePlugin(questions);
    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    const firstRow = tab.containerEl.querySelector('.tl-q-row');
    click(firstRow);
    let detail = firstRow.nextElementSibling;
    fireInput(detail.querySelector('input.tl-q-detail-input'), 'KEEP_ME');
    fireInput(detail.querySelector('textarea.tl-q-detail-textarea'), 'KEEP_ME_2');

    click(firstRow);  // collapse
    check(firstRow.nextElementSibling?.classList.contains('tl-q-detail') !== true, 'after collapse, detail panel is gone');

    click(firstRow);  // re-expand
    detail = firstRow.nextElementSibling;
    const nameInput = detail.querySelector('input.tl-q-detail-input');
    const textarea = detail.querySelector('textarea.tl-q-detail-textarea');
    check(nameInput.value === 'KEEP_ME', 'name persists across collapse/expand');
    check(textarea.value === 'KEEP_ME_2', 'content persists across collapse/expand');
}

// Test 6: enable toggle updates settings and row visual state
console.log('\nTest 6: enable toggle updates settings and visual state');
{
    const questions = getDefaultEveningQuestions();
    const plugin = makePlugin(questions);
    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    const rows = tab.containerEl.querySelectorAll('.tl-q-row');
    const firstRow = rows[0];
    const firstToggle = firstRow.querySelector('.tl-q-toggle-input');
    changeCheckbox(firstToggle, false);
    await new Promise(r => setTimeout(r, 0));
    check(plugin.settings.eveningQuestions[0].enabled === false, 'toggle off saves enabled=false');
    check(firstRow.classList.contains('tl-q-disabled') === true, 'toggle off dims the row');

    changeCheckbox(firstToggle, true);
    await new Promise(r => setTimeout(r, 0));
    check(plugin.settings.eveningQuestions[0].enabled === true, 'toggle on saves enabled=true');
    check(firstRow.classList.contains('tl-q-disabled') === false, 'toggle on restores the row');
}

// Test 7: NEW QUESTION (the bug the user reported) — add, expand, edit name and content
console.log('\nTest 7: newly added question can have its name AND content edited');
{
    const questions = getDefaultEveningQuestions();
    const initialCount = questions.length;
    const plugin = makePlugin(questions);
    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    // Click "+ Add"
    const addLink = tab.containerEl.querySelector('.tl-q-add-link');
    click(addLink);
    // saveSettings is async; awaiting one microtask is enough for the .then(this.display) chain
    await new Promise(r => setTimeout(r, 0));

    const rows = tab.containerEl.querySelectorAll('.tl-q-row');
    check(rows.length === initialCount + 1, `after add, ${initialCount + 1} rows visible (got ${rows.length})`);

    const newRow = rows[rows.length - 1];
    const newIndex = rows.length - 1;

    // Expand the new (empty) question
    click(newRow);

    const detail = newRow.nextElementSibling;
    check(detail?.classList.contains('tl-q-detail'), 'new row expands into a detail panel');

    const nameInput = detail.querySelector('input.tl-q-detail-input');
    const textarea = detail.querySelector('textarea.tl-q-detail-textarea');
    check(!!nameInput, 'new question detail panel has name input');
    check(!!textarea, 'new question detail panel has content textarea');
    check(nameInput.value === '', 'new question name input starts empty');
    check(textarea.value === '', 'new question content textarea starts empty');

    // Edit them
    fireInput(nameInput, 'My new question');
    fireInput(textarea, 'What did you learn today?');

    check(plugin.settings.eveningQuestions[newIndex].sectionName === 'My new question', 'new question name saved');
    check(plugin.settings.eveningQuestions[newIndex].initialMessage === 'What did you learn today?', 'new question content saved');

    // The row's static name span should mirror the live edit
    const newNameSpan = newRow.querySelector('.tl-q-name');
    check(newNameSpan?.textContent === 'My new question', 'new row name span mirrors the edit');
}

// Test 8: deleting a question still works (regression guard)
console.log('\nTest 8: delete still works');
{
    const questions = getDefaultEveningQuestions();
    const initialCount = questions.length;
    const plugin = makePlugin(questions);
    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    const firstDelete = tab.containerEl.querySelector('.tl-q-row .tl-q-icon-delete');
    click(firstDelete);
    await new Promise(r => setTimeout(r, 0));

    check(plugin.settings.eveningQuestions.length === initialCount - 1, `first question deleted (got ${plugin.settings.eveningQuestions.length})`);
}

// Test 9: first-run onboarding renders and actions persist the completion flag
console.log('\nTest 9: onboarding modal renders and completes');
{
    let settingsOpened = false;
    let openedTabId = '';
    let completedCount = 0;
    let reviewStarted = false;
    const plugin = {
        settings: { ...DEFAULT_SETTINGS, onboardingCompleted: false },
        manifest: { id: 'tidelog' },
        licenseManager: { getPurchaseUrl: () => 'https://afdian.com/item/463307362c2f11f1b39d52540025c377' },
        completeOnboarding: async () => {
            plugin.settings.onboardingCompleted = true;
            completedCount++;
        },
        activateChatView: async (type) => {
            if (type === 'evening') reviewStarted = true;
        },
    };
    const app = {
        setting: {
            open: () => { settingsOpened = true; },
            openTabById: (id) => { openedTabId = id; },
        },
    };

    const modal = new OnboardingModal(app, plugin);
    modal.open();

    check(modal.contentEl.querySelectorAll('.tl-onboarding-step').length === 3, 'onboarding shows three setup steps');
    check(modal.contentEl.querySelectorAll('.tl-onboarding-method-card').length === 3, 'onboarding explains product philosophy, method, and Pro value');
    check(modal.contentEl.querySelector('.tl-onboarding-pro-link')?.getAttribute('href') === plugin.licenseManager.getPurchaseUrl(), 'onboarding Pro link uses license manager URL');
    check(modal.contentEl.querySelector('.tl-onboarding-pro-footer'), 'onboarding Pro link is demoted into a lightweight footer');

    click(modal.contentEl.querySelector('.tl-onboarding-primary'));
    check(plugin.settings.onboardingCompleted === true, 'configure action marks onboarding completed');
    check(settingsOpened === true, 'configure action opens settings');
    check(openedTabId === 'tidelog', 'configure action opens TideLog settings tab');
    check(completedCount >= 1, 'completion handler called');

    plugin.settings.onboardingCompleted = false;
    const modal2 = new OnboardingModal(app, plugin);
    modal2.open();
    click(modal2.contentEl.querySelector('.tl-onboarding-secondary'));
    check(plugin.settings.onboardingCompleted === true, 'review action marks onboarding completed');
    check(reviewStarted === true, 'review action starts daily review');
}

// Test 10: settings regressions requested in the polish pass
console.log('\nTest 10: settings polish regression guards');
{
    const settingsSrc = fs.readFileSync(path.join(__dirname, 'src/settings/settings-tab.ts'), 'utf8');
    const zhSrc = fs.readFileSync(path.join(__dirname, 'src/i18n/zh.ts'), 'utf8');
    const enSrc = fs.readFileSync(path.join(__dirname, 'src/i18n/en.ts'), 'utf8');
    const migrationSrc = fs.readFileSync(path.join(__dirname, 'src/settings-migration.ts'), 'utf8');
    const cssSrc = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
    const readAsset = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
    const publicProductCopy = [
        zhSrc,
        enSrc,
        readAsset('assets/tidelog-hero.svg'),
        readAsset('assets/tidelog-preview.svg'),
        readAsset('marketing/afdian-tidelog-pro-cover.svg'),
        readAsset('marketing/afdian-tidelog-pro-description.md'),
        readAsset('README.md'),
    ].join('\n');

    check(settingsSrc.includes('setLimits(0, 8, 1)'), 'day boundary slider is limited to 0–8');
    check(settingsSrc.includes('slider.sliderEl.after(valueEl)'), 'day boundary label is placed beside the slider');
    check(settingsSrc.includes('getBoundaryExampleTime'), 'day boundary examples are computed from the selected hour');
    check(settingsSrc.includes('refreshQuestionLimitBadges'), 'question Pro badges refresh immediately after enable toggles');
    check(!zhSrc.includes('Pro 中生效') && zhSrc.includes('Pro 生效中') && zhSrc.includes('需 Pro'), 'review question badges distinguish Pro active vs Pro required');
    check(settingsSrc.includes('saveSettingsPreservingScroll'), 'rerenders preserve current scroll position');
    check(settingsSrc.includes('renderInlineTestConnection'), 'AI test connection is integrated into the model row');
    check(settingsSrc.includes('renderAISetupGuide'), 'AI setup guide is shown before provider API key fields');
    check(settingsSrc.indexOf('this.renderAISetupGuide(containerEl)') < settingsSrc.indexOf(".setName(t('settings.aiProvider'))"), 'AI setup guide appears above the provider picker');
    check(settingsSrc.includes("createEl('details'") && settingsSrc.includes('guideEl.open = !hasConfiguredApi'), 'AI setup guide collapses by default after an API key is configured');
    check(settingsSrc.includes('guideEl.open = !this.plugin.settings.onboardingCompleted'), 'getting-started guide collapses after onboarding is completed');
    check(settingsSrc.includes('https://cloud.siliconflow.cn/account/ak'), 'AI setup guide links directly to the SiliconFlow API key page');
    check(DEFAULT_SETTINGS.activeProvider === 'siliconflow' && DEFAULT_SETTINGS.providers.siliconflow.model === 'deepseek-ai/DeepSeek-V3.2', 'new users start from the current SiliconFlow example model');
    check(migrationSrc.includes("deepseek-ai/DeepSeek-V3.2-Exp") && migrationSrc.includes("deepseek-ai/DeepSeek-V3.2"), 'settings migration upgrades old SiliconFlow V3.2 Exp model IDs');
    check(migrationSrc.includes('updateInactiveProviderDefault') && migrationSrc.includes('gpt-5.4-mini'), 'settings migration refreshes inactive stale provider defaults without overriding the active provider');
    check(settingsSrc.includes('gpt-5.4-mini') && settingsSrc.includes('gpt-5.5'), 'OpenAI model presets use current model IDs');
    check(settingsSrc.includes('claude-sonnet-4-6') && settingsSrc.includes('gemini-2.5-flash'), 'Anthropic and Gemini presets use current model IDs');
    check(zhSrc.includes('2 分钟配置好 API') && zhSrc.includes('复制完整 Key，包括开头的 sk-'), 'Chinese AI setup copy guides first-time users through example-based API key setup');
    check(!zhSrc.includes('大陆用户建议') && !enSrc.includes('mainland China users'), 'AI setup guide no longer makes a direct region-based recommendation');
    check(enSrc.includes('Set up API in 2 minutes') && enSrc.includes('copy the full key including the sk- prefix'), 'English AI setup copy mirrors the example-based setup flow');
    check(!settingsSrc.includes('tl-ai-setup-meta') && !cssSrc.includes('tl-ai-setup-pill'), 'AI setup guide no longer renders extra bottom hint tags');
    check(!zhSrc.includes('settings.aiSetupMeta') && !enSrc.includes('settings.aiSetupMeta'), 'AI setup guide copy removes redundant bottom hint tag strings');
    check(cssSrc.includes('tl-ai-setup-guide') && cssSrc.includes('tl-ai-setup-step-number'), 'AI setup guide has dedicated visual hierarchy styles');
    check(cssSrc.includes('tl-settings-guide-main'), 'getting-started guide uses a full-width consistent settings layout');
    check(!settingsSrc.includes('tl-settings-workflow-card') && !zhSrc.includes('新版工作流') && !enSrc.includes('New workflow'), 'settings page merges workflow explanation into quick start instead of a separate new-workflow card');
    check(zhSrc.includes('计划 → 复盘') && enSrc.includes('Plan → Review'), 'settings quick start explains the plan review loop');
    check(zhSrc.includes('完成复盘后刷新计划建议') && enSrc.includes('refresh planning suggestions after a review'), 'settings AI copy mentions post-review suggestion refresh');
    check(zhSrc.includes('settings.enableMorning') && zhSrc.includes('启用计划流程'), 'settings old Morning switch copy is renamed to the plan flow');
    check(zhSrc.includes('settings.enableEvening') && zhSrc.includes('启用复盘流程'), 'settings old Evening switch copy is renamed to the review flow');
    check(!settingsSrc.includes('proFeatureDashboard') && !zhSrc.includes('settings.proFeatureDashboard') && !enSrc.includes('settings.proFeatureDashboard'), 'settings Pro copy no longer uses old dashboard feature wording');
    check(!zhSrc.includes('解锁完整晚间复盘、AI 洞察报告、仪表盘') && !enSrc.includes('dashboard, and more'), 'settings purchase copy avoids old dashboard wording');
    check(!publicProductCopy.includes('Morning Plan') && !publicProductCopy.includes('Evening Review'), 'public product copy no longer uses old Morning Plan / Evening Review labels');
    check(!publicProductCopy.includes('Four product surfaces') && !publicProductCopy.includes('Dashboard, Calendar heatmap, and Kanban'), 'public product assets no longer present old four-surface dashboard positioning');
    check(!publicProductCopy.includes('完整 5+4') && !publicProductCopy.includes('完整晚间复盘'), 'public Pro copy no longer markets the old 5+4 evening-review packaging');
    check(publicProductCopy.includes('AI 眼中的你') && publicProductCopy.includes('报告预览'), 'public product copy mentions AI profile and report preview');
    check(cssSrc.includes('tl-settings-redeem-inline'), 'license redeem UI is compact and inline with Pro card');
    check(zhSrc.includes('把日记变成行动闭环') && enSrc.includes('Turn notes into an action loop'), 'settings hero uses a concise action-loop slogan');
    check(zhSrc.includes("'settings.openGettingStarted': '查看完整说明'") && enSrc.includes("'settings.openGettingStarted': 'View details'"), 'getting-started action uses user-facing detail wording');
    check(!zhSrc.includes("'settings.openGettingStarted': '打开引导'") && !enSrc.includes("'settings.openGettingStarted': 'Open guide'"), 'getting-started action avoids clumsy open-guide wording');
    check(cssSrc.includes('tl-onboarding-pro-footer') && cssSrc.includes('tl-onboarding-pro-link'), 'onboarding Pro CTA uses lightweight footer styling');
    check(settingsSrc.includes('reviewProRequiredNotice'), 'free users get a Pro requirement notice when enabling extra review questions');
    check(cssSrc.includes('tl-onboarding-method-grid'), 'onboarding includes richer method/value cards');
    check(cssSrc.includes('color: #071417') || cssSrc.includes('color: #0B1B1F'), 'settings hero copy uses dark readable text on the light hero background');
    check(cssSrc.includes('overflow-y: auto') && cssSrc.includes('max-height: min(760px, calc(100vh - 96px))'), 'onboarding modal can scroll when content is taller than the viewport');
    check(cssSrc.includes('.tl-settings-logo-mark::before') && cssSrc.includes('box-shadow:') && cssSrc.includes('tl-settings-logo-line'), 'settings logo uses the current note-lines plus tide-curve visual language');
    check(cssSrc.includes('.tl-settings-boundary-note') && cssSrc.includes('font-weight: 500'), 'day boundary helper note is visually demoted');
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
try { fs.unlinkSync(mockPath); } catch {}
try { fs.unlinkSync(entryPath); } catch {}
process.exit(fail === 0 ? 0 : 1);
