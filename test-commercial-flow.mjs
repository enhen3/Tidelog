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
const purchaseEntrySources = [
    'src/views/pro-modal.ts',
    'src/views/insights-renderer.ts',
    'src/settings/settings-tab.ts',
].map((relativePath) => ({
    relativePath,
    content: fs.readFileSync(path.join(__dirname, relativePath), 'utf8'),
}));

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
const openedPurchaseUrls = [];
window.open = (purchaseUrl) => {
    openedPurchaseUrls.push(String(purchaseUrl));
    return null;
};
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
    const purchaseUrl = new URL(manager.getPurchaseUrl());
    check(
        purchaseUrl.pathname === '/item/463307362c2f11f1b39d52540025c377',
        'purchase entry keeps the canonical TideLog item URL instead of relying on Afdian login return parameters',
    );
    check(
        purchaseEntrySources.every(({ content }) => content.includes('bindAfdianPurchaseFlow')),
        'every in-app Pro purchase entry keeps the one-click post-login retry',
        purchaseEntrySources.filter(({ content }) => !content.includes('bindAfdianPurchaseFlow'))
            .map(({ relativePath }) => relativePath).join(', '),
    );
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

console.log('\nTest 2b: device identity survives plugin data deletion and new vaults');
{
    window.localStorage.clear();
    const firstPlugin = makeLicensePlugin();
    firstPlugin.app.vault.getName = () => 'First Vault';
    const firstManager = new LicenseManager(firstPlugin);
    const firstId = firstManager.getOrCreateDeviceId();
    await Promise.resolve();

    const reinstalledPlugin = makeLicensePlugin();
    reinstalledPlugin.app.vault.getName = () => 'Completely Different Vault';
    const reinstalledManager = new LicenseManager(reinstalledPlugin);
    const recoveredId = reinstalledManager.getOrCreateDeviceId();

    check(/^dev-[a-z0-9]+-[a-f0-9]{8}$/.test(firstId), 'generated device identity has the expected format');
    check(recoveredId === firstId, 'clearing plugin settings does not reset trial/profile identity');
    check(reinstalledPlugin.settings.proLicense.deviceId === firstId, 'a new vault reuses the installation identity instead of granting a new trial');
    window.localStorage.clear();
}

console.log('\nTest 2c: explicit server revocation bypasses offline grace');
{
    const revokedPlugin = makeLicensePlugin();
    revokedPlugin.settings.proLicense = {
        key: 'TL-REVOKED',
        activated: true,
        deviceId: 'dev-revoked-deadbeef',
        lastVerified: Date.now(),
        licenseType: 'lifetime',
    };
    globalThis.__requestUrl = async () => ({
        status: 200,
        json: { success: false, valid: false, error: 'License revoked' },
        text: '{"success":false,"valid":false}',
    });
    const revokedManager = new LicenseManager(revokedPlugin);
    await revokedManager.verifyOnStartup();
    check(revokedPlugin.settings.proLicense.activated === false, 'server-declared invalid license is disabled immediately');

    const offlinePlugin = makeLicensePlugin();
    offlinePlugin.settings.proLicense = {
        key: 'TL-OFFLINE',
        activated: true,
        deviceId: 'dev-offline-cafebabe',
        lastVerified: Date.now(),
        licenseType: 'lifetime',
    };
    globalThis.__requestUrl = async () => { throw new Error('offline'); };
    const offlineManager = new LicenseManager(offlinePlugin);
    await offlineManager.verifyOnStartup();
    check(offlinePlugin.settings.proLicense.activated === true, 'network failure still keeps the offline grace state');
}

console.log('\nTest 3: one-time trial unlocks Pro and expires after seven days');
{
    let saveCount = 0;
    let trialStartCalls = 0;
    const serverStartedAt = Math.floor(Date.now() / 1000);
    const serverExpiresAt = serverStartedAt + 7 * 24 * 60 * 60;
    globalThis.__requestUrl = async (options) => {
        trialStartCalls++;
        return {
            status: 200,
            json: {
                success: true,
                state: 'active',
                started_at: serverStartedAt,
                expires_at: serverExpiresAt,
                newly_started: trialStartCalls === 1,
            },
            text: '{"success":true,"state":"active"}',
        };
    };
    const plugin = makeLicensePlugin();
    plugin.saveSettings = async () => { saveCount++; };
    const manager = new LicenseManager(plugin);

    check(manager.isTrialEligible() === true, 'new users are eligible before starting');
    check(await manager.startTrial() === true, 'configured users can start the trial');
    check(manager.getAccessState() === 'trial', 'started trial becomes the current access state');
    check(manager.isPro() === true, 'active trial unlocks existing Pro gates');
    check(manager.getTrialDaysRemaining() === 7, 'new trial reports seven days remaining');
    check(saveCount === 2, 'device identity is saved before the server window is cached');
    check(plugin.settings.trial.startedAt === serverStartedAt * 1000, 'client uses server start time instead of Date.now()');
    check(trialStartCalls === 1, 'click calls the dedicated trial endpoint once');
    check(await manager.startTrial() === false, 'trial cannot be started twice');
    check(trialStartCalls === 1, 'local second click does not issue another start request');
    await manager.markTrialOfferShown();
    await manager.markTrialOfferShown();
    check(saveCount === 3, 'contextual trial offer is persisted only once');

    plugin.settings.trial.expiresAt = Date.now() - 1;
    check(manager.getAccessState() === 'trial-expired', 'expired trial has a distinct state');
    check(manager.isPro() === false, 'expired trial no longer unlocks Pro');
    check(manager.isTrialEligible() === false, 'expired trial cannot be restarted');

    // 自 1.2 起 AI 由 TideLog 服务端统一提供，试用不再以「用户已配置 AI」为前提。
    const noAiPlugin = makeLicensePlugin();
    noAiPlugin.hasConfiguredAI = () => false;
    const noAiManager = new LicenseManager(noAiPlugin);
    check(noAiManager.needsAISetupForTrial() === false, 'trial no longer requires user AI setup');
    check(await noAiManager.startTrial() === true, 'trial starts without any user AI configuration');

    const expiredServerPlugin = makeLicensePlugin();
    globalThis.__requestUrl = async () => ({
        status: 409,
        json: {
            error: 'trial_already_used',
            state: 'expired',
            started_at: serverStartedAt - 8 * 24 * 60 * 60,
            expires_at: serverStartedAt - 24 * 60 * 60,
            newly_started: false,
        },
        text: '{"error":"trial_already_used","state":"expired"}',
    });
    const expiredServerManager = new LicenseManager(expiredServerPlugin);
    check(await expiredServerManager.startTrial() === false, 'server-expired trial cannot be restarted');
    check(expiredServerManager.getAccessState() === 'trial-expired', 'server expiry is cached and immediately changes access state');

    const syncedPlugin = makeLicensePlugin();
    globalThis.__requestUrl = async () => ({
        status: 200,
        json: {
            state: 'active',
            started_at: serverStartedAt,
            expires_at: serverExpiresAt,
            newly_started: false,
        },
        text: '{"state":"active"}',
    });
    const syncedManager = new LicenseManager(syncedPlugin);
    check(await syncedManager.syncTrialState() === true, 'startup sync restores a server trial after local state is missing');
    check(syncedManager.getAccessState() === 'trial', 'restored server trial unlocks local Pro gates');

    const legacyPlugin = makeLicensePlugin();
    const legacyStartedAt = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const legacyExpiresAt = legacyStartedAt + 7 * 24 * 60 * 60 * 1000;
    legacyPlugin.settings.trial = { startedAt: legacyStartedAt, expiresAt: legacyExpiresAt };
    const legacyCalls = [];
    globalThis.__requestUrl = async (options) => {
        legacyCalls.push(options);
        if (options.method === 'GET') {
            return { status: 200, json: { state: 'eligible', started_at: null, expires_at: null }, text: '{}' };
        }
        const body = JSON.parse(options.body);
        return {
            status: 200,
            json: {
                success: true,
                state: 'active',
                started_at: body.legacyStartedAt,
                expires_at: body.legacyExpiresAt,
                newly_started: true,
            },
            text: '{"success":true,"state":"active"}',
        };
    };
    const legacyManager = new LicenseManager(legacyPlugin);
    await legacyManager.syncTrialState();
    const migrationBody = JSON.parse(legacyCalls[1].body);
    check(migrationBody.legacyStartedAt === Math.floor(legacyStartedAt / 1000), '1.1.49 local trial sends its original start time');
    check(migrationBody.legacyExpiresAt === Math.floor(legacyExpiresAt / 1000), '1.1.49 migration preserves the original expiry');

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

    const monthlyPlugin = makeLicensePlugin();
    monthlyPlugin.settings.proLicense = {
        key: 'TL-MONTHLY',
        activated: true,
        activatedAt: Date.now(),
        lastVerified: Date.now(),
        licenseType: 'monthly',
        expiresAt: Date.now() + 2 * 24 * 60 * 60 * 1000,
    };
    const monthlyManager = new LicenseManager(monthlyPlugin);
    check(monthlyManager.hasPaidLicense() === true, 'unexpired monthly license unlocks Pro');
    check(monthlyManager.getLicenseLabel() === 'Pro 月度版', 'monthly license has its own display label');
    check(monthlyManager.getExpiryDate() !== null, 'monthly license displays its expiry date');
    monthlyPlugin.settings.proLicense.expiresAt = Date.now() - 1;
    check(monthlyManager.hasPaidLicense() === false, 'expired monthly license no longer unlocks Pro');
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
    const purchaseButton = modal.contentEl.querySelector('a.tl-pro-cta-purchase');
    const comparison = modal.contentEl.querySelector('.tl-pro-comparison-table');
    const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

    check(!modal.contentEl.querySelector('.tl-pro-modal-desc'), 'free modal removes the redundant subtitle under its title');
    check(startButton?.textContent?.includes('免费开启 7 天 Pro 体验'), 'trial CTA states the free Pro experience directly');
    check(text.includes('无需绑卡'), 'trial explains that no payment method is required');
    check(text.includes('到期自动结束'), 'trial explains that it ends without renewal');
    check(startButton?.querySelector('.tl-pro-cta-subtitle')?.textContent?.includes('无需绑卡'), 'compact trial terms are embedded inside the trial button');
    check(!!comparison && comparison.textContent.includes('免费版') && comparison.textContent.includes('Pro 版'), 'free users see a Free versus Pro comparison table');
    const comparisonRows = [...(comparison?.querySelectorAll('tbody tr') ?? [])];
    const reportsRow = comparisonRows.find(row => row.textContent.includes('周报与月报'));
    const chatRow = comparisonRows.find(row => row.textContent.includes('AI 对话'));
    check(comparison?.textContent?.includes('首次画像 1 次'), 'comparison table names the initial-profile entitlement');
    check(reportsRow?.querySelector('td.is-pro')?.textContent === '✓', 'weekly and monthly reports use a simple checkmark in the Pro column');
    check(chatRow?.querySelector('td.is-pro')?.textContent === '✓' && !comparison?.textContent?.includes('200'), 'AI chat uses a checkmark without foregrounding the quota');
    check(purchaseButton?.textContent?.includes('持续使用完整功能'), 'purchase CTA is written around continued user value');
    check(purchaseButton?.querySelector('.tl-pro-cta-subtitle')?.textContent === '早鸟价：月付 ¥19 · 年付 ¥168', 'early-bird pricing is embedded inside the purchase button');
    check(!text.includes('省 3 个月') && !modal.contentEl.querySelector('.tl-pro-pricing'), 'pricing no longer adds a separate line or savings claim');
    check(css.includes('.tl-pro-cta-purchase') && css.includes('height: 48px'), 'trial and purchase actions share a more compact height while purchase keeps its own visual treatment');
    check(css.includes('color: rgba(36, 42, 42, 0.72)') && !css.includes('rgba(255, 255, 255, 0.82)'), 'both button subtitles share the same non-white color and typography');
    check(text.includes('购买过但找不到激活码') && text.includes('邮箱和订单号'), 'license recovery link explains who it is for and what information it needs');
    check(modal.contentEl.querySelectorAll('.tl-pro-trial-promise').length === 0, 'trial terms are one compact line instead of four paragraphs');
}

console.log('\nTest 5b: active trial modal leads with unlocked value and remaining time');
{
    const expiresAt = Math.floor((Date.now() + 5 * 24 * 60 * 60 * 1000) / 1000);
    globalThis.__requestUrl = async () => ({
        status: 200,
        json: {
            identity: 'trial',
            period: '2026-08',
            trial_state: 'active',
            trial_started_at: expiresAt - 7 * 24 * 60 * 60,
            trial_expires_at: expiresAt,
            features: { chat: { used: 7, limit: 20 } },
        },
        text: '{}',
    });
    const licenseManager = {
        getAccessState: () => 'trial',
        getTrialDaysRemaining: () => 5,
        getOrCreateDeviceId: () => 'dev-trialtest-deadbeef',
        applyTrialServerSnapshot: async () => {},
        getPurchaseUrl: () => 'https://afdian.com/item/463307362c2f11f1b39d52540025c377',
    };
    const modal = new ProModal({}, 'Commercial Flow Test Feature', licenseManager);
    modal.onOpen();
    await new Promise(resolve => realSetTimeout(resolve, 0));

    const text = modal.contentEl.textContent || '';
    const statusCard = modal.contentEl.querySelector('.tl-pro-trial-status-card');
    const purchaseButton = modal.contentEl.querySelector('a.tl-pro-cta-purchase');
    check(text.includes('7 天 Pro 体验进行中'), 'active-trial title states the current state');
    check(statusCard?.textContent?.includes('Pro 功能已全部解锁') && statusCard.textContent.includes('还剩 5 天'), 'active-trial card leads with unlocked value and remaining days');
    check(statusCard?.textContent?.includes('完整复盘') && statusCard.textContent.includes('周报与月报'), 'active-trial card summarizes the unlocked features');
    check(!text.includes('本月还可用') && !text.includes('20'), 'active-trial modal does not foreground AI usage limits');
    check(purchaseButton?.textContent?.includes('体验结束后继续使用'), 'active-trial purchase action explains continued access');
    check(purchaseButton?.textContent?.includes('早鸟价'), 'active-trial purchase action keeps pricing inside the button');
    openedPurchaseUrls.length = 0;
    purchaseButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check(
        openedPurchaseUrls[0] === licenseManager.getPurchaseUrl(),
        'first Pro purchase click opens the canonical TideLog item',
    );
    check(
        purchaseButton?.textContent?.includes('已登录？继续打开购买页'),
        'purchase CTA becomes a clear retry after Afdian sign-in can lose the item route',
    );
    purchaseButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check(
        openedPurchaseUrls.length === 2 && openedPurchaseUrls[1] === licenseManager.getPurchaseUrl(),
        'retry reopens the TideLog item so buyers never need to search Afdian home',
    );
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

    check(text.includes('需要登录或注册爱发电'), 'Pro modal states Afdian account sign-in is required');
    check(text.includes('购买后自动收到激活码'), 'Pro modal explains the activation code in user-facing Chinese');
    check(text.includes('登录后若停在爱发电首页'), 'Pro modal explains the actual Afdian sign-in recovery path');
    check(buyLink?.textContent?.includes('🛒 前往爱发电购买 Pro'), 'Pro modal keeps the purchase action clear while opening Afdian');
    check(buyLink?.textContent?.includes('早鸟价：月付 ¥19 · 年付 ¥168'), 'expired-trial purchase action carries the early-bird price inside the button too');
    check(
        buyLink?.getAttribute('href') === licenseManager.getPurchaseUrl(),
        'Pro modal purchase CTA still links to the Afdian purchase URL',
    );
}

const total = pass + fail;
console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
if (total === 0) process.exit(1);
