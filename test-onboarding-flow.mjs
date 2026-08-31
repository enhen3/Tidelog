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
  ItemView: class {},
  Notice: class { constructor(){} },
  TFile: class {},
  moment: () => ({ format: () => '' }),
  MarkdownRenderer: { render: async () => {} },
  Component: class {},
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
export { MorningSOP } from ${JSON.stringify(path.join(__dirname, 'src/sop/morning-sop.ts'))};
export { setLanguage } from ${JSON.stringify(path.join(__dirname, 'src/i18n/index.ts'))};
export { guessJournalFolder, importableFolderOptions, isFolderGuessFallback } from ${JSON.stringify(path.join(__dirname, 'src/services/journal-folder-guess.ts'))};
export { zh } from ${JSON.stringify(path.join(__dirname, 'src/i18n/zh.ts'))};
export { en } from ${JSON.stringify(path.join(__dirname, 'src/i18n/en.ts'))};
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
const { OnboardingModal, MorningSOP, setLanguage, guessJournalFolder, importableFolderOptions, isFolderGuessFallback, zh, en } = moduleObj.exports;

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

function makePlugin(options = {}) {
    const calls = { complete: 0, activate: [], firstInsight: [], openView: [], listFolders: 0, settingsClose: 0 };
    const plugin = {
        __calls: calls,
        app: { setting: { close: () => { calls.settingsClose++; } } },
        manifest: { id: 'tidelog' },
        licenseManager: { getPurchaseUrl: () => 'https://example.com' },
        settings: {
            archiveFolder: options.archiveFolder ?? 'TideLog/Archive',
            dailyFolder: options.dailyFolder ?? 'TideLog/Daily',
            onboardingCompleted: false,
        },
        legacyImportService: {
            listVaultFolders: () => {
                calls.listFolders++;
                return options.folders ?? ['我的日记', 'Attachments'];
            },
        },
        completeOnboarding: async () => { calls.complete++; },
        activateChatView: async (sopType) => { calls.activate.push(sopType); },
        openFirstInsight: async (folder) => { calls.firstInsight.push(folder); },
        openView: async (viewType) => { calls.openView.push(viewType); },
    };
    return plugin;
}

function openModal(lang, options) {
    setLanguage(lang);
    const plugin = makePlugin(options);
    const modal = new OnboardingModal(plugin.app, plugin);
    modal.onOpen();
    return { plugin, modal };
}

console.log('\n=== First-run onboarding flow tests ===\n');

console.log('Test 1: the first screen asks one routing question and reads no folders');
{
    const { plugin, modal } = openModal('zh');
    const buttons = modal.contentEl.querySelectorAll('.tl-onboarding-path-button');
    check(buttons.length === 2, 'exactly two CTAs — one per path', `actual: ${buttons.length}`);
    check(modal.contentEl.querySelector('.tl-onboarding-question')?.textContent === '你已经在 Obsidian 里写过日记吗？', 'first screen asks whether journals already exist');
    check(!modal.contentEl.querySelector('.tl-onboarding-folder-input'), 'folder input is hidden before the user chooses a path');
    check(plugin.__calls.listFolders === 0, 'opening onboarding does not inspect vault folders');

    const noJournals = modal.contentEl.querySelector('.tl-onboarding-no-journals');
    check(noJournals?.textContent.includes('没有，从今天的计划 / 复盘开始'), 'path B starts from today\'s plan or review', `actual: ${JSON.stringify(noJournals?.textContent)}`);
    check(!noJournals?.querySelector('.tl-onboarding-path-hint'), 'path B has no unclear explanatory subcopy');

    noJournals?.dispatchEvent(new dom.window.Event('click'));
    check(plugin.__calls.activate.length === 0, 'path B explains the flow before launching a hidden sidebar action');
    check(modal.contentEl.querySelectorAll('.tl-onboarding-start-step').length === 3, 'path B explains Plan, Review, and later Insights');
    check(modal.contentEl.textContent.includes('重点、任务量是否现实'), 'the Plan explanation matches the implemented AI assessment in user language');
    check(modal.contentEl.textContent.includes('进展、卡点和感受'), 'the Review explanation matches the implemented AI response in user language');
    check(modal.contentEl.textContent.includes('下一日／周／月建议'), 'the flow explains what review creates next');
    modal.contentEl.querySelector('.tl-onboarding-start-plan')
        ?.dispatchEvent(new dom.window.Event('click'));
    await Promise.resolve();
    check(plugin.__calls.activate[0] === 'morning', 'the explicit Plan button starts the Plan SOP', `actual: ${JSON.stringify(plugin.__calls.activate)}`);
    check(plugin.__calls.settingsClose === 1, 'starting a flow closes Settings so the sidebar action is visible');
    check(plugin.__calls.complete === 0, 'choosing a path does not mark onboarding complete');
}

console.log('\nTest 1b: the no-journal path can start Review directly');
{
    const { plugin, modal } = openModal('zh');
    modal.contentEl.querySelector('.tl-onboarding-no-journals')
        ?.dispatchEvent(new dom.window.Event('click'));
    modal.contentEl.querySelector('.tl-onboarding-start-review')
        ?.dispatchEvent(new dom.window.Event('click'));
    await Promise.resolve();
    check(plugin.__calls.activate[0] === 'evening', 'the explicit Review button starts the Review SOP', `actual: ${JSON.stringify(plugin.__calls.activate)}`);
    check(plugin.__calls.settingsClose === 1, 'Review also closes Settings before revealing the sidebar');
    check(plugin.__calls.complete === 0, 'starting Review does not fake onboarding completion');
}

console.log('\nTest 2: English carries the same two paths');
{
    const { modal } = openModal('en');
    const noJournals = modal.contentEl.querySelector('.tl-onboarding-no-journals');
    check(noJournals?.textContent.includes("No, start with today's plan / review"), 'English path B starts from today\'s plan or review', `actual: ${JSON.stringify(noJournals?.textContent)}`);
    const hasJournals = modal.contentEl.querySelector('.tl-onboarding-has-journals');
    check(hasJournals?.textContent.includes('Yes, start with past journals'), 'English path A starts from past journals', `actual: ${JSON.stringify(hasJournals?.textContent)}`);
}

console.log('\nTest 3: the three duplicate copy groups are gone');
{
    const { modal } = openModal('zh');
    check(!modal.contentEl.querySelector('.tl-onboarding-detail-list'), 'the "three entry points" group is gone');
    check(!modal.contentEl.querySelector('.tl-onboarding-method-grid'), 'the method cards are gone');
    check(!modal.contentEl.querySelector('.tl-onboarding-steps'), 'the "three steps" group is gone');
    check(!modal.contentEl.querySelector('.tl-onboarding-scroll-hint'), 'no scroll hint');
    check(!modal.contentEl.textContent.includes('继续下滑'), 'no scroll-instruction copy');

    // 一屏读完：正文（不含按钮）保持在 180 字以内。
    const bodyText = [
        modal.contentEl.querySelector('.tl-onboarding-title')?.textContent ?? '',
        modal.contentEl.querySelector('.tl-onboarding-desc')?.textContent ?? '',
        modal.contentEl.querySelector('.tl-onboarding-question')?.textContent ?? '',
        modal.contentEl.querySelector('.tl-onboarding-privacy-note')?.textContent ?? '',
    ].join('');
    check(bodyText.length <= 180, 'first-screen body copy stays within 180 characters', `actual: ${bodyText.length}`);
}

console.log('\nTest 4: first screen stays minimal; privacy appears at the actual journal-read step');
{
    const { plugin, modal } = openModal('zh');
    check(!modal.contentEl.querySelector('.tl-onboarding-privacy-note'), 'first screen has no explanatory privacy paragraph');
    check(plugin.__calls.listFolders === 0, 'first screen still reads no folder structure');
    modal.contentEl.querySelector('.tl-onboarding-has-journals')
        ?.dispatchEvent(new dom.window.Event('click'));
    const privacy = modal.contentEl.querySelector('.tl-onboarding-folder-privacy');
    check(privacy?.textContent.includes('不改动原文'), 'journal step states that originals remain untouched');
    check(privacy?.textContent.includes('不保存') && privacy?.textContent.includes('不用于训练'), 'journal step retains the data-use promise');

    const { modal: enModal } = openModal('en');
    check(!enModal.contentEl.querySelector('.tl-onboarding-privacy-note'), 'English first screen is minimal too');
}

console.log('\nTest 5: folder discovery happens only after choosing past journals');
{
    const { plugin, modal } = openModal('zh', { folders: ['我的日记', 'Attachments'] });
    modal.contentEl.querySelector('.tl-onboarding-has-journals')
        ?.dispatchEvent(new dom.window.Event('click'));
    const input = modal.contentEl.querySelector('.tl-onboarding-folder-value');
    const tree = modal.contentEl.querySelector('.tl-onboarding-folder-tree');
    const folderPrivacy = modal.contentEl.querySelector('.tl-onboarding-folder-privacy');
    check(!!input && input.getAttribute('type') === 'hidden', 'selected folder is stored without a manual text field');
    check(tree?.getAttribute('role') === 'tree', 'the second step renders the current vault as a folder tree');
    check(!modal.contentEl.querySelector('input[type="text"]'), 'the user never has to type a folder path');
    check(!!folderPrivacy && !!tree && !!(folderPrivacy.compareDocumentPosition(tree) & Node.DOCUMENT_POSITION_FOLLOWING), 'compact privacy notice appears before the folder tree');
    check(plugin.__calls.listFolders === 1, 'folder discovery runs exactly once after path selection');
    check(input.value === '我的日记', 'the semantic match is prefilled', `actual: ${JSON.stringify(input.value)}`);

    const hint = modal.contentEl.querySelector('.tl-onboarding-folder-guess-hint');
    check(!hint, 'a confidently matched folder is not undermined by a guess warning');
    check(modal.contentEl.querySelector('.tl-onboarding-first-insight')?.textContent === '从原有日记生成画像', 'the primary action uses user-facing profile copy');

    // 用户在树里改了目录，走的必须是他选的那个，不是猜的那个。
    const attachments = modal.contentEl.querySelector('.tl-first-insight-folder-node[data-folder-path="Attachments"]');
    attachments?.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    const journals = modal.contentEl.querySelector('.tl-first-insight-folder-node[data-folder-path="我的日记"]');
    check(attachments?.classList.contains('is-selected') && !journals?.classList.contains('is-selected'), 'the clicked folder is the only selected folder');
    const primary = modal.contentEl.querySelector('.tl-onboarding-buttons .tl-onboarding-primary');
    primary?.dispatchEvent(new dom.window.Event('click'));
    await Promise.resolve();
    check(plugin.__calls.firstInsight[0] === 'Attachments', 'the folder selected in the tree is what gets used', `actual: ${JSON.stringify(plugin.__calls.firstInsight)}`);
    check(plugin.__calls.activate.length === 0, 'path A does not also start the plan');
    check(plugin.__calls.complete === 0, 'opening profile generation does not mark onboarding complete');
}

console.log('\nTest 5b: a dictionary-order fallback guess says so more loudly');
{
    // 没有任何语义线索：pickDefaultFolder 退回 folderOptions[0]，猜错是常态。
    const { modal } = openModal('zh', { folders: ['Attachments', 'Zettel'], dailyFolder: 'TideLog/Daily' });
    modal.contentEl.querySelector('.tl-onboarding-has-journals')
        ?.dispatchEvent(new dom.window.Event('click'));
    const input = modal.contentEl.querySelector('.tl-onboarding-folder-value');
    check(input.value === 'Attachments', 'falls back to the first folder in dictionary order', `actual: ${JSON.stringify(input.value)}`);
    const hint = modal.contentEl.querySelector('.tl-onboarding-folder-guess-hint');
    check(hint.textContent.includes('请选择真正存放日记的文件夹'), 'an uncertain fallback asks the user to choose explicitly', `actual: ${JSON.stringify(hint.textContent)}`);
}

console.log('\nTest 5d: closing onboarding never fakes completion');
{
    const { plugin, modal } = openModal('zh');
    modal.onClose();
    await Promise.resolve();
    check(plugin.__calls.complete === 0, 'closing the modal leaves onboarding incomplete');
}

console.log('\nTest 5c: the guess helper itself');
{
    const context = { archiveFolder: 'TideLog/Archive', dailyFolder: 'TideLog/Daily' };
    check(guessJournalFolder(['Attachments', '我的日记'], context) === '我的日记', 'a journal-like name wins over dictionary order');
    check(guessJournalFolder(['Attachments', 'Daily Notes'], context) === 'Daily Notes', 'a daily-like name wins over dictionary order');
    check(guessJournalFolder(['Attachments', 'TideLog/Daily'], context) === 'TideLog/Daily', 'the configured daily folder wins over dictionary order');
    check(guessJournalFolder(['Zettel', 'Attachments'], context) === 'Zettel', 'with no signal it takes the first option given');
    check(guessJournalFolder([], context) === '', 'an empty vault yields no guess');

    const importable = importableFolderOptions(['TideLog/Archive', 'TideLog/Archive/2025', '我的日记'], context);
    check(!importable.includes('TideLog/Archive'), 'the archive folder is never offered as a source');
    check(!importable.includes('TideLog/Archive/2025'), 'archive subfolders are never offered either');
    check(importable.includes('我的日记'), 'real folders survive the filter');

    check(isFolderGuessFallback('Zettel', ['Zettel'], context) === true, 'a semantics-free guess is reported as a fallback');
    check(isFolderGuessFallback('我的日记', ['我的日记'], context) === false, 'a semantic match is not a fallback');
    check(isFolderGuessFallback('TideLog/Daily', ['TideLog/Daily'], context) === false, 'the configured folder is not a fallback');
}

console.log('\nTest 6: the four trial promises moved to the paywall — they were not deleted');
{
    const { modal } = openModal('zh');
    const text = modal.contentEl.textContent;
    check(!text.includes('7 天'), 'the trial is not pitched on the first screen');
    check(!text.includes('不会自动续费'), 'trial terms are not on the first screen');

    // 搬家不等于删除。四条承诺是产品合同，必须仍然存在于付费墙的文案里。
    for (const key of ['trial.promiseLength', 'trial.promiseUserInitiated', 'trial.promiseNoCard', 'trial.promiseNoAutoRenew']) {
        check(typeof zh[key] === 'string' && zh[key].length > 0, `${key} still exists in Chinese`);
        check(typeof en[key] === 'string' && en[key].length > 0, `${key} still exists in English`);
    }
    check(zh['trial.promiseLength'].includes('7 天'), 'the Chinese promise still states seven days');
    check(zh['trial.promiseUserInitiated'].includes('主动开启'), 'the Chinese promise still says the user starts it');
    check(zh['trial.promiseNoCard'].includes('无需绑定支付方式'), 'the Chinese promise still says no card');
    check(zh['trial.promiseNoAutoRenew'].includes('不会自动续费'), 'the Chinese promise still says no auto-renewal');
    check(en['trial.promiseLength'].includes('7 days'), 'the English promise still states seven days');
    check(en['trial.promiseNoAutoRenew'].toLowerCase().includes('auto-renewal'), 'the English promise still says no auto-renewal');
}

console.log('\nTest 7: the zero-journal user can still discover the profile feature later');
{
    // 路径 B 的用户永远不会点「从旧日记生成画像」。这句提示是他唯一的入口，
    // 后续提示文案必须存在且明确画像所需的最低记录量。
    check(typeof zh['firstInsight.laterProfileHint'] === 'string', 'the Chinese hint copy exists');
    check(zh['firstInsight.laterProfileHint'].includes('3 篇'), 'the Chinese hint states the 3-entry threshold');
    check(typeof en['firstInsight.laterProfileHint'] === 'string', 'the English hint copy exists');
    check(en['firstInsight.laterProfileHint'].includes('3 entries'), 'the English hint states the 3-entry threshold');
}

console.log('\nTest 8: no BYOK dead ends survive on the first screen');
{
    const { modal } = openModal('zh');
    check(!modal.contentEl.textContent.includes('配置 API'), 'no "configure API" copy');
    check(!modal.contentEl.textContent.includes('API Key'), 'no API key copy');
}

console.log('\nTest 9: the no-journal path completes only after AI feedback and a successful write');
{
    const calls = { appended: [], complete: 0, offers: [], ai: 0 };
    const plugin = {
        settings: { activeProvider: 'custom', onboardingCompleted: false },
        vaultManager: {
            getWeeklyPlanContent: async () => '',
            getUserProfileContent: async () => '',
            getOrCreateDailyNote: async () => ({ path: 'Daily/2026-08-28.md' }),
            appendToSection: async (...args) => { calls.appended.push(args); },
            updateDailyNoteYAML: async () => {},
        },
        kanbanService: null,
        getAIProvider: () => ({
            sendMessage: async (_messages, _prompt, onChunk) => {
                calls.ai++;
                onChunk('任务量可行，先推进第一项。');
            },
        }),
        completeOnboarding: async () => { calls.complete++; },
        showTrialOfferOnce: async (feature) => { calls.offers.push(feature); },
    };
    const sop = new MorningSOP(plugin);
    const context = { type: 'morning', currentStep: 0, responses: {} };
    const messages = [];

    await sop.start(context, message => messages.push(message));
    await sop.handleResponse('完成发布检查\n整理更新说明', context, message => messages.push(message));
    check(calls.ai === 1 && messages.at(-1).includes('任务量可行'), 'AI feedback appears before confirmation');
    check(calls.appended.length === 0 && calls.complete === 0, 'feedback alone does not complete onboarding or write a note');

    await sop.handleResponse('确认', context, message => messages.push(message));
    check(calls.appended.length === 1, 'confirmed plan is written to today\'s journal');
    check(calls.complete === 1, 'successful plan write marks onboarding complete');
    check(calls.offers[0] === '计划', 'trial offer is triggered only after first value is delivered');
}

console.log('\nTest 10: an AI failure may save the plan but cannot fake first value');
{
    const calls = { appended: 0, complete: 0, offers: 0 };
    const plugin = {
        settings: { activeProvider: 'custom', onboardingCompleted: false },
        vaultManager: {
            getWeeklyPlanContent: async () => '',
            getUserProfileContent: async () => '',
            getOrCreateDailyNote: async () => ({ path: 'Daily/2026-08-28.md' }),
            appendToSection: async () => { calls.appended++; },
            updateDailyNoteYAML: async () => {},
        },
        kanbanService: null,
        getAIProvider: () => ({ sendMessage: async () => { throw new Error('offline'); } }),
        completeOnboarding: async () => { calls.complete++; },
        showTrialOfferOnce: async () => { calls.offers++; },
    };
    const sop = new MorningSOP(plugin);
    const context = { type: 'morning', currentStep: 0, responses: {} };

    await sop.start(context, () => {});
    await sop.handleResponse('完成发布检查', context, () => {});
    await sop.handleResponse('确认', context, () => {});

    check(calls.appended === 1, 'the user can still save a plan during an AI outage');
    check(calls.complete === 0, 'AI failure leaves onboarding incomplete');
    check(calls.offers === 0, 'AI failure never triggers a trial pitch');
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
try { fs.unlinkSync(mockPath); } catch {}
try { fs.unlinkSync(entryPath); } catch {}
process.exit(fail === 0 ? 0 : 1);
