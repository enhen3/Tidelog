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
HTMLElement.prototype.setCssProps = function (props) {
    for (const [k, v] of Object.entries(props)) this.style.setProperty(k, String(v));
};
HTMLElement.prototype.empty = function () { while (this.firstChild) this.removeChild(this.firstChild); };
// createSpan also needs to be available on document for activeDocument.createSpan() / createEl() calls
document.createSpan = (o) => { const e = document.createElement('span'); applyOptions(e, o); return e; };
document.createDiv = (o) => { const e = document.createElement('div'); applyOptions(e, o); return e; };
const _origCreateEl = document.createEl;
document.createEl = (tag, o) => { const e = document.createElement(tag); applyOptions(e, o); return e; };

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
module.exports = {
    App: class {},
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
export { getDefaultEveningQuestions, DEFAULT_SETTINGS } from ${JSON.stringify(path.join(__dirname, 'src/constants.ts'))};
`;
const entryPath = path.join(__dirname, '.test-ui-entry.ts');
fs.writeFileSync(entryPath, entrySrc);
const { TideLogSettingTab, getDefaultEveningQuestions, DEFAULT_SETTINGS } = await bundle(entryPath);

// ---------------------------------------------------------------------------
// Test framework
// ---------------------------------------------------------------------------
let pass = 0, fail = 0;
function check(cond, label) {
    if (cond) { console.log(`  PASS  ${label}`); pass++; }
    else { console.log(`  FAIL  ${label}`); fail++; }
}

// Build a plugin stub
function makePlugin(eveningQuestions) {
    return {
        settings: { ...DEFAULT_SETTINGS, eveningQuestions },
        saveSettings: async () => {},
        licenseManager: {
            isPro: () => true,
            getPurchaseUrl: () => '',
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

// Test 2b: clicking the triangle still works and toggle clicks do NOT expand/collapse
console.log('\nTest 2b: triangle opens, enable toggle does not open details');
{
    const questions = getDefaultEveningQuestions();
    const plugin = makePlugin(questions);
    const tab = new TideLogSettingTab({}, plugin);
    tab.display();

    const firstRow = tab.containerEl.querySelector('.tl-q-row');
    click(firstRow.querySelector('.tl-q-triangle'));
    check(firstRow.nextElementSibling?.classList.contains('tl-q-detail') === true, 'triangle click opens detail panel');

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

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
try { fs.unlinkSync(mockPath); } catch {}
try { fs.unlinkSync(entryPath); } catch {}
process.exit(fail === 0 ? 0 : 1);
