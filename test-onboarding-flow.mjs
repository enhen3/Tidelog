/**
 * First-run onboarding regression tests.
 *
 * Bug: a new user entering the Review surface saw onboarding that pushed them
 * into the old morning-plan SOP. Planning is now done manually in Plan; the
 * Review surface is for daily review and insight.
 */
import path from 'path';
import url from 'url';
import fs from 'fs';
import esbuild from 'esbuild';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/',
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.activeDocument = dom.window.document;
globalThis.activeWindow = dom.window;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;

function applyOptions(el, options) {
    if (!options) return;
    if (typeof options === 'string') {
        el.className = options;
        return;
    }
    if (options.cls) {
        if (Array.isArray(options.cls)) el.classList.add(...options.cls);
        else el.classList.add(...String(options.cls).split(/\s+/).filter(Boolean));
    }
    if (options.text !== undefined) el.textContent = String(options.text);
    if (options.href !== undefined) el.setAttribute('href', String(options.href));
    if (options.attr) {
        for (const [key, value] of Object.entries(options.attr)) {
            el.setAttribute(key, String(value));
        }
    }
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
HTMLElement.prototype.addClass = function (...classes) { this.classList.add(...classes); };
HTMLElement.prototype.removeClass = function (...classes) { this.classList.remove(...classes); };
HTMLElement.prototype.setAttr = function (name, value) { this.setAttribute(name, String(value)); };
HTMLElement.prototype.empty = function () {
    while (this.firstChild) this.removeChild(this.firstChild);
};

const mockPath = path.join(__dirname, 'obsidian-mock-onboarding.cjs');
fs.writeFileSync(
    mockPath,
    `
class Modal {
  constructor(app) { this.app = app; this.contentEl = activeDocument.createElement('div'); }
  open() { this.onOpen?.(); }
  close() { this.onClose?.(); }
}
module.exports = {
  App: class {},
  Modal,
};
`,
);

const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
    if (req === 'obsidian') return mockPath;
    return origResolve.call(this, req, parent, ...rest);
};

const entryPath = path.join(__dirname, '.test-onboarding-entry.ts');
fs.writeFileSync(
    entryPath,
    `
export { OnboardingModal } from ${JSON.stringify(path.join(__dirname, 'src/views/onboarding-modal.ts'))};
export { setLanguage } from ${JSON.stringify(path.join(__dirname, 'src/i18n/index.ts'))};
`,
);

const bundle = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    format: 'cjs',
    target: 'es2020',
    external: ['obsidian'],
    platform: 'node',
    logLevel: 'silent',
});

const moduleObj = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(moduleObj, moduleObj.exports, require);
const { OnboardingModal, setLanguage } = moduleObj.exports;

let pass = 0;
let fail = 0;
function check(condition, label, extra = '') {
    if (condition) {
        console.log(`  PASS  ${label}`);
        pass++;
    } else {
        console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ''}`);
        fail++;
    }
}

function makePlugin() {
    const calls = { complete: 0, activate: [] };
    const plugin = {
        __calls: calls,
        app: { setting: { open: () => {}, openTabById: () => {} } },
        manifest: { id: 'tidelog' },
        licenseManager: { getPurchaseUrl: () => 'https://example.com' },
        completeOnboarding: async () => { calls.complete++; },
        activateChatView: async (sopType) => { calls.activate.push(sopType); },
    };
    return plugin;
}

console.log('\n=== First-run onboarding flow tests ===\n');

console.log('Test 1: onboarding no longer pushes Review users into planning');
{
    setLanguage('zh');
    const plugin = makePlugin();
    const modal = new OnboardingModal(plugin.app, plugin);
    modal.onOpen();

    const secondary = modal.contentEl.querySelector('.tl-onboarding-secondary');
    check(secondary?.textContent === '开始每日复盘', 'secondary CTA is review-oriented', `actual: ${JSON.stringify(secondary?.textContent)}`);
    check(!modal.contentEl.textContent.includes('开始晨间计划'), 'onboarding copy has no morning-plan CTA');

    secondary?.dispatchEvent(new dom.window.Event('click'));
    await Promise.resolve();
    check(plugin.__calls.activate[0] === 'evening', 'secondary CTA starts evening review SOP', `actual: ${JSON.stringify(plugin.__calls.activate)}`);
}

console.log('\nTest 2: English CTA is also review-oriented');
{
    setLanguage('en');
    const plugin = makePlugin();
    const modal = new OnboardingModal(plugin.app, plugin);
    modal.onOpen();

    const secondary = modal.contentEl.querySelector('.tl-onboarding-secondary');
    check(secondary?.textContent === 'Start daily review', 'English secondary CTA is review-oriented', `actual: ${JSON.stringify(secondary?.textContent)}`);
    check(!modal.contentEl.textContent.includes('Start morning plan'), 'English onboarding copy has no morning-plan CTA');
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
try { fs.unlinkSync(mockPath); } catch {}
try { fs.unlinkSync(entryPath); } catch {}
process.exit(fail === 0 ? 0 : 1);
