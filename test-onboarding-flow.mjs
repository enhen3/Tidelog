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

function makePlugin({ hasConfiguredAI = true } = {}) {
    const calls = { complete: 0, activate: [], firstInsight: 0, settingsOpen: 0, settingsTab: [] };
    const plugin = {
        __calls: calls,
        app: {
            setting: {
                open: () => { calls.settingsOpen++; },
                openTabById: (id) => { calls.settingsTab.push(id); },
            },
        },
        manifest: { id: 'tidelog' },
        licenseManager: { getPurchaseUrl: () => 'https://example.com' },
        completeOnboarding: async () => { calls.complete++; },
        activateChatView: async (sopType) => { calls.activate.push(sopType); },
        openFirstInsight: async () => { calls.firstInsight++; },
        hasConfiguredAI: () => hasConfiguredAI,
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

    const secondary = modal.contentEl.querySelector('.tl-onboarding-buttons .tl-onboarding-secondary');
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

    const secondary = modal.contentEl.querySelector('.tl-onboarding-buttons .tl-onboarding-secondary');
    check(secondary?.textContent === 'Start daily review', 'English secondary CTA is review-oriented', `actual: ${JSON.stringify(secondary?.textContent)}`);
    check(!modal.contentEl.textContent.includes('Start morning plan'), 'English onboarding copy has no morning-plan CTA');
}

console.log('\nTest 3: onboarding is a scrollable long guide, not a dead one-screen card');
{
    setLanguage('zh');
    const plugin = makePlugin();
    const modal = new OnboardingModal(plugin.app, plugin);
    modal.onOpen();

    check(!modal.contentEl.querySelector('.tl-onboarding-scroll-hint'), 'clumsy text scroll hint is not rendered');
    check(!modal.contentEl.textContent.includes('继续下滑'), 'onboarding does not use direct scroll-instruction copy');
    check(modal.contentEl.querySelectorAll('.tl-onboarding-detail-list .tl-onboarding-detail-item').length === 3, 'detailed plan/review/insights usage sections render');
    check(modal.contentEl.textContent.includes('记录很多，行动没变'), 'onboarding names the concrete pain, not only features');
    check(modal.contentEl.textContent.includes('你的日记和个人信息都保留在本地 vault'), 'onboarding reassures users about local privacy');
    check(modal.contentEl.textContent.includes('计划') && modal.contentEl.textContent.includes('复盘') && modal.contentEl.textContent.includes('洞察'), 'Chinese onboarding uses Chinese surface names');
    check(!modal.contentEl.textContent.includes('Plan') && !modal.contentEl.textContent.includes('Review') && !modal.contentEl.textContent.includes('Insights'), 'Chinese onboarding avoids English surface names');
}

console.log('\nTest 4: onboarding exposes the first insight path without replacing review');
{
    setLanguage('zh');
    const plugin = makePlugin({ hasConfiguredAI: true });
    const modal = new OnboardingModal(plugin.app, plugin);
    modal.onOpen();

    const firstInsight = modal.contentEl.querySelector('.tl-onboarding-first-insight');
    check(firstInsight?.textContent === '从旧日记生成画像', 'configured onboarding CTA starts the old-journal profile path', `actual: ${JSON.stringify(firstInsight?.textContent)}`);
    check(modal.contentEl.textContent.includes('API 已经配置好'), 'configured onboarding copy says the report can start now');
    firstInsight?.dispatchEvent(new dom.window.Event('click'));
    await Promise.resolve();
    check(plugin.__calls.firstInsight === 1, 'first insight CTA opens the first insight modal');
    check(plugin.__calls.activate.length === 0, 'first insight CTA does not start daily review');
}

console.log('\nTest 5: onboarding first insight path guides API setup before AI is configured');
{
    setLanguage('zh');
    const plugin = makePlugin({ hasConfiguredAI: false });
    const modal = new OnboardingModal(plugin.app, plugin);
    modal.onOpen();

    const firstInsight = modal.contentEl.querySelector('.tl-onboarding-first-insight');
    check(firstInsight?.textContent === '先配置 API', 'unconfigured onboarding CTA points to API setup', `actual: ${JSON.stringify(firstInsight?.textContent)}`);
    check(modal.contentEl.textContent.includes('旧日记画像需要 AI 生成'), 'unconfigured onboarding copy explains why API is needed');
    firstInsight?.dispatchEvent(new dom.window.Event('click'));
    await Promise.resolve();
    check(plugin.__calls.firstInsight === 0, 'unconfigured onboarding CTA does not open generation modal');
    check(plugin.__calls.settingsOpen === 1 && plugin.__calls.settingsTab[0] === 'tidelog', 'unconfigured onboarding CTA opens plugin settings');
}

console.log('\nTest 6: onboarding CSS enables internal scrolling with a visible scrollbar');
{
    const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
    check(css.includes('max-height: min(760px, calc(100vh - 96px));'), 'onboarding modal has viewport max-height');
    check(css.includes('overflow-y: scroll;'), 'onboarding modal reserves a visible vertical scrollbar');
    check(css.includes('::-webkit-scrollbar-thumb'), 'onboarding modal styles a visible scrollbar thumb');
    check(!css.includes('.tl-onboarding-modal:not(.tl-unused-scope) {\n\tposition: relative;\n\tpadding: 28px 30px 24px;\n\ttext-align: left;\n\toverflow: hidden;'), 'old overflow-hidden onboarding rule is gone');
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
try { fs.unlinkSync(mockPath); } catch {}
try { fs.unlinkSync(entryPath); } catch {}
process.exit(fail === 0 ? 0 : 1);
