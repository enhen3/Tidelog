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
    constructor(containerEl) {
        this.containerEl = containerEl;
        this.settingEl = activeDocument.createElement('div');
        this.settingEl.className = 'setting-item';
        this.infoEl = this.settingEl.appendChild(activeDocument.createElement('div'));
        this.nameEl = this.infoEl.appendChild(activeDocument.createElement('div'));
        this.nameEl.className = 'setting-item-name';
        this.descEl = this.infoEl.appendChild(activeDocument.createElement('div'));
        this.descEl.className = 'setting-item-description';
        this.controlEl = this.settingEl.appendChild(activeDocument.createElement('div'));
        this.controlEl.className = 'setting-item-control';
        containerEl.appendChild(this.settingEl);
    }
    setName(value) { this.nameEl.textContent = String(value); return this; }
    setDesc(value) { this.descEl.textContent = String(value); return this; }
    setHeading() { this.settingEl.classList.add('setting-item-heading'); return this; }
    addText(callback) {
        const inputEl = this.controlEl.appendChild(activeDocument.createElement('input'));
        callback?.({
            inputEl,
            setPlaceholder: (value) => { inputEl.placeholder = value; return this; },
            setValue: (value) => { inputEl.value = value; return this; },
            onChange: () => this,
        });
        return this;
    }
    addDropdown(callback) {
        const selectEl = this.controlEl.appendChild(activeDocument.createElement('select'));
        const component = {
            selectEl,
            addOption: (value, label) => {
                const optionEl = activeDocument.createElement('option');
                optionEl.value = value;
                optionEl.textContent = label;
                selectEl.appendChild(optionEl);
                return component;
            },
            setValue: (value) => { selectEl.value = value; return component; },
            onChange: () => component,
        };
        callback?.(component);
        return this;
    }
    addButton(callback) {
        const buttonEl = this.controlEl.appendChild(activeDocument.createElement('button'));
        const component = {
            buttonEl,
            setButtonText: (value) => { buttonEl.textContent = value; return component; },
            onClick: (handler) => { buttonEl.addEventListener('click', handler); return component; },
        };
        callback?.(component);
        return this;
    }
    addSlider() { return this; }
    addExtraButton() { return this; }
}
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = activeDocument.createElement('div'); } display() {} }
class Modal {
    constructor(app) {
        this.app = app;
        this.modalEl = activeDocument.createElement('div');
        this.contentEl = activeDocument.createElement('div');
        this.modalEl.appendChild(this.contentEl);
    }
    open() { this.onOpen?.(); }
    close() { this.onClose?.(); }
}
class FuzzySuggestModal { constructor(app) { this.app = app; } setPlaceholder() { return this; } open() {} }
class TFolder { constructor(path = '') { this.path = path; } }
module.exports = {
    App: class {},
    Modal,
    FuzzySuggestModal,
    PluginSettingTab,
    Setting,
    Notice: class { constructor(){} },
    Platform: { isMobile: false },
    TFile: class {},
    TFolder,
    normalizePath: (value) => value,
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
export { TideLogSettingTab, LicenseActivationModal } from ${JSON.stringify(path.join(__dirname, 'src/settings/settings-tab.ts'))};
export { OnboardingModal } from ${JSON.stringify(path.join(__dirname, 'src/views/onboarding-modal.ts'))};
export { getDefaultEveningQuestions, DEFAULT_SETTINGS } from ${JSON.stringify(path.join(__dirname, 'src/constants.ts'))};
`;
const entryPath = path.join(__dirname, '.test-ui-entry.ts');
fs.writeFileSync(entryPath, entrySrc);
const { TideLogSettingTab, LicenseActivationModal, OnboardingModal, getDefaultEveningQuestions, DEFAULT_SETTINGS } = await bundle(entryPath);

// ---------------------------------------------------------------------------
// Test framework
// ---------------------------------------------------------------------------
let pass = 0, fail = 0;
function check(cond, label) {
    if (cond) { console.log(`  PASS  ${label}`); pass++; }
    else { console.log(`  FAIL  ${label}`); fail++; }
}

// Build a plugin stub
function makePlugin(eveningQuestions, { isPro = true, purchaseUrl = '', accessState: explicitAccessState } = {}) {
    const accessState = explicitAccessState ?? (isPro ? 'paid' : 'free');
    const hasProAccess = accessState === 'paid' || accessState === 'trial';
    return {
        settings: { ...DEFAULT_SETTINGS, eveningQuestions },
        saveSettings: async () => {},
        licenseManager: {
            isPro: () => hasProAccess,
            getAccessState: () => accessState,
            getTrialDaysRemaining: () => accessState === 'trial' ? 7 : 0,
            getTrialExpiryDate: () => accessState === 'trial' ? '2026/9/7' : null,
            needsAISetupForTrial: () => false,
            startTrial: async () => true,
            getPurchaseUrl: () => purchaseUrl,
            getLicenseLabel: () => '',
            getExpiryDate: () => null,
            activate: async () => ({ success: true, message: '' }),
        },
        getAIProvider: () => ({ sendMessage: async () => '', testConnection: async () => true }),
        hasConfiguredAI: () => true,
        openFirstInsight: async () => {},
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
    check(!!proCard?.querySelector('.tl-settings-pro-actions button'), 'settings Pro card keeps purchase and trial actions in its compact header');
    check(proCard?.querySelector('.tl-settings-pro-purchase-panel') === null, 'settings Pro card no longer spends a full row on purchase copy');
    const actionLabels = [...(proCard?.querySelectorAll('.tl-settings-pro-actions button') ?? [])].map((button) => button.textContent);
    check(actionLabels.includes('购买 Pro') && actionLabels.includes('激活 Pro'), 'purchase and activation are peer actions in the compact header');
    check(proCard?.querySelector('.tl-settings-license-details') === null, 'activation no longer expands an input inside the plan card');
    check(proCard?.querySelector('.tl-settings-pro-trouble-note') === null, 'settings Pro card omits the blank-page recovery helper line');
    check(!proCard?.textContent?.includes('页面空白'), 'settings Pro card copy no longer contains 页面空白');
}

// Test 1bb: active trial shows purchase and activation side by side
console.log('\nTest 1bb: trial plan card keeps purchase and activation together');
{
    const plugin = makePlugin(getDefaultEveningQuestions(), {
        accessState: 'trial',
        purchaseUrl: 'https://afdian.com/item/463307362c2f11f1b39d52540025c377',
    });
    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    const actions = tab.containerEl.querySelector('.tl-settings-pro-actions');
    const labels = [...actions.querySelectorAll('button')].map((button) => button.textContent);
    check(labels.join('|') === '购买 Pro|激活 Pro', 'trial card places Buy Pro and Activate Pro in one action group');
    check(tab.containerEl.querySelector('.tl-settings-license-details') === null, 'trial card has no extra activation row');
}

// Test 1bc: activation opens a focused small flow instead of expanding Settings
console.log('\nTest 1bc: activation modal accepts and submits a code');
{
    const plugin = makePlugin(getDefaultEveningQuestions(), { isPro: false });
    let submittedKey = '';
    let refreshed = 0;
    plugin.licenseManager.activate = async (key) => {
        submittedKey = key;
        return { success: true, message: '已激活' };
    };
    const modal = new LicenseActivationModal({}, plugin, () => { refreshed++; });
    modal.open();
    const input = modal.contentEl.querySelector('input');
    const button = modal.contentEl.querySelector('button');
    check(modal.contentEl.textContent.includes('激活 TideLog Pro'), 'activation modal explains the focused action');
    check(button.disabled === true, 'activation starts disabled until a code is entered');
    fireInput(input, '  TL-TEST-CODE  ');
    check(button.disabled === false, 'activation enables after a non-empty code');
    click(button);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    check(submittedKey === 'TL-TEST-CODE' && refreshed === 1, 'activation trims the code and refreshes Settings after success');
}

// Test 1bd: quick guide opens only on its first Settings visit
console.log('\nTest 1bd: quick guide first-visit default');
{
    const plugin = makePlugin(getDefaultEveningQuestions());
    plugin.settings.quickGuideSeen = false;
    let saves = 0;
    plugin.saveSettings = async () => { saves++; };

    const firstTab = new TideLogSettingTab({}, plugin);
    firstTab.display();
    const firstGuide = firstTab.containerEl.querySelector('.tl-settings-quick-guide');
    check(firstGuide.open === true, 'quick guide is open on the first Settings visit');
    check(plugin.settings.quickGuideSeen === true && saves >= 1, 'first visit is persisted without waiting for a manual toggle');
    check(firstGuide.textContent.includes('你') && firstGuide.textContent.includes('AI'), 'each stage distinguishes the user action from the AI contribution');
    check(firstGuide.textContent.includes('下一周期的计划建议') && firstGuide.textContent.includes('记录—反馈—调整'), 'the guide closes the Plan–Review–Insights loop');
    check(firstGuide.querySelector('.tl-settings-quick-guide-help') === null, 'redundant onboarding helper sentence is removed');

    const nextTab = new TideLogSettingTab({}, plugin);
    nextTab.display();
    const nextGuide = nextTab.containerEl.querySelector('.tl-settings-quick-guide');
    check(nextGuide.open === false, 'quick guide defaults to collapsed after the first visit');
    nextGuide.open = true;
    check(nextGuide.open === true, 'the user can manually expand the guide again');
}

// Test 1c: legacy import card refreshes immediately after API configuration changes
console.log('\nTest 1c: legacy import card updates after API is configured');
{
    const questions = getDefaultEveningQuestions();
    const plugin = makePlugin(questions);
    plugin.settings.activeProvider = 'siliconflow';
    plugin.settings.providers.siliconflow.apiKey = '';
    let firstInsightOpened = 0;
    plugin.hasConfiguredAI = () => Boolean(plugin.settings.providers[plugin.settings.activeProvider]?.apiKey?.trim());
    plugin.openFirstInsight = async () => { firstInsightOpened++; };

    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    const legacyCard = [...tab.containerEl.querySelectorAll('.setting-item')]
        .find((item) => item.querySelector('.setting-item-name')?.textContent === '导入旧日记');
    const legacyButton = legacyCard?.querySelector('button');
    check(!legacyCard?.textContent?.includes('先配置 API'), 'legacy import row no longer asks for API configuration');

    plugin.settings.providers.siliconflow.apiKey = 'sk-test';
    tab.refreshLegacyImportEntryState();

    check(legacyCard?.textContent?.includes('开始导入'), 'legacy import row keeps a direct import action');
    click(legacyButton);
    await Promise.resolve();
    check(firstInsightOpened === 1, 'legacy import action opens the first insight flow after API is configured');
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

// Test 8: built-ins are protected; user-created questions can be deleted
console.log('\nTest 8: only user-created questions can be deleted');
{
    const questions = getDefaultEveningQuestions();
    const initialCount = questions.length;
    questions.push({
        type: 'free_writing',
        sectionName: 'Custom question',
        initialMessage: 'Custom content',
        required: false,
        enabled: true,
        custom: true,
    });
    const plugin = makePlugin(questions);
    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    const rows = tab.containerEl.querySelectorAll('.tl-q-row');
    check(rows[0].querySelector('.tl-q-icon-delete') === null, 'built-in question has no delete action');
    const customDelete = rows[rows.length - 1].querySelector('.tl-q-icon-delete');
    check(!!customDelete, 'user-created question has a delete action');
    click(customDelete);
    await new Promise(r => setTimeout(r, 0));

    check(plugin.settings.eveningQuestions.length === initialCount, `custom question deleted (got ${plugin.settings.eveningQuestions.length})`);
}

// Test 9: path selection never pretends that first value has been delivered
console.log('\nTest 9: onboarding modal routes without premature completion');
{
    let completedCount = 0;
    let startedFlow = '';
    let settingsClosed = 0;
    const openedViews = [];
    const plugin = {
        settings: { ...DEFAULT_SETTINGS, onboardingCompleted: false },
        manifest: { id: 'tidelog' },
        licenseManager: { getPurchaseUrl: () => 'https://afdian.com/item/463307362c2f11f1b39d52540025c377' },
        completeOnboarding: async () => {
            plugin.settings.onboardingCompleted = true;
            completedCount++;
        },
        activateChatView: async (type) => {
            startedFlow = type;
        },
        openView: async (viewType) => { openedViews.push(viewType); },
        openFirstInsight: async () => {},
        legacyImportService: { listVaultFolders: () => ['我的日记', 'Attachments'] },
    };
    const app = { setting: { close: () => { settingsClosed++; } } };

    const modal = new OnboardingModal(app, plugin);
    modal.open();

    // 引导重做后是一屏两路径：不再有三步骤 / 方法卡 / 试用条款。
    check(!modal.contentEl.querySelector('.tl-onboarding-step'), 'the three-step group is gone');
    check(!modal.contentEl.querySelector('.tl-onboarding-method-card'), 'the method cards are gone');
    check(!modal.contentEl.querySelector('.tl-onboarding-pro-link'), 'onboarding does not ask users to purchase before value');
    check(!modal.contentEl.querySelector('.tl-onboarding-trial-intro'), 'trial terms moved to the paywall');
    check(modal.contentEl.querySelectorAll('.tl-onboarding-path-button').length === 2, 'exactly two path CTAs remain');
    check(!modal.contentEl.querySelector('.tl-onboarding-folder-value'), 'folder choice is not shown before path choice');

    click(modal.contentEl.querySelector('.tl-onboarding-has-journals'));
    check(!!modal.contentEl.querySelector('.tl-onboarding-folder-tree'), 'past-journal path reveals the vault folder tree');
    check(!modal.contentEl.querySelector('input[type="text"]'), 'past-journal path never requires manual folder typing');
    click(modal.contentEl.querySelector('.tl-onboarding-primary'));
    check(plugin.settings.onboardingCompleted === false, 'opening profile generation does not mark onboarding completed');
    check(openedViews.length === 0, 'the primary CTA is the profile path, not a view switch');
    check(completedCount === 0, 'completion handler is not called before profile save');

    const modal2 = new OnboardingModal(app, plugin);
    modal2.open();
    click(modal2.contentEl.querySelector('.tl-onboarding-no-journals'));
    check(!!modal2.contentEl.querySelector('.tl-onboarding-start-flow'), 'no-journal path explains the fresh-start loop before leaving onboarding');
    check(startedFlow === '', 'choosing the no-journal path does not launch an invisible action behind Settings');
    click(modal2.contentEl.querySelector('.tl-onboarding-start-plan'));
    check(plugin.settings.onboardingCompleted === false, 'opening Plan does not mark onboarding completed');
    check(startedFlow === 'morning', 'explicit Plan action starts today\'s plan');
    check(settingsClosed === 1, 'explicit Plan action closes Settings before revealing TideLog');
}

// Test 10: settings regressions requested in the polish pass
console.log('\nTest 10: settings polish regression guards');
{
    const settingsSrc = fs.readFileSync(path.join(__dirname, 'src/settings/settings-tab.ts'), 'utf8');
    const onboardingSrc = fs.readFileSync(path.join(__dirname, 'src/views/onboarding-modal.ts'), 'utf8');
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

    check(settingsSrc.includes('for (let hour = 0; hour <= 8; hour += 1)'), 'day boundary dropdown is limited to 00:00–08:00');
    check(!settingsSrc.includes('addSlider((slider)'), 'day boundary no longer shows a duplicate raw slider value');
    check(settingsSrc.includes('getBoundaryExampleTime'), 'day boundary examples are computed from the selected hour');
    check(settingsSrc.includes('refreshQuestionLimitBadges'), 'question Pro badges refresh immediately after enable toggles');
    check(!zhSrc.includes('Pro 中生效') && zhSrc.includes('Pro 生效中') && zhSrc.includes('需 Pro'), 'review question badges distinguish Pro active vs Pro required');
    check(settingsSrc.includes('saveSettingsPreservingScroll'), 'rerenders preserve current scroll position');
    check(!settingsSrc.includes('renderInlineTestConnection'), 'AI test-connection UI is removed (AI is now provided by TideLog)');
    const settingsOrder = [
        'this.renderProLicense(containerEl)',
        'this.renderGettingStarted(containerEl)',
        'this.renderEveningQuestions(containerEl)',
        'this.renderFolderSettings(containerEl)',
        'this.renderDayBoundarySetting(containerEl)',
        'this.renderLegacyImportEntry(containerEl)',
        'this.renderLanguageSetting(containerEl)',
    ].map(snippet => settingsSrc.indexOf(snippet));
    check(settingsOrder.every(index => index >= 0) && settingsOrder.every((index, i, arr) => i === 0 || arr[i - 1] < index), 'settings sections prioritize plan and quick guide before Daily Review, files/dates, import, and language');
    check(!settingsSrc.includes('renderAISetupGuide') && !settingsSrc.includes('tl-ai-config-fields'), 'AI provider/key/model configuration UI is removed');
    check(!settingsSrc.includes('renderAISettings') && !settingsSrc.includes('tl-ai-managed-card'), 'static managed-AI card is removed from Settings');
    check(!settingsSrc.includes("t('settings.aiProvider')"), 'AI provider picker no longer exists');
    check(settingsSrc.includes("createEl('details', { cls: 'tl-settings-quick-guide' })") && settingsSrc.includes('quickGuideSeen'), 'getting started is a first-open, then-collapsed product guide');
    check(!settingsSrc.includes('aiSetupUseSiliconFlow') && !settingsSrc.includes('aiSetupOpenSiliconFlow'), 'API setup removes redundant example preset buttons');
    check(DEFAULT_SETTINGS.activeProvider === 'siliconflow' && DEFAULT_SETTINGS.providers.siliconflow.model === 'deepseek-ai/DeepSeek-V3.2' && DEFAULT_SETTINGS.providers.siliconflow.baseUrl === 'https://api.siliconflow.cn/v1', 'new users start from the current SiliconFlow base URL and model');
    check(DEFAULT_SETTINGS.providers.custom.baseUrl === 'https://api.siliconflow.cn/v1' && migrationSrc.includes("version: 3") && migrationSrc.includes("https://api.siliconflow.cn/v1"), 'custom-compatible API Base URL defaults and migrates to SiliconFlow');
    check(migrationSrc.includes("deepseek-ai/DeepSeek-V3.2-Exp") && migrationSrc.includes("deepseek-ai/DeepSeek-V3.2"), 'settings migration upgrades old SiliconFlow V3.2 Exp model IDs');
    check(migrationSrc.includes('updateInactiveProviderDefault') && migrationSrc.includes('gpt-5.4-mini'), 'settings migration refreshes inactive stale provider defaults without overriding the active provider');
    check(!zhSrc.includes('AI 由 TideLog 提供，无需配置') && !zhSrc.includes('粘贴 API Key') && !zhSrc.includes('测试连接'), 'Chinese settings copy removes both managed-AI marketing and provider/key/test controls');
    check(!zhSrc.includes('大陆用户建议') && !enSrc.includes('mainland China users'), 'AI setup guide no longer makes a direct region-based recommendation');
    check(!enSrc.includes('Paste API key') && !enSrc.includes('Test connection'), 'English settings copy drops the provider/key/test flow');
    check(!settingsSrc.includes('tl-ai-setup-meta') && !cssSrc.includes('tl-ai-setup-pill'), 'AI setup guide no longer renders extra bottom hint tags');
    check(!zhSrc.includes('settings.aiSetupMeta') && !enSrc.includes('settings.aiSetupMeta'), 'AI setup guide copy removes redundant bottom hint tag strings');
    check(cssSrc.includes('tl-ai-setup-guide') && cssSrc.includes('tl-ai-setup-flow-number') && cssSrc.includes('tl-ai-config-fields') && cssSrc.includes('tl-ai-help-card'), 'AI setup guide has dedicated compact visual hierarchy styles');
    check(!settingsSrc.includes('manageDevicesBtn'), 'settings no longer shows a device-management CTA after activation');
    check(!zhSrc.includes('管理设备绑定') && !enSrc.includes('Manage device bindings'), 'device-management copy is removed from settings strings');
    check(cssSrc.includes('tl-settings-hero-compact'), 'settings uses a compact branded header');
    check(!settingsSrc.includes('tl-settings-workflow-card') && !zhSrc.includes('新版工作流') && !enSrc.includes('New workflow'), 'settings page merges workflow explanation into quick start instead of a separate new-workflow card');
    check(zhSrc.includes('重新查看新手引导') && enSrc.includes('Review getting started'), 'settings provides a permanent way to reopen onboarding');
    check(zhSrc.includes('计划 → 复盘 → 洞察 → 下一步计划') && settingsSrc.includes('settings.quickGuideInsightsAI'), 'settings explains the full Plan, Review, Insights, and next-plan loop');
    check(zhSrc.includes('今天该聚焦什么、计划是否现实') && zhSrc.includes('下一日／周／月建议'), 'Plan guide states the current assessment and post-review value in user language');
    check(zhSrc.includes('不只总结你写了什么') && zhSrc.includes('进展、卡点和情绪') && !zhSrc.includes('对照原计划追问偏差'), 'Review guide describes the implemented feedback in user language without unsupported follow-up claims');
    check(zhSrc.includes('反复出现的模式') && zhSrc.includes('用证据告诉你') && zhSrc.includes('下一步该怎么调'), 'Insights guide describes evidence-bound value in user language');
    check(settingsSrc.includes("stepEl.addClass(`is-${phase}`)") && cssSrc.includes('.tl-settings-quick-guide-step.is-plan') && cssSrc.includes('.tl-settings-quick-guide-step.is-review') && cssSrc.includes('.tl-settings-quick-guide-step.is-insights'), 'Plan, Review, and Insights use distinct points on the brand gradient');
    check(onboardingSrc.includes('renderNoJournalStep') && onboardingSrc.includes("startTodayFlow('evening')"), 'no-journal onboarding explains the loop and supports both Plan and Review');
    check(onboardingSrc.includes('app?.setting?.close?.()'), 'onboarding closes Settings before revealing a selected TideLog flow');
    check(zhSrc.includes("'settings.sectionFolders': '文件与日期'") && zhSrc.includes("'settings.sectionPro': '当前方案'"), 'settings section names reflect user tasks instead of internal product taxonomy');
    check(settingsSrc.includes('VaultFolderSuggestModal') && settingsSrc.includes('renderFolderPickerSetting'), 'folder settings use a vault folder picker');
    check(!settingsSrc.includes('.addText((text)'), 'folder settings no longer require manual path typing');
    check(zhSrc.includes('settings.enableMorning') && zhSrc.includes('启用计划流程'), 'settings old Morning switch copy is renamed to the plan flow');
    check(zhSrc.includes('settings.enableEvening') && zhSrc.includes('启用复盘流程'), 'settings old Evening switch copy is renamed to the review flow');
    check(!settingsSrc.includes('proFeatureDashboard') && !zhSrc.includes('settings.proFeatureDashboard') && !enSrc.includes('settings.proFeatureDashboard'), 'settings Pro copy no longer uses old dashboard feature wording');
    check(!zhSrc.includes('解锁完整晚间复盘、AI 洞察报告、仪表盘') && !enSrc.includes('dashboard, and more'), 'settings purchase copy avoids old dashboard wording');
    check(!publicProductCopy.includes('Morning Plan') && !publicProductCopy.includes('Evening Review'), 'public product copy no longer uses old Morning Plan / Evening Review labels');
    check(!publicProductCopy.includes('Four product surfaces') && !publicProductCopy.includes('Dashboard, Calendar heatmap, and Kanban'), 'public product assets no longer present old four-surface dashboard positioning');
    check(!publicProductCopy.includes('完整 5+4') && !publicProductCopy.includes('完整晚间复盘'), 'public Pro copy no longer markets the old 5+4 evening-review packaging');
    check(publicProductCopy.includes('AI 眼中的你') && publicProductCopy.includes('报告预览'), 'public product copy mentions AI profile and report preview');
    check(settingsSrc.includes('LicenseActivationModal') && !settingsSrc.includes('tl-settings-license-details'), 'activation code input opens in a focused modal from the plan actions');
    check(zhSrc.includes("'settings.heroTitle': 'TideLog 设置'") && enSrc.includes("'settings.heroTitle': 'TideLog settings'"), 'settings hero identifies the control surface directly');
    check(zhSrc.includes('让每天的计划和复盘，变成更懂你的下一步。'), 'settings hero uses the product slogan instead of an administrative description');
    check(zhSrc.includes("'settings.openGettingStarted': '重新查看新手引导'") && enSrc.includes("'settings.openGettingStarted': 'Review getting started'"), 'getting-started action clearly reopens the guide');
    check(!settingsSrc.includes('settings.gettingStartedDesc') && !zhSrc.includes('错过或关闭引导时'), 'redundant copy before reopening onboarding is removed');
    check(settingsSrc.includes('question.custom === true'), 'built-in review questions cannot be deleted');
    check(!onboardingSrc.includes('tl-onboarding-pro-link') && !onboardingSrc.includes('renderProPurchaseGuidance'), 'onboarding carries no purchase CTA');
    check(cssSrc.includes('tl-pro-trial-promises'), 'the four trial promises are styled at the paywall, where they now live');
    check(settingsSrc.includes('reviewProRequiredNotice'), 'free users get a Pro requirement notice when enabling extra review questions');
    check(!onboardingSrc.includes('tl-onboarding-method-grid'), 'the duplicated method cards are gone from onboarding');
    check(cssSrc.includes('color: #071417') || cssSrc.includes('color: #0B1B1F'), 'settings hero copy uses dark readable text on the light hero background');
    // 一屏读完，不再强制常驻滚动条；极小视口下仍可按需滚动。
    const onboardingRule = cssSrc.slice(
        cssSrc.indexOf('.tl-onboarding-modal:not(.tl-unused-scope) {'),
    ).split('}')[0];
    check(!onboardingRule.includes('overflow-y: scroll'), 'the onboarding modal no longer forces an always-on scrollbar');
    check(!onboardingRule.includes('scrollbar-gutter'), 'the onboarding modal no longer reserves scrollbar gutter space');
    check(cssSrc.includes('tl-onboarding-folder-guess-hint'), 'the folder guess hint is styled');
    check(cssSrc.includes('.tl-settings-logo-mark::before') && cssSrc.includes('box-shadow:') && cssSrc.includes('tl-settings-logo-line'), 'settings logo uses the current note-lines plus tide-curve visual language');
    check(cssSrc.includes('.tl-settings-boundary-note') && cssSrc.includes('font-weight: 500'), 'day boundary helper note is visually demoted');
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
try { fs.unlinkSync(mockPath); } catch {}
try { fs.unlinkSync(entryPath); } catch {}
process.exit(fail === 0 ? 0 : 1);
