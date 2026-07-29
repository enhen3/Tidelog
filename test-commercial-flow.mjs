/**
 * Commercial-flow regression tests.
 *
 * Covers the paid-product paths that are easy to miss with generic UI tests:
 *   - License API 4xx business errors must surface as business errors, not as
 *     misleading network failures.
 *   - Transient 5xx responses are retried.
 *   - Standalone Kanban view is Pro-gated to match the public feature table.
 */

import path from 'path';
import url from 'url';
import fs from 'fs';
import esbuild from 'esbuild';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';
import { webcrypto } from 'node:crypto';

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
if (!globalThis.crypto) {
    Object.defineProperty(globalThis, 'crypto', {
        value: webcrypto,
        configurable: true,
    });
}

const realSetTimeout = setTimeout;
window.setTimeout = (fn, _ms) => realSetTimeout(fn, 0);

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
HTMLElement.prototype.addClass = function (...classes) { this.classList.add(...classes); };
HTMLElement.prototype.removeClass = function (...classes) { this.classList.remove(...classes); };
HTMLElement.prototype.hasClass = function (className) { return this.classList.contains(className); };
HTMLElement.prototype.setText = function (text) { this.textContent = String(text); };
HTMLElement.prototype.setAttr = function (name, value) { this.setAttribute(name, String(value)); };
HTMLElement.prototype.setCssProps = function (props) {
    for (const [key, value] of Object.entries(props)) {
        this.style.setProperty(key, String(value));
    }
};
HTMLElement.prototype.empty = function () {
    while (this.firstChild) this.removeChild(this.firstChild);
};

const mockPath = path.join(__dirname, 'obsidian-mock-commercial.cjs');
fs.writeFileSync(
    mockPath,
    `
class ItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.app = leaf?.app || {};
    this.contentEl = activeDocument.createElement('div');
  }
}
function makeMoment() {
  return {
    add() { return this; },
    subtract() { return this; },
    startOf() { return this; },
    endOf() { return this; },
    clone() { return makeMoment(); },
    format() { return '2026-W20'; },
    toDate() { return new Date('2026-05-17T00:00:00Z'); },
  };
}
module.exports = {
  ItemView,
  WorkspaceLeaf: class {},
  TFile: class {},
  Notice: class { constructor() {} },
  Modal: class { constructor(app) { this.app = app; this.contentEl = activeDocument.createElement('div'); } },
  PluginSettingTab: class {},
  Setting: class {},
  Platform: { isMobile: false },
  MarkdownRenderer: { render: async () => {} },
  addIcon: () => {},
  setIcon: () => {},
  Plugin: class {},
  normalizePath: (value) => value,
  requestUrl: (...args) => globalThis.__requestUrl(...args),
  moment: makeMoment,
};
`,
);

const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
    if (req === 'obsidian') return mockPath;
    return origResolve.call(this, req, parent, ...rest);
};

const entryPath = path.join(__dirname, '.test-commercial-entry.ts');
fs.writeFileSync(
    entryPath,
    `
export { LicenseManager } from ${JSON.stringify(path.join(__dirname, 'src/services/license-manager.ts'))};
export { KanbanView } from ${JSON.stringify(path.join(__dirname, 'src/views/kanban-view.ts'))};
export { ProModal } from ${JSON.stringify(path.join(__dirname, 'src/views/pro-modal.ts'))};
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
const { LicenseManager, KanbanView, ProModal } = moduleObj.exports;

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

function makeLicensePlugin() {
    return {
        settings: {
            proLicense: { key: '', activated: false },
            trial: {},
            language: 'zh',
        },
        app: { vault: { getName: () => 'Commercial Flow Test Vault' } },
        saveSettings: async () => {},
        hasConfiguredAI: () => true,
    };
}

console.log('\n=== Commercial flow regression tests ===\n');

console.log('Test 1: invalid license surfaces business error');
{
    const calls = [];
    globalThis.__requestUrl = async (options) => {
        calls.push(options);
        return {
            status: 404,
            json: { success: false, error: 'Invalid license key' },
            text: '{"success":false,"error":"Invalid license key"}',
        };
    };

    const manager = new LicenseManager(makeLicensePlugin());
    const result = await manager.activate('TL-INVALID-0000-0000');

    check(calls[0]?.throw === false, 'license API requests opt out of HTTP 4xx throwing');
    check(result.success === false, 'activation fails');
    check(result.message === 'Invalid license key', 'user sees server business error');
}

console.log('\nTest 2: transient license server 5xx is retried');
{
    let callCount = 0;
    globalThis.__requestUrl = async () => {
        callCount++;
        if (callCount === 1) {
            return {
                status: 500,
                json: { success: false, error: 'Internal server error' },
                text: '{"success":false,"error":"Internal server error"}',
            };
        }
        return {
            status: 200,
            json: { success: true, licenseType: 'lifetime', message: 'License activated successfully' },
            text: '{"success":true}',
        };
    };

    const manager = new LicenseManager(makeLicensePlugin());
    const result = await manager.activate('TL-VALID-0000-0000');

    check(callCount === 2, 'one retry is attempted after 5xx');
    check(result.success === true, 'activation succeeds after retry');
}

console.log('\nTest 3: one-time trial unlocks Pro and expires after seven days');
{
    let saveCount = 0;
    const plugin = makeLicensePlugin();
    plugin.saveSettings = async () => { saveCount++; };
    const manager = new LicenseManager(plugin);

    check(manager.isTrialEligible() === true, 'new users are eligible before starting');
    check(await manager.startTrial() === true, 'configured users can start the trial');
    check(manager.getAccessState() === 'trial', 'started trial becomes the current access state');
    check(manager.isPro() === true, 'active trial unlocks existing Pro gates');
    check(manager.getTrialDaysRemaining() === 7, 'new trial reports seven days remaining');
    check(saveCount === 1, 'trial timestamps are persisted');
    check(await manager.startTrial() === false, 'trial cannot be started twice');
    await manager.markTrialOfferShown();
    await manager.markTrialOfferShown();
    check(saveCount === 2, 'contextual trial offer is persisted only once');

    plugin.settings.trial.expiresAt = Date.now() - 1;
    check(manager.getAccessState() === 'trial-expired', 'expired trial has a distinct state');
    check(manager.isPro() === false, 'expired trial no longer unlocks Pro');
    check(manager.isTrialEligible() === false, 'expired trial cannot be restarted');

    const needsAiPlugin = makeLicensePlugin();
    needsAiPlugin.hasConfiguredAI = () => false;
    const needsAiManager = new LicenseManager(needsAiPlugin);
    check(needsAiManager.needsAISetupForTrial() === true, 'trial protects users from starting before AI setup');
    check(await needsAiManager.startTrial() === false, 'missing AI configuration does not consume the trial');

    const paidPlugin = makeLicensePlugin();
    paidPlugin.settings.proLicense = {
        key: 'TL-PAID',
        activated: true,
        activatedAt: Date.now(),
        lastVerified: Date.now(),
        licenseType: 'lifetime',
    };
    paidPlugin.settings.trial = {
        startedAt: Date.now(),
        expiresAt: Date.now() + 1000,
    };
    const paidManager = new LicenseManager(paidPlugin);
    check(paidManager.getAccessState() === 'paid', 'paid license takes precedence over trial state');

    const inactiveLicensePlugin = makeLicensePlugin();
    inactiveLicensePlugin.settings.proLicense = {
        key: 'TL-EXPIRED',
        activated: true,
        activatedAt: Date.now() - 1000,
        licenseType: 'annual',
        expiresAt: Date.now() - 1,
    };
    const inactiveLicenseManager = new LicenseManager(inactiveLicensePlugin);
    check(inactiveLicenseManager.getAccessState() === 'license-inactive', 'expired paid access is not presented as a fresh trial');
    check(inactiveLicenseManager.isTrialEligible() === false, 'previously paid users cannot consume a new-user trial');
}

console.log('\nTest 4: free users see standalone Kanban trial entry');
{
    const plugin = {
        settings: {
            planFolder: '02-Plan',
            dailyFolder: '01-Daily',
            archiveFolder: '03-Archive',
        },
        licenseManager: {
            isPro: () => false,
            getAccessState: () => 'free',
            getPurchaseUrl: () => 'https://afdian.com/item/463307362c2f11f1b39d52540025c377',
        },
    };

    const view = new KanbanView({ app: {} }, plugin);
    await view.onOpen();

    const locked = view.contentEl.querySelector('.tl-pro-locked-view');
    const button = view.contentEl.querySelector('button.tl-pro-cta-btn');

    check(!!locked, 'Kanban view renders a Pro lock for free users');
    check(button?.textContent?.includes('7 天'), 'Kanban lock leads with the seven-day trial');
}

console.log('\nTest 5: eligible Pro modal leads with trial and no automatic charge');
{
    const licenseManager = {
        getAccessState: () => 'free',
        needsAISetupForTrial: () => false,
        getTrialDaysRemaining: () => 0,
        startTrial: async () => true,
        getPurchaseUrl: () => 'https://afdian.com/item/463307362c2f11f1b39d52540025c377',
    };
    const modal = new ProModal({}, 'Commercial Flow Test Feature', licenseManager);
    modal.onOpen();

    const text = modal.contentEl.textContent || '';
    const startButton = modal.contentEl.querySelector('button.tl-pro-cta-cn');

    check(startButton?.textContent?.includes('7 天'), 'trial is the primary CTA');
    check(text.includes('无需绑定支付方式'), 'trial explains that no payment method is required');
    check(text.includes('不会自动续费'), 'trial explains that it does not auto-renew');
}

console.log('\nTest 6: expired-trial modal explains Afdian sign-in purchase friction');
{
    const licenseManager = {
        getAccessState: () => 'trial-expired',
        needsAISetupForTrial: () => false,
        getTrialDaysRemaining: () => 0,
        getPurchaseUrl: () => 'https://afdian.com/item/463307362c2f11f1b39d52540025c377',
    };
    const modal = new ProModal({}, 'Commercial Flow Test Feature', licenseManager);
    modal.onOpen();

    const text = modal.contentEl.textContent || '';
    const buyLink = modal.contentEl.querySelector('a.tl-pro-cta-btn');

    check(text.includes('需要登录/注册爱发电'), 'Pro modal states Afdian account sign-in is required');
    check(text.includes('购买后自动收到 License Key'), 'Pro modal states the License Key is sent automatically after purchase');
    check(text.includes('页面空白'), 'Pro modal explains the blank Afdian page recovery path');
    check(
        buyLink?.textContent?.trim() === '🛒 前往爱发电购买 Pro',
        'Pro modal keeps the purchase CTA concise while opening Afdian',
    );
    check(
        buyLink?.getAttribute('href') === licenseManager.getPurchaseUrl(),
        'Pro modal purchase CTA still links to the Afdian purchase URL',
    );
}

const total = pass + fail;
console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
if (total === 0) process.exit(1);
