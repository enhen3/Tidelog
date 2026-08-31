/**
 * First insight / legacy import regression tests.
 *
 * Covers the first-value path:
 * - non-standard old journals are read-only
 * - source copies and normalized copies are created under Archive/Imports
 * - date extraction priority and shared first-insight thresholds work
 * - the report/profile standard contains the five Aha modules
 * - user_profile.md is written only after confirmation
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
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;

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
    callback?.(el);
    return el;
};
HTMLElement.prototype.createSpan = function (options, callback) {
    const el = document.createElement('span');
    applyOptions(el, options);
    this.appendChild(el);
    callback?.(el);
    return el;
};
HTMLElement.prototype.createEl = function (tag, options, callback) {
    const el = document.createElement(tag);
    applyOptions(el, options);
    this.appendChild(el);
    callback?.(el);
    return el;
};
HTMLElement.prototype.addClass = function (...classes) { this.classList.add(...classes); };
HTMLElement.prototype.removeClass = function (...classes) { this.classList.remove(...classes); };
HTMLElement.prototype.setText = function (text) { this.textContent = String(text); };
HTMLElement.prototype.setAttr = function (name, value) { this.setAttribute(name, String(value)); };
HTMLElement.prototype.empty = function () {
    while (this.firstChild) this.removeChild(this.firstChild);
};

const mockPath = path.join(__dirname, 'obsidian-mock-first-insight.cjs');
fs.writeFileSync(
    mockPath,
    `
const moment = require('moment');
class TFile {
    constructor(path, content = '', mtime = Date.now()) {
        this.path = path;
        this.content = content;
        this.extension = path.split('.').pop();
        this.name = path.split('/').pop();
        this.basename = this.name.replace(/\\.md$/, '');
        this.stat = { mtime, ctime: mtime, size: content.length };
    }
}
class TFolder {
    constructor(path) {
        this.path = path;
        this.name = path.split('/').pop() || '';
        this.children = [];
    }
}
class Modal {
    constructor(app) {
        this.app = app;
        this.modalEl = activeDocument.createElement('div');
        this.contentEl = activeDocument.createElement('div');
    }
    open() { this.onOpen?.(); }
    close() { this.onClose?.(); }
}
class ItemView {
    constructor(leaf) {
        this.leaf = leaf;
        this.app = leaf.app;
        this.containerEl = activeDocument.createElement('div');
        this.contentEl = activeDocument.createElement('div');
        this.containerEl.appendChild(this.contentEl);
    }
    registerEvent(ref) { return ref; }
}
class Notice {
    constructor(message) {
        global.__lastNotice = message;
    }
}
module.exports = {
    App: class {},
    Component: class { load(){} unload(){} },
    ItemView,
    MarkdownRenderer: { render: async (app, content, el) => { el.textContent = content; } },
    Modal,
    Notice,
    Platform: { isMobile: false },
    TFile,
    TFolder,
    moment,
    setIcon: (el, icon) => { el.setAttribute('data-icon', icon); },
};
`,
);

const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
    if (req === 'obsidian') return mockPath;
    return origResolve.call(this, req, parent, ...rest);
};

const entryPath = path.join(__dirname, '.test-first-insight-entry.ts');
fs.writeFileSync(entryPath, `
export {
    LegacyImportService,
    extractLegacyJournalDate,
    cleanJournalContent,
    isLegacyJournalAnalyzable,
    selectRecentFirstInsightScan,
    FIRST_INSIGHT_RECENT_WINDOW_DAYS,
    FIRST_INSIGHT_MAX_SELECTED_ENTRIES,
} from ${JSON.stringify(path.join(__dirname, 'src/services/legacy-import-service.ts'))};
export {
    FIRST_INSIGHT_MIN_VALID_ENTRIES,
    FIRST_INSIGHT_MIN_ANALYZABLE_CHARS,
} from ${JSON.stringify(path.join(__dirname, 'src/constants.ts'))};
export {
    FirstInsightService,
    buildFirstInsightPrompt,
    buildFirstInsightSystemPrompt,
    boundFirstInsightCurrentProfile,
    extractProfileUpdate,
    stripProfileTags,
    hasRequiredAhaModules,
    ensureProfileAhaStructure,
    sampleEvenly,
    FIRST_INSIGHT_INPUT_TOKEN_BUDGET,
} from ${JSON.stringify(path.join(__dirname, 'src/services/first-insight-service.ts'))};
export {
    estimateTokens,
    CLIENT_INPUT_TOKEN_BUDGET,
    SERVER_MAX_INPUT_TOKENS,
} from ${JSON.stringify(path.join(__dirname, 'src/utils/token-estimate.ts'))};
export {
    FirstInsightModal,
    diagnoseFirstInsightBlock,
    firstInsightBlockContext,
    firstInsightBlockCopy,
} from ${JSON.stringify(path.join(__dirname, 'src/views/first-insight-modal.ts'))};
export { ChatView } from ${JSON.stringify(path.join(__dirname, 'src/views/chat-view.ts'))};
export { TideLogError, ErrorCode } from ${JSON.stringify(path.join(__dirname, 'src/utils/error-formatter.ts'))};
export { setLanguage, t } from ${JSON.stringify(path.join(__dirname, 'src/i18n/index.ts'))};
`);

const bundled = await esbuild.build({
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
new Function('module', 'exports', 'require', bundled.outputFiles[0].text)(moduleObj, moduleObj.exports, require);
const {
    LegacyImportService,
    selectRecentFirstInsightScan,
    FIRST_INSIGHT_RECENT_WINDOW_DAYS,
    FIRST_INSIGHT_MAX_SELECTED_ENTRIES,
    FIRST_INSIGHT_MIN_VALID_ENTRIES,
    FIRST_INSIGHT_MIN_ANALYZABLE_CHARS,
    FirstInsightService,
    buildFirstInsightPrompt,
    buildFirstInsightSystemPrompt,
    boundFirstInsightCurrentProfile,
    extractLegacyJournalDate,
    cleanJournalContent,
    extractProfileUpdate,
    stripProfileTags,
    hasRequiredAhaModules,
    ensureProfileAhaStructure,
    sampleEvenly,
    FIRST_INSIGHT_INPUT_TOKEN_BUDGET,
    estimateTokens,
    CLIENT_INPUT_TOKEN_BUDGET,
    SERVER_MAX_INPUT_TOKENS,
    isLegacyJournalAnalyzable,
    FirstInsightModal,
    diagnoseFirstInsightBlock,
    firstInsightBlockContext,
    firstInsightBlockCopy,
    ChatView,
    TideLogError,
    ErrorCode,
    setLanguage,
    t,
} = moduleObj.exports;
const { TFile, TFolder, moment } = require(mockPath);

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

function flush(ms = 0) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

function selectFolderInModal(modal, folderPath) {
    const node = [...modal.contentEl.querySelectorAll('.tl-first-insight-folder-node')]
        .find(el => el.getAttribute('data-folder-path') === folderPath);
    if (!node) {
        check(false, `folder tree contains ${folderPath}`);
        return false;
    }
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    return true;
}

async function waitFor(predicate, label, timeoutMs = 1000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (predicate()) return true;
        await flush(10);
    }
    check(false, label, 'timed out');
    return false;
}

function makeLongBody(seed) {
    return [
        `今天继续推进 ${seed}，但中间反复在先准备更多资料和直接找用户反馈之间摇摆。`,
        `任务：完成 ${seed} 的验证，整理用户反馈，并记录下一步。`,
        `情绪：有一点焦虑，也有一点期待，因为外部反馈还不够明确。`,
        `反思：我发现自己在不确定时会增加准备工作，而不是马上做更小的实验。`,
        `下次应该先做一个更小的动作，用真实反馈判断方向。`,
    ].join('\n');
}

const FIRST_INSIGHT_AHA_REPORT = `# 首次洞察画像报告

## 过去记录里的三个高频主题
- 主题一。

## 一个反复出现的行为模式
- 模式。

## 一个可能的盲点
- 盲点。

## 下周一个小实验
- 实验。

## 引用证据
- 2026-07-01 [[Legacy/2026-07-01.md]]

<profile_update>
# 用户画像

## 过去记录里的三个高频主题
- 主题一。

## 一个反复出现的行为模式
- 模式。

## 一个可能的盲点
- 盲点。

## 下周一个小实验
- 实验。

## 引用证据
- 2026-07-01 [[Legacy/2026-07-01.md]]
</profile_update>`;

function createVaultHarness() {
    const nodes = new Map();
    const root = new TFolder('');
    nodes.set('', root);

    function ensureFolder(folderPath) {
        const normalized = folderPath.replace(/^\/|\/$/g, '');
        if (!normalized) return root;
        if (nodes.has(normalized)) return nodes.get(normalized);

        const parentPath = normalized.split('/').slice(0, -1).join('/');
        const parent = ensureFolder(parentPath);
        const folder = new TFolder(normalized);
        nodes.set(normalized, folder);
        parent.children.push(folder);
        return folder;
    }

    function addFile(filePath, content, mtime = Date.now()) {
        const parentPath = filePath.split('/').slice(0, -1).join('/');
        const parent = ensureFolder(parentPath);
        const file = new TFile(filePath, content, mtime);
        nodes.set(filePath, file);
        parent.children.push(file);
        return file;
    }

    const vault = {
        getRoot: () => root,
        getAbstractFileByPath: p => nodes.get(p) ?? null,
        cachedRead: async file => file.content,
        read: async file => file.content,
        createFolder: async folderPath => ensureFolder(folderPath),
        create: async (filePath, content) => {
            if (nodes.has(filePath)) throw new Error(`File already exists: ${filePath}`);
            return addFile(filePath, content);
        },
        modify: async (file, content) => {
            file.content = content;
            file.stat.mtime = Date.now();
            file.stat.size = file.content.length;
        },
        process: async (file, updater) => {
            file.content = updater(file.content);
            file.stat.mtime = Date.now();
            file.stat.size = file.content.length;
            return file.content;
        },
        on: () => ({}),
    };

    return { nodes, root, vault, ensureFolder, addFile };
}

function makePlugin(harness, aiResponse = '', currentProfile = '# 用户画像\n\n## 旧格式画像\n\n- 已有内容。') {
    const opened = [];
    const lifecycle = { completed: 0, trialOffers: [] };
    return {
        __opened: opened,
        __lifecycle: lifecycle,
        app: {
            vault: harness.vault,
            metadataCache: { getFileCache: () => ({}) },
            workspace: {
                getLeaf: () => ({
                    openFile: async file => { opened.push(file.path); },
                }),
            },
        },
        settings: {
            dailyFolder: 'Legacy',
            archiveFolder: 'Archive',
            activeProvider: 'openai',
            firstInsightCompleted: false,
            providers: {
                openai: { apiKey: 'test-key' },
            },
        },
        saveSettings: async () => {},
        completeOnboarding: async () => { lifecycle.completed++; },
        showTrialOfferOnce: async feature => { lifecycle.trialOffers.push(feature); },
        hasConfiguredAI: () => true,
        vaultManager: {
            getUserProfileContent: async () => currentProfile,
            ensureInsightsFolder: async () => { await harness.vault.createFolder('Archive/Insights'); },
        },
        getAIProvider: () => ({
            sendMessage: async (messages, systemPrompt, onChunk, feature, sessionId, responseMode) => {
                makePlugin.lastMessages = messages;
                makePlugin.lastSystemPrompt = systemPrompt;
                makePlugin.lastFeature = feature;
                makePlugin.lastSessionId = sessionId;
                makePlugin.lastResponseMode = responseMode;
                onChunk(aiResponse);
            },
        }),
    };
}

console.log('\n=== FIRST INSIGHT / LEGACY IMPORT TESTS ===\n');

setLanguage('zh');

console.log('Test 1: date extraction priority supports non-standard journals');
{
    const mtime = moment('2026-06-04').valueOf();
    check(extractLegacyJournalDate('---\ndate: 2026-06-01\n---\n正文', 'Legacy/random.md', mtime).source === 'frontmatter', 'frontmatter date has top priority');
    check(extractLegacyJournalDate('正文', 'Legacy/2026-06-02-note.md', mtime).date === '2026-06-02', 'filename date is recognized');
    check(extractLegacyJournalDate('正文', 'Legacy/2026-05-30.md', mtime).date === '2026-05-30', 'filename date does not truncate two-digit days');
    check(extractLegacyJournalDate('正文', 'Daily/2026/June/2026-Jun-02.md', mtime).date === '2026-06-02', 'official Daily notes YYYY/MMMM/YYYY-MMM-DD format is recognized');
    check(extractLegacyJournalDate('正文', 'Daily/2026/06/03.md', mtime).date === '2026-06-03', 'date split across folder path YYYY/MM/DD is recognized');
    check(extractLegacyJournalDate('日期：2026年6月3日\n正文', 'Legacy/no-date.md', mtime).date === '2026-06-03', 'body date is recognized');
    check(extractLegacyJournalDate('# 2026-06-05\n\n' + makeLongBody('标题日期'), 'Legacy/template-output.md', mtime).date === '2026-06-05', 'template heading date is recognized from body');
    check(extractLegacyJournalDate('---\ncreated: 2026-06-06T10:30:00\n---\n正文', 'Legacy/properties-created.md', mtime).date === '2026-06-06', 'Obsidian date-time property is recognized');
    check(extractLegacyJournalDate('正文 without date', 'Legacy/no-date.md', mtime).date === '2026-06-04', 'mtime fallback is used last');
    check(extractLegacyJournalDate('正文 without date', 'Legacy/no-date.md', 0) === null, 'missing date without mtime is rejected');
}

console.log('\nTest 2: scan separates candidate journals, valid journals, and exclusions');
{
    const harness = createVaultHarness();
    harness.ensureFolder('Legacy');
    for (let i = 1; i <= 2; i++) {
        harness.addFile(`Legacy/2026-06-0${i}.md`, makeLongBody(`主题${i}`), moment(`2026-06-0${i}`).valueOf());
    }
    harness.addFile('Legacy/2026-06-03-short.md', '太短', moment('2026-06-03').valueOf());
    harness.addFile('Legacy/2026-05-30.md', makeLongBody('范围外'), moment('2026-05-30').valueOf());

    const service = new LegacyImportService(makePlugin(harness));
    const scan = await service.scanFolder('Legacy', { start: '2026-06-01', end: '2026-06-30' });
    check(scan.candidateCount === 3, 'candidate count includes dated markdown in range');
    check(scan.validCount === 2, 'valid count excludes too-short content');
    check(!scan.canGenerate, 'fewer than 3 valid journals cannot generate formal report');
    check(scan.excludedEntries.some(item => item.reason === 'too_short'), 'too-short journal is listed as excluded');
    check(scan.excludedEntries.some(item => item.reason === 'outside_range'), 'outside-range journal is listed as excluded');

    const autoScan = await service.scanFolder('Legacy');
    check(autoScan.candidateCount === 4, 'folder-only scan includes all dated markdown candidates');
    check(autoScan.validCount === 3, 'folder-only scan relies on detected dates instead of manual date inputs');
    check(autoScan.canGenerate, 'folder-only scan can generate when at least 3 journals are analyzable');
    check(
        autoScan.dateRange.start === '2026-05-30' && autoScan.dateRange.end === '2026-06-03',
        'folder-only scan reports the detected date range',
        `actual: ${JSON.stringify(autoScan.dateRange)}`,
    );
}

console.log('\nTest 2b: representative Obsidian journal formats import as valid old journals');
{
    const harness = createVaultHarness();
    harness.ensureFolder('ObsidianFormats');
    harness.addFile(
        'ObsidianFormats/2026-06-01.md',
        '# 2026-06-01\n\n## Tasks\n- [ ] 找 3 个用户试用\n\n' + makeLongBody('官方默认 Daily notes'),
        moment('2026-06-01').valueOf(),
    );
    harness.addFile(
        'ObsidianFormats/2026/June/2026-Jun-02.md',
        '## Journal\n\n' + makeLongBody('官方 Date format 子文件夹'),
        moment('2026-06-02').valueOf(),
    );
    harness.addFile(
        'ObsidianFormats/2026/06/03.md',
        '今天继续记录。' + makeLongBody('常见 YYYY/MM/DD 路径'),
        moment('2026-06-03').valueOf(),
    );
    harness.addFile(
        'ObsidianFormats/2026-06-04-Thursday.md',
        makeLongBody('文件名带星期'),
        moment('2026-06-04').valueOf(),
    );
    harness.addFile(
        'ObsidianFormats/template-frontmatter.md',
        '---\ndate: "2026-06-05"\ntags:\n  - journal\n  - daily\n---\n# {{title}}\n\n' + makeLongBody('Templates frontmatter 日期'),
        moment('2026-06-05').valueOf(),
    );
    harness.addFile(
        'ObsidianFormats/template-heading.md',
        '# 2026-06-06\n\n## Mood\n焦虑但期待。\n\n' + makeLongBody('模板标题日期'),
        moment('2026-06-06').valueOf(),
    );
    harness.addFile(
        'ObsidianFormats/properties-created.md',
        '---\ncreated: 2026-06-07T10:30:00\ntags:\n  - journal\n---\n\n' + makeLongBody('Properties date-time 日期'),
        moment('2026-06-07').valueOf(),
    );

    const plugin = makePlugin(harness);
    plugin.settings.dailyFolder = 'Daily';
    const service = new LegacyImportService(plugin);
    const scan = await service.scanFolder('ObsidianFormats');
    const session = await service.createImport(scan);
    const imported = await service.importSessionToDailyNotes(session);
    const dates = scan.validEntries.map(entry => entry.date);

    check(scan.candidateCount === 7, 'representative Obsidian fixture finds all 7 dated markdown notes');
    check(scan.validCount === 7 && scan.canGenerate, 'representative Obsidian fixture passes the 3-note generation threshold');
    check(
        ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07']
            .every(date => dates.includes(date)),
        'representative Obsidian fixture preserves all expected dates',
        `actual: ${dates.join(', ')}`,
    );
    check(session.normalizedEntries.length === 7, 'representative Obsidian fixture creates normalized copies for all valid notes');
    check(imported.createdPaths.length === 7, 'representative Obsidian fixture can be copied into TideLog dated daily notes');
    check(harness.nodes.get('Daily/2026-06-02.md').content.includes('官方 Date format 子文件夹'), 'system import keeps content from official subfolder format');
    check(harness.nodes.get('Daily/2026-06-03.md').content.includes('常见 YYYY/MM/DD 路径'), 'system import keeps content from split path date format');
}

console.log('\nTest 2c: first profile selects only the latest 30-day evidence window');
{
    const makeCandidate = (date, index) => ({
        date,
        sourcePath: `Legacy/${date}-${String(index).padStart(3, '0')}.md`,
        analyzableBody: makeLongBody(`窗口${index}`),
    });
    const entries = Array.from({ length: 66 }, (_, index) => {
        const date = moment('2026-01-01').add(index, 'days').format('YYYY-MM-DD');
        return makeCandidate(date, index);
    });
    const source = {
        folderPath: 'Legacy',
        dateRange: { start: entries[0].date, end: entries[65].date },
        candidateCount: 66,
        validCount: 66,
        validEntries: entries,
        excludedEntries: [],
        canGenerate: true,
    };
    const selection = selectRecentFirstInsightScan(source);
    check(FIRST_INSIGHT_RECENT_WINDOW_DAYS === 30, 'the evidence window is exactly 30 calendar days');
    check(FIRST_INSIGHT_MAX_SELECTED_ENTRIES === 30, 'the selected journal count has a 30-entry hard cap');
    check(selection.detectedCount === 66 && selection.selectedCount === 30, '66 detected journals become 30 selected journals');
    check(selection.scan.validEntries[0].date === moment(entries[65].date).subtract(29, 'days').format('YYYY-MM-DD'), 'selection starts 29 days before the latest journal');
    check(selection.scan.validEntries.at(-1).date === entries[65].date, 'selection keeps the latest journal');

    const sameDayEntries = Array.from({ length: 66 }, (_, index) => makeCandidate('2026-08-31', index));
    const sameDay = selectRecentFirstInsightScan({ ...source, validEntries: sameDayEntries });
    check(sameDay.selectedCount === 30, 'more than 30 entries in one month still cannot exceed the entry cap');
    check(sameDay.scan.validEntries[0].sourcePath.endsWith('-000.md') && sameDay.scan.validEntries.at(-1).sourcePath.endsWith('-065.md'), 'capped selection preserves both ends instead of taking one cluster');

    const sparseEntries = [
        makeCandidate('2026-01-01', 1),
        makeCandidate('2026-06-01', 2),
        makeCandidate('2026-06-20', 3),
    ];
    const sparse = selectRecentFirstInsightScan({ ...source, candidateCount: 3, validCount: 3, validEntries: sparseEntries });
    check(sparse.selectedCount === 3 && sparse.scan.canGenerate === true, '30 or fewer journals are all read even when they span more than 30 days');
}

console.log('\nTest 3: threshold allows exactly 3 and more than 3 valid journals');
{
    const harness = createVaultHarness();
    harness.ensureFolder('Legacy');
    harness.ensureFolder('Daily');
    const originals = new Map();
    for (let i = 1; i <= 3; i++) {
        const file = harness.addFile(`Legacy/2026-06-${String(i).padStart(2, '0')}.md`, makeLongBody(`导入${i}`), moment(`2026-06-${String(i).padStart(2, '0')}`).valueOf());
        originals.set(file.path, file.content);
    }

    const service = new LegacyImportService(makePlugin(harness));
    const scan = await service.scanFolder('Legacy', { start: '2026-06-01', end: '2026-06-30' });
    const session = await service.createImport(scan);

    check(scan.canGenerate, 'exactly 3 valid journals can generate');
    check(session.normalizedEntries.length === 3, 'exactly 3 valid journals are all normalized');
}

{
    const harness = createVaultHarness();
    harness.ensureFolder('Legacy');
    for (let i = 1; i <= 4; i++) {
        harness.addFile(`Legacy/2026-06-${String(i).padStart(2, '0')}.md`, makeLongBody(`阈值${i}`), moment(`2026-06-${String(i).padStart(2, '0')}`).valueOf());
    }

    const service = new LegacyImportService(makePlugin(harness));
    const scan = await service.scanFolder('Legacy', { start: '2026-06-01', end: '2026-06-30' });
    const session = await service.createImport(scan);

    check(scan.validCount === 4, 'more than 3 valid journals are counted');
    check(scan.canGenerate, 'more than 3 valid journals can generate');
    check(session.normalizedEntries.length === 4, 'more than 3 valid journals are all normalized');
}

console.log('\nTest 3b: first-insight count and character thresholds share one definition');
{
    check(FIRST_INSIGHT_MIN_VALID_ENTRIES === 3, 'first insight requires 3 valid journals');
    check(FIRST_INSIGHT_MIN_ANALYZABLE_CHARS === 60, 'each first-insight journal requires 60 non-whitespace characters');
    check(!isLegacyJournalAnalyzable('x'.repeat(59)), '59 non-whitespace characters are rejected');
    check(isLegacyJournalAnalyzable(` ${'x'.repeat(60)}\n`), '60 non-whitespace characters are accepted');

    const harness = createVaultHarness();
    harness.ensureFolder('Legacy');
    for (let i = 1; i <= 2; i++) {
        harness.addFile(`Legacy/2026-06-0${i}.md`, makeLongBody(`服务校验${i}`), moment(`2026-06-0${i}`).valueOf());
    }
    const plugin = makePlugin(harness);
    const legacy = new LegacyImportService(plugin);
    const scan = await legacy.scanFolder('Legacy');
    const session = await legacy.createImport(scan);
    let thresholdError = '';
    try {
        await new FirstInsightService(plugin).generateFirstInsight(session);
    } catch (error) {
        thresholdError = error instanceof Error ? error.message : String(error);
    }
    check(thresholdError.includes('至少需要 3 篇'), 'service-layer validation reports the shared 3-journal threshold');
}

console.log('\nTest 4: import copies source files and writes normalized files without mutating originals');
{
    const harness = createVaultHarness();
    harness.ensureFolder('Legacy');
    const originals = new Map();
    for (let i = 1; i <= 7; i++) {
        const file = harness.addFile(`Legacy/2026-06-${String(i).padStart(2, '0')}.md`, makeLongBody(`导入${i}`), moment(`2026-06-${String(i).padStart(2, '0')}`).valueOf());
        originals.set(file.path, file.content);
    }

    const service = new LegacyImportService(makePlugin(harness));
    const scan = await service.scanFolder('Legacy', { start: '2026-06-01', end: '2026-06-30' });
    const session = await service.createImport(scan);

    check(session.sourceFolderPath.startsWith('Archive/Imports/legacy-'), 'source copies live under Archive/Imports/<import-id>/source');
    check(session.normalizedFolderPath.endsWith('/normalized'), 'normalized copies use normalized folder');
    check(session.normalizedEntries.length === 7, 'all valid entries are normalized');

    const first = session.normalizedEntries[0];
    const originalFile = harness.nodes.get(first.sourcePath);
    const sourceCopy = harness.nodes.get(first.sourceCopyPath);
    const normalized = harness.nodes.get(first.normalizedPath);
    check(originalFile.content === originals.get(first.sourcePath), 'original source file content is unchanged');
    check(sourceCopy.content === originals.get(first.sourcePath), 'source copy preserves exact original content');
    check(normalized.content.includes('type: legacy_import_normalized'), 'normalized file has required frontmatter type');
    check(normalized.content.includes(`source_path: "${first.sourcePath}"`), 'normalized file records source path');
    check(normalized.content.includes('## Analyzable body'), 'normalized file includes analyzable body section');
    check(normalized.content.includes('## Candidate topics'), 'normalized file includes candidate topics');
    check(normalized.content.includes('## Emotion signals'), 'normalized file includes emotion/reflection signals');
}

console.log('\nTest 4b: TideLog import sections never become duplicate profile evidence');
{
    const cleaned = cleanJournalContent(`# 2026-08-31\n\n真实正文，保留这段证据。\n\n### 旧日记导入\n\n> [!tl-evidence]\n> 重复正文，不应再次分析。\n\n## 后续手写补充\n\n这一段仍然保留。`);
    check(cleaned.includes('真实正文') && cleaned.includes('后续手写补充'), 'cleaning keeps real content around an import section');
    check(!cleaned.includes('重复正文') && !cleaned.includes('tl-evidence'), 'cleaning removes the entire generated import section');

    const english = cleanJournalContent('# Journal\n\nReal note.\n\n### Legacy journal import\n\nDuplicated note.');
    check(english.includes('Real note') && !english.includes('Duplicated note'), 'English generated import sections are removed too');
}

console.log('\nTest 5: optional system import copies old journals into TideLog daily notes');
{
    const harness = createVaultHarness();
    harness.ensureFolder('Legacy');
    harness.ensureFolder('Daily');
    const originals = new Map();
    for (let i = 1; i <= 7; i++) {
        const file = harness.addFile(`Legacy/2026-06-${String(i).padStart(2, '0')}.md`, makeLongBody(`纳入${i}`), moment(`2026-06-${String(i).padStart(2, '0')}`).valueOf());
        originals.set(file.path, file.content);
    }
    harness.addFile('Daily/2026-06-03.md', '# 2026-06-03\n\n## 计划\n\n- 已有计划\n\n## 复盘\n\n已有复盘。');

    const plugin = makePlugin(harness);
    plugin.settings.dailyFolder = 'Daily';
    const service = new LegacyImportService(plugin);
    const scan = await service.scanFolder('Legacy', { start: '2026-06-01', end: '2026-06-30' });
    const session = await service.createImport(scan);
    const imported = await service.importSessionToDailyNotes(session);

    check(imported.createdPaths.length === 6, 'system import creates dated TideLog daily notes for missing days');
    check(imported.appendedPaths.length === 1 && imported.appendedPaths[0] === 'Daily/2026-06-03.md', 'system import appends to an existing same-day daily note');
    check(harness.nodes.get('Daily/2026-06-01.md').content.includes('type: daily'), 'created daily note uses TideLog daily frontmatter');
    check(harness.nodes.get('Daily/2026-06-01.md').content.includes('legacy-import'), 'created daily note records legacy-import tag');
    check(harness.nodes.get('Daily/2026-06-01.md').content.includes('### 旧日记导入'), 'created daily note places legacy content under review import section');
    check(harness.nodes.get('Daily/2026-06-03.md').content.includes('已有复盘') && harness.nodes.get('Daily/2026-06-03.md').content.includes('### 旧日记导入'), 'existing daily note keeps content and appends import section');

    const repeated = await service.importSessionToDailyNotes(session);
    check(repeated.skippedPaths.length === 7, 'repeating system import skips already imported source journals');
    check([...originals.entries()].every(([pathName, content]) => harness.nodes.get(pathName).content === content), 'system import leaves original old journals unchanged');

    const selfPath = 'Daily/2026-06-03.md';
    const beforeSelfImport = harness.nodes.get(selfPath).content;
    const selfImport = await service.importSessionToDailyNotes({
        ...session,
        normalizedEntries: [{ ...session.normalizedEntries[2], sourcePath: selfPath }],
    });
    check(selfImport.skippedPaths[0] === selfPath, 'a daily note selected as its own source is skipped');
    check(harness.nodes.get(selfPath).content === beforeSelfImport, 'self-import never appends a duplicate copy of the note');
}

console.log('\nTest 6: prompt/report standard requires the five Aha modules and evidence');
{
    const entries = [1, 2, 3, 4, 5, 6, 7].map(i => ({
        date: `2026-06-${String(i).padStart(2, '0')}`,
        sourcePath: `Legacy/2026-06-${String(i).padStart(2, '0')}.md`,
        sourceCopyPath: `Archive/Imports/x/source/${i}.md`,
        normalizedPath: `Archive/Imports/x/normalized/${i}.md`,
        sourceMtime: moment(`2026-06-${String(i).padStart(2, '0')}`).valueOf(),
        dateSource: 'filename',
        summary: makeLongBody(`摘要${i}`).slice(0, 80),
        analyzableBody: makeLongBody(`正文${i}`),
        candidateTopics: ['验证', '焦虑', '反馈'],
        signals: { tasks: ['任务：找用户反馈'], emotions: ['情绪：焦虑'], reflections: ['反思：准备替代行动'] },
    }));
    const prompt = buildFirstInsightPrompt({
        currentProfile: '# 用户画像\n\n旧内容',
        entries,
        importId: 'legacy-test',
        dateRange: { start: '2026-06-01', end: '2026-06-30' },
    });
    check(prompt.includes('过去记录里的三个高频主题'), 'first insight prompt requires high-frequency themes');
    check(prompt.includes('一个反复出现的行为模式'), 'first insight prompt requires repeated behavior pattern');
    check(prompt.includes('一个可能的盲点'), 'first insight prompt requires blind spot');
    check(prompt.includes('下周一个小实验'), 'first insight prompt requires one small experiment');
    check(prompt.includes('引用证据'), 'first insight prompt requires evidence references');
    check(prompt.includes('2-3 条原始记录'), 'first insight prompt requires 2-3 evidence records');
    check(prompt.includes('每个分析模块内部也要有引用'), 'first insight prompt requires citations inside each analytic section');
    check(prompt.includes('具体日期/文件'), 'first insight prompt requires source dates and files for behavior and blind-spot analysis');
    check(prompt.includes('观点 → 证据 → 解释'), 'first insight prompt requires a claim-evidence-interpretation section pattern');
    check(prompt.includes('它重复出现在哪些记录里'), 'first insight prompt requires repeated behavior evidence before interpretation');
    check(prompt.includes('为什么身在其中时不容易看见'), 'first insight prompt pushes the blind-spot section beyond generic summary');

    const emptyProfilePrompt = buildFirstInsightPrompt({
        currentProfile: '',
        entries,
        importId: 'legacy-empty-profile',
        dateRange: { start: '2026-06-01', end: '2026-06-30' },
    });
    check(emptyProfilePrompt.includes('暂无已有画像'), 'empty profile is handled explicitly in first insight prompt');
}

console.log('\nTest 6b: large first insight imports keep prompt excerpts compact');
{
    const entries = Array.from({ length: 66 }, (_, index) => {
        const i = index + 1;
        const overflowMarker = `SHOULD_NOT_APPEAR_${i}`;
        return {
            date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
            sourcePath: `Legacy/Nested/2026-06-${String(i).padStart(2, '0')}.md`,
            sourceCopyPath: `Archive/Imports/x/source/${i}.md`,
            normalizedPath: `Archive/Imports/x/normalized/${i}.md`,
            sourceMtime: moment('2026-06-01').valueOf(),
            dateSource: 'filename',
            summary: `摘要${i}`,
            analyzableBody: `${'批量导入正文'.repeat(80)}${overflowMarker}`,
            candidateTopics: ['验证', '焦虑', '反馈'],
            signals: { tasks: ['任务：找用户反馈'], emotions: ['情绪：焦虑'], reflections: ['反思：准备替代行动'] },
        };
    });
    const prompt = buildFirstInsightPrompt({
        currentProfile: '',
        entries,
        importId: 'legacy-large-import',
        dateRange: { start: '2026-06-01', end: '2026-06-30' },
    });

    check(prompt.includes('Legacy/Nested/2026-06-01.md'), 'large-import prompt keeps source paths for citations');
    check(!prompt.includes('SHOULD_NOT_APPEAR_1'), 'large-import prompt trims long body excerpts before late content');
    check(prompt.length < 65000, 'large-import prompt stays below a compact prompt budget', `actual length: ${prompt.length}`);
}

console.log('\nTest 7: generation is preview-only until user confirms profile save');
{
    const harness = createVaultHarness();
    harness.ensureFolder('Legacy');
    for (let i = 1; i <= 7; i++) {
        harness.addFile(`Legacy/2026-06-${String(i).padStart(2, '0')}.md`, makeLongBody(`保存${i}`), moment(`2026-06-${String(i).padStart(2, '0')}`).valueOf());
    }
    const aiResponse = `# 首次洞察画像报告

## 过去记录里的三个高频主题
- 产品验证：证据来自 2026-06-01、2026-06-02。

## 一个反复出现的行为模式
- 反馈不明确时，会倾向于增加准备工作。

## 一个可能的盲点
- 证据强度：中等。可能把更多准备误认为更接近结果。

## 下周一个小实验
- 只找 5 个用户完成一次安装。

## 引用证据
- 2026-06-01 [[Legacy/2026-06-01.md]]：提到先准备资料。
- 2026-06-02 [[Legacy/2026-06-02.md]]：提到反馈不明确。

<profile_update>
# 用户画像

## 过去记录里的三个高频主题
- 产品验证、收入焦虑、效率怀疑。

## 一个反复出现的行为模式
- 反馈不明确时增加准备工作。

## 一个可能的盲点
- 证据强度：中等。

## 下周一个小实验
- 找 5 个用户完成首次安装。

## 引用证据
- 2026-06-01 [[Legacy/2026-06-01.md]]
</profile_update>`;

    const plugin = makePlugin(harness, aiResponse);
    const legacy = new LegacyImportService(plugin);
    const firstInsight = new FirstInsightService(plugin);
    const scan = await legacy.scanFolder('Legacy', { start: '2026-06-01', end: '2026-06-30' });
    const session = await legacy.createImport(scan);
    const draft = await firstInsight.generateFirstInsight(session);
    const originalWarn = console.warn;
    let streamWarningCaptured = false;
    let draftWithPreviewError;
    console.warn = () => { streamWarningCaptured = true; };
    try {
        draftWithPreviewError = await firstInsight.generateFirstInsight(session, () => {
            throw new Error('preview render failed');
        });
    } finally {
        console.warn = originalWarn;
    }

    check(hasRequiredAhaModules(draft.report), 'visible report contains all five required modules');
    check(hasRequiredAhaModules(draftWithPreviewError.report), 'preview stream callback errors do not block report generation');
    check(streamWarningCaptured, 'preview stream callback errors are reported without hanging');
    check(makePlugin.lastFeature === 'profile' && makePlugin.lastResponseMode === 'buffered', 'first insight explicitly uses the buffered profile transport');
    check(typeof makePlugin.lastSessionId === 'string' && makePlugin.lastSessionId.length > 0, 'buffered first insight keeps a quota session id');
    check(extractProfileUpdate(aiResponse).includes('# 用户画像'), 'profile update is extracted from hidden tag');
    check(!stripProfileTags(aiResponse).includes('profile_update'), 'visible report strips hidden profile tag');
    check(!stripProfileTags(`${draft.report}\n\n<profile_update>\n# 用户画像\n\n- 流式内部画像`).includes('流式内部画像'), 'streaming preview hides incomplete internal profile blocks');
    check(!harness.nodes.has('Archive/user_profile.md'), 'generation preview does not write user_profile.md');

    await firstInsight.saveInitialProfile(draft);
    const profile = harness.nodes.get('Archive/user_profile.md');
    const report = [...harness.nodes.values()].find(node => node instanceof TFile && node.path.includes('首次洞察画像报告'));
    check(!!profile, 'confirmed save writes user_profile.md');
    check(profile.content.includes('过去记录里的三个高频主题'), 'saved profile contains Aha modules');
    check(profile.content.includes('> [!tl-profile]') && profile.content.includes('> [!tl-evidence]') && profile.content.includes('> [!tl-experiment]'), 'saved profile uses the optimized TideLog document callouts');
    check(/^##\s+🧭\s+Aha Moment/m.test(profile.content), 'saved profile uses a sparse emoji section marker');
    check(!!report && report.content.includes('导入 ID'), 'confirmed save archives the first insight report');
    check(!!report && report.content.includes('> [!tl-report]') && report.content.includes('> [!tl-pattern]') && report.content.includes('> [!tl-evidence]'), 'first insight report archive uses optimized TideLog document callouts');
    check(plugin.settings.firstInsightCompleted === true, 'confirmed save marks first insight as completed');
}

console.log('\nTest 7b: buffered or profile-only AI responses still produce a savable report');
{
    const harness = createVaultHarness();
    harness.ensureFolder('Legacy');
    for (let i = 1; i <= 3; i++) {
        harness.addFile(
            `Legacy/2026-07-0${i}.md`,
            makeLongBody(`缓冲返回${i}`),
            moment(`2026-07-0${i}`).valueOf(),
        );
    }
    const plugin = makePlugin(harness, '', '');
    plugin.getAIProvider = () => ({
        // 模拟代理只返回最终字符串、不触发 onChunk，并且只给 profile_update。
        sendMessage: async () => FIRST_INSIGHT_AHA_REPORT.match(/<profile_update>[\s\S]*<\/profile_update>/)?.[0] ?? '',
    });
    const legacy = new LegacyImportService(plugin);
    const firstInsight = new FirstInsightService(plugin);
    const scan = await legacy.scanFolder('Legacy');
    const draft = await firstInsight.generateFirstInsight(await legacy.createImport(scan));

    check(draft.report.trim().length > 0, 'a returned final string is used when no stream chunks arrive');
    check(hasRequiredAhaModules(draft.report), 'a profile-only response is also used as the visible report fallback');
    check(draft.report.includes('# 🧭 首次洞察画像报告'), 'the profile-only fallback still receives the report title');
    await firstInsight.saveInitialProfile(draft);
    const report = [...harness.nodes.values()].find(node => node instanceof TFile && node.path.includes('首次洞察画像报告'));
    check(!!report, 'the buffered fallback can be saved instead of failing with an empty draft');
}

console.log('\nTest 8: profile structure guard fills missing modules without duplicating existing sections');
{
    const oldProfile = '# 用户画像\n\n## 情绪特征\n\n- 容易焦虑。';
    const upgraded = ensureProfileAhaStructure(oldProfile);
    check(upgraded.includes('## 过去记录里的三个高频主题'), 'old profile gains missing Aha modules');
    check(upgraded.includes('## 引用证据'), 'old profile gains evidence module');

    const overlapping = ensureProfileAhaStructure('# 用户画像\n\n## 一个反复出现的行为模式\n\n- 已有模式。');
    const behaviorMatches = overlapping.match(/## 一个反复出现的行为模式/g) ?? [];
    check(behaviorMatches.length === 1, 'profile guard does not duplicate existing Aha heading');
}

console.log('\nTest 9: first insight UI reuses existing Insights visual language');
{
    const modalSource = fs.readFileSync(path.join(__dirname, 'src/views/first-insight-modal.ts'), 'utf8');
    const onboardingSource = fs.readFileSync(path.join(__dirname, 'src/views/onboarding-modal.ts'), 'utf8');
    const insightsSource = fs.readFileSync(path.join(__dirname, 'src/views/insights-renderer.ts'), 'utf8');
    const settingsSource = fs.readFileSync(path.join(__dirname, 'src/settings/settings-tab.ts'), 'utf8');
    const mainSource = fs.readFileSync(path.join(__dirname, 'src/main.ts'), 'utf8');
    const eveningSource = fs.readFileSync(path.join(__dirname, 'src/sop/evening-sop.ts'), 'utf8');
    const zhSource = fs.readFileSync(path.join(__dirname, 'src/i18n/zh.ts'), 'utf8');
    const enSource = fs.readFileSync(path.join(__dirname, 'src/i18n/en.ts'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
    check(modalSource.includes('tl-insights-card') && modalSource.includes('tl-insights-primary-btn'), 'first insight modal reuses Insights card and button classes');
    check(modalSource.includes('tl-insights-notice') && !modalSource.includes('tl-insights-stream'), 'first insight modal keeps notices but removes the in-modal report stream');
    check(modalSource.includes('tl-first-insight-stepper'), 'first insight modal renders a compact three-step flow');
    check(modalSource.includes('importSessionToDailyNotes') && modalSource.includes('tl-first-insight-system-import-option'), 'first insight modal exposes optional one-click system import');
    check(!modalSource.includes("type: 'date'") && !modalSource.includes('startInputEl') && !modalSource.includes('endInputEl'), 'first insight modal asks for folder only and does not render date inputs');
    check(modalSource.includes('tl-first-insight-folder-tree') && modalSource.includes('renderFolderTree'), 'first insight modal renders a hierarchical folder tree instead of a flat folder list');
    check(!modalSource.includes("createEl('select', { cls: 'tl-first-insight-folder-select'"), 'first insight modal no longer renders all vault folders as one flat select');
    check(modalSource.includes('resetGeneratedStateForFolderChange') && modalSource.includes("addEventListener('change', resetGeneratedState"), 'folder changes reset generated state for another first insight run');
    check(onboardingSource.includes('tl-onboarding-first-insight'), 'onboarding contains a dedicated first insight CTA');
    check(!onboardingSource.includes('hasConfiguredAI'), 'onboarding no longer branches on API configuration (AI is provided by TideLog)');
    check(insightsSource.includes('firstInsightCompleted') && insightsSource.includes('return;'), 'Insights hides the first insight entry after the initial profile is saved');
    const renderProfileSource = insightsSource.slice(insightsSource.indexOf('private async renderProfile'), insightsSource.indexOf('private async generateReport'));
    check(renderProfileSource.indexOf('if (this.shouldShowFirstInsightEntry())') < renderProfileSource.indexOf("const card = body.createDiv('tl-insights-card');"), 'profile Insights shows old-journal entry instead of the default AI profile card before initial profile is saved');
    check(insightsSource.includes("this.host.insightsMode === 'profile'") && insightsSource.includes('this.renderFirstInsightEntry(panel);'), 'locked profile Insights also uses the old-journal entry as the single card');
    check(settingsSource.includes("setName(t('settings.legacyImportTitle'))") && settingsSource.includes('openFirstInsight'), 'settings keeps a compact legacy import action for later imports');
    check(mainSource.includes('this.settings.firstInsightCompleted && !this.licenseManager.isPro()'), 'initial profile stays free once while later old-journal profile runs require trial or Pro');
    check(!modalSource.includes('showTrialOfferOnce') && eveningSource.includes('showTrialOfferOnce'), 'opening a new profile report is never covered by a trial modal; review may still offer trial contextually');
    check(insightsSource.includes('renderSavedFirstInsight') && insightsSource.includes('findLatestFirstInsightReport'), 'free users can reopen their saved first profile report');
    check(insightsSource.includes("this.renderTrialBanner(body, 'active')") && insightsSource.includes("this.renderTrialBanner(body, 'expired')"), 'trial purchase state is centralized in the top Insights banner');
    check(!insightsSource.includes('renderEarnedValue') && !css.includes('.tl-insights-earned-value'), 'weekly, monthly, and profile cards omit scattered conversion blocks');
    check(css.includes('.modal.tl-first-insight-shell') && css.includes('.tl-first-insight-system-import-option') && css.includes('.tl-first-insight-confirm'), 'first insight CSS covers modal shell, optional import, and final save action');
    check(css.includes('button.tl-first-insight-folder-node.is-selected') && css.includes('content: "✓"') && css.includes('var(--interactive-accent)'), 'selected folders have a theme-visible border and checkmark');
    check(css.includes('.tl-first-insight-modal {') && css.includes('.tl-chat-container,') && css.includes('.tl-first-insight-modal {'), 'first insight modal receives TideLog design tokens');
    check(!modalSource.toLowerCase().includes('token') && !modalSource.includes('费用'), 'first insight UI does not show token or cost estimates');
    check(zhSource.includes("'firstInsight.stepScan': '分析记录'") && enSource.includes("'firstInsight.stepScan': 'Analyze records'"), 'first insight stepper uses user-facing analyze-records wording');
    check(modalSource.includes('buildGenerationEstimate') && modalSource.includes('scan.validCount <= 12'), 'first insight uses an estimate calibrated to the bounded request size');
    check(!modalSource.includes('formatRemainingMinutes') && modalSource.includes('window.setTimeout'), 'first insight avoids a false minute-by-minute countdown');
    check(modalSource.includes('tl-first-insight-generating-status') && css.includes('.tl-first-insight-generating-status'), 'first insight generation status is shown near the loading button');
    check(modalSource.includes('window.setTimeout(() => this.revealElement(actionCard), 120') && modalSource.includes('container.scrollTo'), 'first insight scrolls to the save action after completion');
    check(!zhSource.includes('已等待') && !zhSource.includes('elapsedSeconds') && !enSource.includes('Elapsed:'), 'first insight generation copy does not show elapsed time');
    check(!zhSource.includes('不代表失败') && zhSource.includes('模型仍在整理证据'), 'long-running generation copy is honest without pretending to know remaining time');
    check(zhSource.includes('estimateMinutesRange') && zhSource.includes('remainingMinutesRange'), 'first insight generation uses conservative time ranges instead of a precise single minute');
    check(zhSource.includes("'firstInsight.generatedBtn': '已经生成完成'") && css.includes('.tl-insights-primary-btn-complete:disabled'), 'completed generation button has a distinct finished state');
    const estimateHarness = createVaultHarness();
    const estimatePlugin = makePlugin(estimateHarness);
    const estimateModal = new FirstInsightModal(estimatePlugin.app, estimatePlugin);
    const sevenShortJournalEstimate = estimateModal.buildGenerationEstimate({
        validCount: 7,
        validEntries: Array.from({ length: 7 }, () => ({ analyzableBody: 'x'.repeat(226) })),
    });
    check(
        sevenShortJournalEstimate.minSeconds === 60 && sevenShortJournalEstimate.maxSeconds === 60,
        'up to 12 journals show a simple one-minute estimate',
    );
    const twelveJournalEstimate = estimateModal.buildGenerationEstimate({
        validCount: 12,
        validEntries: Array.from({ length: 12 }, (_, index) => ({ body: `entry-${index}` })),
    });
    check(twelveJournalEstimate.maxSeconds === 60, '12 journals still show about one minute');
    const thirteenJournalEstimate = estimateModal.buildGenerationEstimate({
        validCount: 13,
        validEntries: Array.from({ length: 13 }, (_, index) => ({ body: `entry-${index}` })),
    });
    check(thirteenJournalEstimate.maxSeconds === 180, 'larger selections keep the broad one-to-three-minute estimate');
    const sixtySixShortJournalEstimate = estimateModal.buildGenerationEstimate({
        validCount: 66,
        validEntries: Array.from({ length: 66 }, () => ({ analyzableBody: 'x'.repeat(173) })),
    });
    check(sixtySixShortJournalEstimate.maxSeconds <= 720, '66 short journals no longer show a 20-minute upper estimate', JSON.stringify(sixtySixShortJournalEstimate));
    check(zhSource.includes('正在分析 {0} 篇记录，通常需要 {1}') && enSource.includes('Analyzing {0} records. This usually takes {1}'), 'first insight wait copy stays limited to count and broad timing');
    // 校验承诺的要素而不是措辞：原文留在本地 + 不保存 + 不用于训练。
    // 措辞可以改，承诺不能消失——托管 AI 下这三条是对用户的实质保证。
    check(
        zhSource.includes('不改动原文') && zhSource.includes('不保存') && zhSource.includes('不用于训练')
        && enSource.includes('Your privacy matters') && enSource.includes('never edits, stores, or trains'),
        'first insight copy keeps the essential privacy promises in compact form',
    );
    check(css.includes('.tl-first-insight-privacy-note') && css.includes('.tl-onboarding-privacy-note'), 'privacy notes reuse lightweight card styling');

    const createChatViewHarness = (firstInsightCompleted) => {
        const harness = createVaultHarness();
        const plugin = makePlugin(harness);
        plugin.settings.firstInsightCompleted = firstInsightCompleted;
        const view = new ChatView({ app: plugin.app }, plugin);
        view.getDefaultPlanDate = async () => moment('2026-08-21');
        view.periodicRenderer = {
            render: async panel => { panel.createDiv('tl-test-periodic-content'); },
        };
        view.insightsRenderer = {
            render: async panel => { panel.createDiv('tl-test-insights-content'); },
        };
        return { plugin, view };
    };

    const fresh = createChatViewHarness(false);
    await fresh.view.onOpen();
    await flush();
    check(
        fresh.view.activeTab === 'kanban'
            && fresh.view.contentEl.querySelector('.tl-tab-bar-wrap')?.getAttribute('data-active-tab') === 'kanban'
            && fresh.view.contentEl.querySelector('.tl-tab-btn-active')?.getAttribute('data-tab') === 'kanban',
        'fresh users actually render Plan as the active initial tab',
    );
    check(fresh.view.contentEl.querySelectorAll('.tl-plan-first-insight-hint').length === 1, 'fresh users render exactly one first-profile Plan hint');

    const hintButton = fresh.view.contentEl.querySelector('.tl-plan-first-insight-hint-btn');
    hintButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    check(!!hintButton && fresh.view.insightsMode === 'profile', 'clicking the Plan hint opens Insights in profile mode');

    await fresh.view.switchTab('kanban', false);
    await flush();
    fresh.view.insightsMode = 'weekly';
    fresh.view.contentEl.querySelector('.tl-tab-btn[data-tab="review"]')
        ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    check(fresh.view.insightsMode === 'profile', 'the Insights top-level tab defaults incomplete users to profile mode');

    await fresh.view.switchTab('kanban', false);
    await fresh.view.switchTab('kanban', false);
    await flush();
    check(fresh.view.contentEl.querySelectorAll('.tl-plan-first-insight-hint').length === 1, 'rerendering Plan does not duplicate the first-profile hint');
    fresh.plugin.settings.firstInsightCompleted = true;
    await fresh.view.switchTab('kanban', false);
    await flush();
    check(fresh.view.contentEl.querySelectorAll('.tl-plan-first-insight-hint').length === 0, 'the Plan hint disappears after first insight completion');
    await fresh.view.onClose();

    const completed = createChatViewHarness(true);
    completed.view.insightsMode = 'profile';
    await completed.view.onOpen();
    await flush();
    check(
        completed.view.activeTab === 'kanban'
            && completed.view.contentEl.querySelector('.tl-tab-bar-wrap')?.getAttribute('data-active-tab') === 'kanban',
        'completed users actually render Plan as the active initial tab',
    );
    check(completed.view.contentEl.querySelectorAll('.tl-plan-first-insight-hint').length === 0, 'completed users do not render the first-profile Plan hint');
    completed.view.contentEl.querySelector('.tl-tab-btn[data-tab="review"]')
        ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    check(completed.view.insightsMode === 'weekly', 'the Insights top-level tab defaults completed users to weekly mode');
    await completed.view.onClose();

    const belowMinimum = FIRST_INSIGHT_MIN_VALID_ENTRIES - 1;
    setLanguage('zh');
    check(
        t('firstInsight.tooFewNotice', belowMinimum, FIRST_INSIGHT_MIN_VALID_ENTRIES)
            === `目前只有 ${belowMinimum} 篇内容足够分析。至少需要 ${FIRST_INSIGHT_MIN_VALID_ENTRIES} 篇，才能生成一份像样的画像报告。`,
        'Chinese first-insight notice interpolates the shared journal threshold',
    );
    check(
        t('firstInsight.errorTooFewValid', belowMinimum, FIRST_INSIGHT_MIN_VALID_ENTRIES)
            === `有效日记只有 ${belowMinimum} 篇，至少需要 ${FIRST_INSIGHT_MIN_VALID_ENTRIES} 篇。`,
        'Chinese first-insight error interpolates the shared journal threshold',
    );
    setLanguage('en');
    check(
        t('firstInsight.tooFewNotice', belowMinimum, FIRST_INSIGHT_MIN_VALID_ENTRIES)
            === `Only ${belowMinimum} records are strong enough to analyze. At least ${FIRST_INSIGHT_MIN_VALID_ENTRIES} are needed for a useful profile report.`,
        'English first-insight notice interpolates the shared journal threshold',
    );
    check(
        t('firstInsight.errorTooFewValid', belowMinimum, FIRST_INSIGHT_MIN_VALID_ENTRIES)
            === `Only ${belowMinimum} valid journals found. At least ${FIRST_INSIGHT_MIN_VALID_ENTRIES} are required.`,
        'English first-insight error interpolates the shared journal threshold',
    );
    setLanguage('zh');
}

console.log('\nTest 9b: first insight folder tree has clear desktop-style navigation');
{
    const harness = createVaultHarness();
    harness.ensureFolder('Legacy');
    harness.ensureFolder('Other-Journals/2025/June');
    harness.ensureFolder('Other-Journals/2026');

    const plugin = makePlugin(harness);
    plugin.legacyImportService = new LegacyImportService(plugin);
    plugin.firstInsightService = new FirstInsightService(plugin);

    const modal = new FirstInsightModal(plugin.app, plugin);
    modal.onOpen();
    document.body.appendChild(modal.contentEl);

    const tree = modal.contentEl.querySelector('.tl-first-insight-folder-tree');
    const folderInput = modal.contentEl.querySelector('input.tl-first-insight-folder-value, input[type="text"]');
    const otherBranch = modal.contentEl.querySelector('details[data-folder-path="Other-Journals"]');
    const otherNode = modal.contentEl.querySelector('.tl-first-insight-folder-node[data-folder-path="Other-Journals"]');
    const otherToggle = otherBranch?.querySelector('.tl-first-insight-folder-toggle');

    check(tree?.getAttribute('role') === 'tree', 'folder tree exposes tree semantics for desktop-style navigation');
    check(!!modal.contentEl.querySelector('.tl-first-insight-folder-selected-label'), 'selected folder display has a readable label');
    check(!!otherToggle, 'branch rows render a real chevron toggle target');
    check(!!modal.contentEl.querySelector('.tl-first-insight-folder-spacer'), 'leaf rows reserve chevron space so names align with branches');
    check(otherNode?.getAttribute('role') === 'treeitem', 'folder rows expose treeitem semantics');
    check(otherBranch && !otherBranch.open, 'non-default branch starts collapsed');

    otherNode?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check(folderInput?.value === 'Other-Journals', 'clicking a branch row selects that folder');
    check(otherBranch?.open === true, 'clicking a branch row expands it so child folders become visible');
    check(otherNode?.getAttribute('aria-selected') === 'true', 'selected branch uses aria-selected rather than toggle-button pressed state');
    check(otherNode?.getAttribute('aria-expanded') === 'true', 'expanded branch updates aria-expanded');

    selectFolderInModal(modal, 'Legacy');
    otherToggle?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check(otherBranch?.open === false, 'clicking the chevron collapses the branch');
    check(folderInput?.value === 'Legacy', 'chevron collapse only browses the tree and does not change selected folder');
    check(otherNode?.getAttribute('aria-expanded') === 'false', 'collapsed branch updates aria-expanded');

    otherNode?.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    check(otherBranch?.open === true, 'ArrowRight expands a focused branch row');
    otherNode?.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    check(otherBranch?.open === false, 'ArrowLeft collapses a focused branch row');

    modal.contentEl.remove();
}

console.log('\nTest 10: first insight modal walks through scan, generate, optional import, and confirmed save');
{
    const harness = createVaultHarness();
    harness.ensureFolder('Legacy');
    const originals = new Map();
    for (let i = 1; i <= 7; i++) {
        const pathName = `Legacy/2026-06-${String(i).padStart(2, '0')}.md`;
        const file = harness.addFile(pathName, makeLongBody(`端到端${i}`), moment(`2026-06-${String(i).padStart(2, '0')}`).valueOf());
        originals.set(file.path, file.content);
    }
    harness.addFile('Legacy/2026-06-08-short.md', '太短', moment('2026-06-08').valueOf());

    const aiResponse = `# 首次洞察画像报告

## 过去记录里的三个高频主题
- 产品验证：证据来自 2026-06-01、2026-06-03、2026-06-05。

## 一个反复出现的行为模式
- 外部反馈不清晰时，会先扩充准备材料，再推迟直接验证。

## 一个可能的盲点
- 证据强度：中等。可能把准备动作误认为结果推进。

## 下周一个小实验
- 未来 7 天只找 5 个用户完成一次安装，不新增功能。

## 引用证据
- 2026-06-01 [[Legacy/2026-06-01.md]]：记录了先准备资料。
- 2026-06-03 [[Legacy/2026-06-03.md]]：记录了反馈不明确。

<profile_update>
# 用户画像

## 过去记录里的三个高频主题
- 产品验证、反馈焦虑、效率怀疑。

## 一个反复出现的行为模式
- 反馈不明确时增加准备工作。

## 一个可能的盲点
- 证据强度：中等。

## 下周一个小实验
- 找 5 个用户完成首次安装。

## 引用证据
- 2026-06-01 [[Legacy/2026-06-01.md]]
</profile_update>`;

    const plugin = makePlugin(harness, aiResponse, '');
    plugin.settings.dailyFolder = 'Daily';
    plugin.legacyImportService = new LegacyImportService(plugin);
    plugin.firstInsightService = new FirstInsightService(plugin);

    const modal = new FirstInsightModal(plugin.app, plugin);
    modal.onOpen();
    document.body.appendChild(modal.contentEl);

    const folderInput = modal.contentEl.querySelector('input.tl-first-insight-folder-value, input[type="text"]');
    const systemImportToggle = modal.contentEl.querySelector('.tl-first-insight-system-import-option input');
    const dateInputs = modal.contentEl.querySelectorAll('input[type="date"]');
    selectFolderInModal(modal, 'Legacy');
    systemImportToggle.checked = true;
    systemImportToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
    check(dateInputs.length === 0, 'modal setup does not ask users to enter dates');
    check(!!modal.contentEl.querySelector('.tl-first-insight-folder-tree'), 'modal setup renders a folder tree');
    check(folderInput?.value === 'Legacy', 'folder tree click selects the old-journal folder');
    check(modal.contentEl.textContent.includes('把这些日记加入 TideLog'), 'modal offers optional one-click system import');

    const generateButton = [...modal.contentEl.querySelectorAll('button')]
        .find(button => button.textContent.includes('生成我的首次画像'));
    check(!!generateButton && !generateButton.disabled, 'modal starts with one direct generation action');
    generateButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    await waitFor(
        () => modal.contentEl.textContent.includes('共找到 7 篇可分析日记，分析通常需要 1 分钟左右'),
        'modal gives small journal sets a concise user-facing estimate',
    );
    check(!modal.contentEl.textContent.includes('本次将全部读取'), 'small-set copy does not explain internal selection rules');
    check(modal.contentEl.textContent.includes('通常需要'), 'modal scan preview shows a broad estimate before report generation completes');
    check(modal.contentEl.textContent.includes('Legacy · 2026-06-01 至 2026-06-07'), 'modal scan preview shows the actual selected journal range');
    check(!modal.contentEl.querySelector('.tl-first-insight-excluded'), 'successful scans do not add a long exclusion list to the generation screen');
    const primaryActions = [...modal.contentEl.querySelectorAll('button')]
        .filter(button => button.textContent.includes('生成我的首次画像'));
    check(primaryActions.length <= 1, 'modal does not render a second confirmation step before generation');

    await waitFor(
        () => !!modal.contentEl.querySelector('.tl-first-insight-confirm'),
        'modal renders the final save action',
    );
    check(generateButton.textContent.includes('已经生成完成') && generateButton.disabled, 'modal marks the generate button as completed after report generation');
    check(!modal.contentEl.textContent.includes('你的首次画像报告'), 'modal does not duplicate the saved report title');
    check(!modal.contentEl.textContent.includes('重点看具体模式') && !modal.contentEl.textContent.includes('引用证据'), 'modal does not preview report modules after generation');
    check(modal.contentEl.querySelector('.tl-first-insight-confirm')?.textContent.includes('报告完成'), 'the final card has one clear completion label');
    check(!modal.contentEl.querySelector('.tl-first-insight-confirm .tl-insights-card-desc'), 'the final card contains no extra explanatory paragraph');
    check(!harness.nodes.has('Archive/user_profile.md'), 'modal generation still does not write user_profile.md before confirmation');

    const sourceCopies = [...harness.nodes.keys()].filter(key => key.includes('/source/') && key.endsWith('.md'));
    const normalizedCopies = [...harness.nodes.keys()].filter(key => key.includes('/normalized/') && key.endsWith('.md'));
    check(sourceCopies.length === 7, 'modal generation writes source copies for valid journals only');
    check(normalizedCopies.length === 7, 'modal generation writes normalized copies for valid journals only');
    const dailyImports = [...harness.nodes.keys()].filter(key => key.startsWith('Daily/') && key.endsWith('.md'));
    check(dailyImports.length === 7, 'modal optional import writes TideLog dated daily notes');
    check(harness.nodes.get('Daily/2026-06-01.md').content.includes('### 旧日记导入'), 'modal optional import adds legacy content to the daily note format');
    check([...originals.entries()].every(([pathName, content]) => harness.nodes.get(pathName).content === content), 'modal walkthrough leaves original journals unchanged');

    const saveButton = [...modal.contentEl.querySelectorAll('button')]
        .find(button => button.textContent.includes('保存并打开完整报告'));
    check(!!saveButton, 'modal renders explicit save-confirmation action');
    saveButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    await waitFor(
        () => harness.nodes.has('Archive/user_profile.md'),
        'modal confirmed save writes user_profile.md',
    );
    const profile = harness.nodes.get('Archive/user_profile.md');
    const report = [...harness.nodes.values()].find(node => node instanceof TFile && node.path.includes('首次洞察画像报告'));
    check(profile.content.includes('过去记录里的三个高频主题'), 'modal saved profile keeps five-module standard');
    check(profile.content.includes('> [!tl-profile]') && profile.content.includes('> [!tl-caution]'), 'modal saved profile keeps optimized document callouts');
    check(!!report && report.content.includes('导入 ID'), 'modal confirmed save archives report with import id');
    check(!!report && report.content.includes('> [!tl-report]') && report.content.includes('> [!tl-experiment]'), 'modal archived report keeps optimized document callouts');
    check(plugin.__opened.some(pathName => pathName.includes('首次洞察画像报告')), 'modal opens the full saved report after confirmation');
    await waitFor(
        () => plugin.__lifecycle.completed === 1,
        'saved profile completes onboarding',
    );
    check(plugin.__lifecycle.completed === 1, 'onboarding completes only after the profile is saved');
    check(plugin.__lifecycle.trialOffers.length === 0, 'saved report is not covered by a contextual trial offer');

    modal.contentEl.remove();
}

console.log('\nTest 10b: onboarding handoff skips duplicate folder selection and hides report UI while generating');
{
    const harness = createVaultHarness();
    harness.ensureFolder('Legacy');
    for (let i = 1; i <= 5; i++) {
        harness.addFile(
            `Legacy/2026-07-0${i}.md`,
            makeLongBody(`直接生成${i}`),
            moment(`2026-07-0${i}`).valueOf(),
        );
    }
    const plugin = makePlugin(harness, '', '');
    let releaseResponse = () => {};
    plugin.getAIProvider = () => ({
        sendMessage: async (_messages, _systemPrompt, onChunk) => new Promise((resolve) => {
            releaseResponse = () => {
                onChunk(FIRST_INSIGHT_AHA_REPORT);
                resolve(FIRST_INSIGHT_AHA_REPORT);
            };
        }),
    });
    plugin.legacyImportService = new LegacyImportService(plugin);
    plugin.firstInsightService = new FirstInsightService(plugin);

    const modal = new FirstInsightModal(plugin.app, plugin, 'Legacy');
    modal.onOpen();
    document.body.appendChild(modal.contentEl);

    check(!modal.contentEl.querySelector('.tl-first-insight-folder-tree'), 'a folder confirmed in onboarding is not requested a second time');
    check(!modal.contentEl.querySelector('.tl-first-insight-setup-card') && !modal.contentEl.querySelector('.tl-first-insight-stepper'), 'direct mode skips the verbose setup screen');
    await waitFor(
        () => !!modal.contentEl.querySelector('.tl-first-insight-generating-status'),
        'direct mode starts generation automatically',
    );
    check(!modal.contentEl.querySelector('.tl-first-insight-report-card'), 'no report card appears while the model is still generating');
    check(!modal.contentEl.textContent.includes('你的首次画像报告'), 'the report title is hidden until the full file is opened');
    check(!modal.contentEl.querySelector('.tl-first-insight-confirm'), 'the save action does not appear before generation finishes');

    releaseResponse();
    await waitFor(
        () => !!modal.contentEl.querySelector('.tl-first-insight-confirm'),
        'direct mode shows the save action after generation completes',
    );
    const confirm = modal.contentEl.querySelector('.tl-first-insight-confirm');
    check(confirm?.textContent.includes('报告完成') && confirm?.textContent.includes('保存并打开完整报告'), 'completion contains only the completion label and save action');
    check(!modal.contentEl.querySelector('.tl-first-insight-direct-controls'), 'the generation control disappears after success');
    check(!modal.contentEl.querySelector('.tl-first-insight-report-card'), 'no duplicate report preview is added after success');

    modal.contentEl.remove();
}

console.log('\nTest 11: first insight completed button resets when the folder changes');
{
    const harness = createVaultHarness();
    harness.ensureFolder('Legacy');
    harness.ensureFolder('Other-Journals');
    for (let i = 1; i <= 7; i++) {
        harness.addFile(
            `Legacy/2026-06-${String(i).padStart(2, '0')}.md`,
            makeLongBody(`重置${i}`),
            moment(`2026-06-${String(i).padStart(2, '0')}`).valueOf(),
        );
    }

    const aiResponse = `# 首次洞察画像报告

## 过去记录里的三个高频主题
- 主题一。

## 一个反复出现的行为模式
- 模式。

## 一个可能的盲点
- 盲点。

## 下周一个小实验
- 实验。

## 引用证据
- 2026-06-01 [[Legacy/2026-06-01.md]]

<profile_update>
# 用户画像

## 过去记录里的三个高频主题
- 主题一。

## 一个反复出现的行为模式
- 模式。

## 一个可能的盲点
- 盲点。

## 下周一个小实验
- 实验。

## 引用证据
- 2026-06-01 [[Legacy/2026-06-01.md]]
</profile_update>`;

    const plugin = makePlugin(harness, aiResponse, '');
    plugin.legacyImportService = new LegacyImportService(plugin);
    plugin.firstInsightService = new FirstInsightService(plugin);

    const modal = new FirstInsightModal(plugin.app, plugin);
    modal.onOpen();
    document.body.appendChild(modal.contentEl);

    const folderInput = modal.contentEl.querySelector('input.tl-first-insight-folder-value, input[type="text"]');
    selectFolderInModal(modal, 'Legacy');
    const generateButton = [...modal.contentEl.querySelectorAll('button')]
        .find(button => button.textContent.includes('生成我的首次画像'));
    generateButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    await waitFor(
        () => generateButton.textContent.includes('已经生成完成'),
        'modal marks button completed before folder reset',
    );
    selectFolderInModal(modal, 'Other-Journals');

    check(folderInput?.value === 'Other-Journals', 'folder tree click updates the selected folder path');
    check(generateButton.textContent.includes('生成我的首次画像') && !generateButton.disabled, 'changing the old-journal folder restores the generate button');
    check(!modal.contentEl.textContent.includes('报告已生成'), 'changing the old-journal folder clears the previous report state');
    modal.contentEl.remove();
}


// ---------------------------------------------------------------------------
// 回归：首次画像必须自己守住服务端 32K token 输入上限
//
// 此前客户端只按篇数压缩单篇摘录长度，没有总预算：
// 100 篇 × 420 字中文正文 ≈ 42,000 token，直接触发服务端 413。
// 大 vault 反而更容易在用户最期待的动作上失败。
// ---------------------------------------------------------------------------
console.log('\nTest: 输入 token 预算');
{
    // 与服务端 api/src/ai.ts 的 estimateInputTokens 口径一致
    check(estimateTokens('abcd') === 1, 'ASCII 约 4 字符计 1 token');
    check(estimateTokens('中文') === 2, '中文按 1 字 1 token');
    check(CLIENT_INPUT_TOKEN_BUDGET < SERVER_MAX_INPUT_TOKENS, '客户端预算留有安全余量');
    check(FIRST_INSIGHT_INPUT_TOKEN_BUDGET === 20_000, '首次画像使用独立的 20K 输入上限');

    const makeEntries = (n) => Array.from({ length: n }, (_, i) => ({
        date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
        sourcePath: `Legacy/entry-${i}.md`,
        normalizedPath: `Archive/entry-${i}.md`,
        sourceMtime: Date.now(),
        dateSource: 'filename',
        summary: `摘要${i}`,
        analyzableBody: '记录内容反复出现同一个模式，'.repeat(60),
        candidateTopics: ['验证', '焦虑'],
        signals: { tasks: ['任务：找用户反馈'], emotions: ['情绪：焦虑'], reflections: ['反思：准备替代行动'] },
    }));

    const bigPrompt = buildFirstInsightPrompt({
        currentProfile: '# 用户画像',
        entries: makeEntries(200),
        importId: 'legacy-big',
        dateRange: { start: '2026-01-01', end: '2026-09-30' },
    });
    check(
        estimateTokens(bigPrompt) <= FIRST_INSIGHT_INPUT_TOKEN_BUDGET,
        `200 篇长日记的提示词仍在预算内（实际 ${estimateTokens(bigPrompt)}）`,
    );
    check(
        estimateTokens(bigPrompt) < SERVER_MAX_INPUT_TOKENS,
        '提示词不会触发服务端 413',
    );

    // 预留系统提示词后预算更紧，仍必须守住。
    const reservedPrompt = buildFirstInsightPrompt({
        currentProfile: '# 用户画像',
        entries: makeEntries(200),
        importId: 'legacy-reserved',
        dateRange: { start: '2026-01-01', end: '2026-09-30' },
        reservedTokens: 5000,
    });
    check(
        estimateTokens(reservedPrompt) <= FIRST_INSIGHT_INPUT_TOKEN_BUDGET - 5000,
        `扣除系统提示词占用后仍在预算内（实际 ${estimateTokens(reservedPrompt)}）`,
    );

    // 既有画像同时出现在 system/user prompt；不能只裁日记而让它单独穿透 32K。
    const hugeProfile = '# 用户画像\n' + '既有偏好与历史结论。'.repeat(12_000);
    const boundedProfile = boundFirstInsightCurrentProfile(hugeProfile);
    const hugeProfileSystem = buildFirstInsightSystemPrompt(boundedProfile);
    const hugeProfilePrompt = buildFirstInsightPrompt({
        currentProfile: boundedProfile,
        entries: makeEntries(200),
        importId: 'legacy-huge-profile',
        dateRange: { start: '2026-01-01', end: '2026-09-30' },
        reservedTokens: estimateTokens(hugeProfileSystem),
    });
    check(estimateTokens(boundedProfile) <= 4000, '巨大既有画像被单独截断到 4K token');
    check(
        estimateTokens(hugeProfileSystem) + estimateTokens(hugeProfilePrompt) <= FIRST_INSIGHT_INPUT_TOKEN_BUDGET,
        '巨大既有画像的 system + user prompt 总量仍在首次画像 20K 硬预算内',
    );

    // 小样本不应被无谓裁剪。
    const smallEntries = makeEntries(5);
    const smallPrompt = buildFirstInsightPrompt({
        currentProfile: '',
        entries: smallEntries,
        importId: 'legacy-small',
        dateRange: { start: '2026-06-01', end: '2026-06-05' },
    });
    check(smallPrompt.includes('有效日记数：5'), '小样本不被裁剪，篇数如实呈现');

    // 预算判断覆盖 system + user 的完整输入，而不是只看日记正文。
    const backfillEntries = makeEntries(200).map((entry, i) => ({
        ...entry,
        sourcePath: `Legacy/very-long-folder-name-for-budget-regression/entry-${i}.md`,
        normalizedPath: `Archive/Imports/legacy-budget/normalized/entry-${i}.md`,
        summary: `第 ${i} 篇摘要：准备工作与真实反馈之间的反复选择。`,
        analyzableBody: `第 ${i} 篇正文。${'这段记录包含任务、情绪、反思和下一步实验。'.repeat(80)}`,
    }));
    const backfillSystem = buildFirstInsightSystemPrompt('');
    const backfillPrompt = buildFirstInsightPrompt({
        currentProfile: '',
        entries: backfillEntries,
        importId: 'legacy-backfill',
        dateRange: { start: '2026-01-01', end: '2026-12-31' },
        reservedTokens: estimateTokens(backfillSystem),
    });
    const fullInputTokens = estimateTokens(backfillSystem) + estimateTokens(backfillPrompt);
    const keptCount = Number(backfillPrompt.match(/有效日记数：(\d+)/)?.[1] ?? 0);
    const excerpts = [...backfillPrompt.matchAll(/body_excerpt:\n([\s\S]*?)(?=\n\n--- |\n<\/normalized_journals>)/g)]
        .map(match => match[1]);
    check(fullInputTokens <= FIRST_INSIGHT_INPUT_TOKEN_BUDGET, `完整 system + user 输入不超过首次画像预算（实际 ${fullInputTokens}）`);
    check(keptCount > 0 && keptCount < backfillEntries.length, `超预算时确实减少篇数（保留 ${keptCount}/${backfillEntries.length}）`);
    check(excerpts.length === keptCount && excerpts.every(excerpt => excerpt.length >= 120), '超预算压缩仍保留每篇最小证据片段');
    check(excerpts.every(excerpt => excerpt.length <= 120), '减少篇数后不再为了填满预算重新扩张正文');

    const noDuplicateEntries = makeEntries(3).map((entry, i) => {
        const opening = `第${i}篇开头摘要完整包含在正文中。`;
        return {
            ...entry,
            summary: opening,
            analyzableBody: opening + '后续正文证据。'.repeat(80),
        };
    });
    const noDuplicatePrompt = buildFirstInsightPrompt({
        currentProfile: '',
        entries: noDuplicateEntries,
        importId: 'legacy-no-duplicate-summary',
        dateRange: { start: '2026-06-01', end: '2026-06-03' },
    });
    check(!noDuplicatePrompt.includes('summary:'), 'body_excerpt 上限不少于 240 字时不重复发送同源 summary');

    const fullReadEntries = makeEntries(3).map((entry, i) => ({
        ...entry,
        analyzableBody: `完整短日记 ${i}。${'真实正文。'.repeat(50)}FULL_BODY_END_${i}`,
    }));
    const fullReadPrompt = buildFirstInsightPrompt({
        currentProfile: '',
        entries: fullReadEntries,
        importId: 'legacy-full-read',
        dateRange: { start: '2026-06-01', end: '2026-06-03' },
    });
    check(fullReadEntries.every((_, i) => fullReadPrompt.includes(`FULL_BODY_END_${i}`)), '小库在预算内时读完每篇全文');
    check(estimateTokens(fullReadPrompt) < FIRST_INSIGHT_INPUT_TOKEN_BUDGET * 0.5, '小库读完全文后允许预算明显低于 100%，不做无意义填充');
}

console.log('\nTest: 超预算时按时间均匀抽样，保留跨度');
{
    const items = Array.from({ length: 100 }, (_, i) => i);
    const kept = sampleEvenly(items, 10);
    check(kept.length === 10, '抽样数量正确');
    check(kept[0] === 0, '保留最早一篇');
    check(kept[kept.length - 1] === 99, '保留最晚一篇——否则报告失去时间跨度');
    check(kept.every((v, i, arr) => i === 0 || v > arr[i - 1]), '抽样保持时间顺序');
    check(sampleEvenly(items, 200).length === 100, '请求数超过总数时返回全部');
    check(sampleEvenly([], 5).length === 0, '空集合安全');
    check(sampleEvenly(items, 1).length === 1, '只保留一篇时不报错');
}


// ---------------------------------------------------------------------------
// 路径 A 的失败态。
//
// 以前四种情况共用一句 `tooFewNotice`——「目前只有 N 篇内容足够分析」。
// 对选错文件夹的人，那句话把「你选错了地方」说成了「你写得不够多」，
// 而且没有给出任何可执行的下一步。这里断言四种情况彼此可分辨，
// 并且各自说出「差的是什么」。
// ---------------------------------------------------------------------------
console.log('\nTest 12: path A tells the user which of the failure modes they hit');
{
    setLanguage('zh');

    // --- 纯函数：分类规则本身 ---
    const base = { folderPath: 'X', markdownCount: 0, candidateCount: 0, validCount: 0, tooShortCount: 0 };
    check(
        diagnoseFirstInsightBlock({ ...base }) === 'no_markdown',
        'no markdown at all is diagnosed as an empty/wrong folder',
    );
    check(
        diagnoseFirstInsightBlock({ ...base, markdownCount: 5 }) === 'no_dates',
        'markdown with no recognisable date is diagnosed as a wrong folder, not as too few entries',
    );
    check(
        diagnoseFirstInsightBlock({ ...base, markdownCount: 4, candidateCount: 4, tooShortCount: 4 }) === 'too_short',
        'entries that are all too short are diagnosed as a length problem',
    );
    check(
        diagnoseFirstInsightBlock({ ...base, markdownCount: 3, candidateCount: 3, validCount: 2, tooShortCount: 1 }) === 'too_short',
        'one short entry standing between the user and the minimum is a length problem',
    );
    check(
        diagnoseFirstInsightBlock({ ...base, markdownCount: 2, candidateCount: 2, validCount: 1, tooShortCount: 1 }) === 'too_few',
        'a short entry that would not close the gap on its own stays a count problem',
    );
    check(
        diagnoseFirstInsightBlock({ ...base, markdownCount: 2, candidateCount: 2, validCount: 2 }) === 'too_few',
        'good but insufficient entries are diagnosed as too few',
    );

    // --- 四种失败态的文案必须互不相同，否则「分得清楚」只是说法 ---
    const copies = ['folder_missing', 'no_markdown', 'no_dates', 'too_short', 'too_few']
        .map(reason => firstInsightBlockCopy(reason, { ...base, markdownCount: 4, candidateCount: 4, validCount: 1, tooShortCount: 3 }))
        .map(copy => `${copy.title}||${copy.action}`);
    check(new Set(copies).size === copies.length, 'each failure mode has its own copy — none of them collapse into one message');
    for (const copy of copies) {
        check(copy.split('||')[1].trim().length > 0, 'every failure mode states a next action');
    }

    // --- 端到端：真实扫描结果走完整个弹窗 ---
    const harness = createVaultHarness();
    harness.ensureFolder('Empty-Folder');
    harness.ensureFolder('No-Dates');
    harness.ensureFolder('Short-Entries');
    harness.ensureFolder('Few-Entries');

    // mtime 为 0 时才没有任何日期来源可用。
    for (let i = 1; i <= 3; i++) {
        harness.addFile(`No-Dates/随手记 ${i}.md`, makeLongBody(`无日期${i}`), 0);
    }
    for (let i = 1; i <= 4; i++) {
        harness.addFile(`Short-Entries/2026-05-0${i}.md`, '今天还行。', moment(`2026-05-0${i}`).valueOf());
    }
    for (let i = 1; i <= 2; i++) {
        harness.addFile(`Few-Entries/2026-04-0${i}.md`, makeLongBody(`篇数不足${i}`), moment(`2026-04-0${i}`).valueOf());
    }

    const plugin = makePlugin(harness, '', '');
    plugin.legacyImportService = new LegacyImportService(plugin);
    plugin.firstInsightService = new FirstInsightService(plugin);

    const modal = new FirstInsightModal(plugin.app, plugin);
    modal.onOpen();
    document.body.appendChild(modal.contentEl);

    const generateButton = [...modal.contentEl.querySelectorAll('button')]
        .find(button => button.textContent.includes('生成我的首次画像'));
    const folderInput = modal.contentEl.querySelector('input.tl-first-insight-folder-value, input[type="text"]');

    async function blockFor(folderPath, { select = true } = {}) {
        if (select) {
            selectFolderInModal(modal, folderPath);
        } else {
            folderInput.value = folderPath;
            folderInput.dispatchEvent(new window.Event('change', { bubbles: true }));
        }
        generateButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        await waitFor(
            () => !!modal.contentEl.querySelector('.tl-first-insight-block'),
            `a failure notice renders for ${folderPath}`,
        );
        return modal.contentEl.querySelector('.tl-first-insight-block');
    }

    const missing = await blockFor('这个目录/不存在', { select: false });
    check(missing?.getAttribute('data-block-reason') === 'folder_missing', 'a folder that does not exist is reported as such', `actual: ${missing?.getAttribute('data-block-reason')}`);
    check(missing?.textContent.includes('这个目录/不存在'), 'the missing-folder notice names the path the user typed');
    check(!missing?.textContent.includes('Folder not found'), 'the raw English exception message never reaches the user');

    const empty = await blockFor('Empty-Folder');
    check(empty?.getAttribute('data-block-reason') === 'no_markdown', 'an empty folder is reported as empty, not as too few journals', `actual: ${empty?.getAttribute('data-block-reason')}`);
    check(!empty?.textContent.includes('内容足够分析'), 'an empty folder is never described as "you have not written enough"');

    const noDates = await blockFor('No-Dates');
    check(noDates?.getAttribute('data-block-reason') === 'no_dates', 'markdown without dates is reported as a folder problem', `actual: ${noDates?.getAttribute('data-block-reason')}`);
    check(noDates?.textContent.includes('3'), 'the no-dates notice says how many files it did read');

    const tooShort = await blockFor('Short-Entries');
    check(tooShort?.getAttribute('data-block-reason') === 'too_short', 'short entries are reported as a length problem', `actual: ${tooShort?.getAttribute('data-block-reason')}`);
    check(
        tooShort?.textContent.includes(String(FIRST_INSIGHT_MIN_ANALYZABLE_CHARS)),
        'the too-short notice states the character threshold the user is missing',
    );
    check(tooShort?.textContent.includes('4'), 'the too-short notice says how many entries were skipped for length');

    const tooFew = await blockFor('Few-Entries');
    check(tooFew?.getAttribute('data-block-reason') === 'too_few', 'genuinely too few entries are still reported as too few', `actual: ${tooFew?.getAttribute('data-block-reason')}`);
    check(tooFew?.textContent.includes('还差 1 篇'), 'the too-few notice says exactly how many more are needed', `actual: ${JSON.stringify(tooFew?.textContent)}`);

    // 失败提示必须跟着目录一起清掉，否则用户改完目录还看着上一次的错误。
    selectFolderInModal(modal, 'Empty-Folder');
    check(!modal.contentEl.querySelector('.tl-first-insight-block'), 'changing the folder clears the previous failure notice');

    modal.contentEl.remove();

    setLanguage('en');
    const enCopy = firstInsightBlockCopy('no_markdown', { ...base, folderPath: 'Attachments' });
    check(enCopy.title.includes('Attachments') && enCopy.action.length > 0, 'the English failure copy is wired up too');
    setLanguage('zh');
}

// ---------------------------------------------------------------------------
// 「文件夹选错」最危险的一种是**不会失败**的：里面有足够多的长 Markdown，
// 扫描顺利通过，只是那些文件不是日记。此时唯一可见的信号是它们的日期
// 全部来自文件修改时间。拦不得（有人的日记确实不写日期），但必须说出来。
// ---------------------------------------------------------------------------
console.log('\nTest 12b: a folder whose entries have no dates of their own is flagged, not silently used');
{
    setLanguage('zh');
    const harness = createVaultHarness();
    harness.ensureFolder('Meeting-Notes');
    harness.ensureFolder('Dated-Journals');
    for (let i = 1; i <= 4; i++) {
        harness.addFile(`Meeting-Notes/项目会议 ${i}.md`, makeLongBody(`会议${i}`), moment(`2026-03-0${i}`).valueOf());
        harness.addFile(`Dated-Journals/2026-02-0${i}.md`, makeLongBody(`日记${i}`), moment(`2026-02-0${i}`).valueOf());
    }

    const plugin = makePlugin(harness, '', '');
    plugin.legacyImportService = new LegacyImportService(plugin);
    plugin.firstInsightService = new FirstInsightService(plugin);

    const scan = await plugin.legacyImportService.scanFolder('Meeting-Notes');
    check(scan.canGenerate, 'a folder of long non-journal notes passes the scan — nothing blocks it');
    check(
        scan.validEntries.every(entry => entry.dateSource === 'mtime'),
        'and every one of its dates comes from the file modification time',
    );

    const dated = await plugin.legacyImportService.scanFolder('Dated-Journals');
    check(
        dated.validEntries.every(entry => entry.dateSource === 'filename'),
        'real dated journals do not trip the mtime signal',
    );

    const modal = new FirstInsightModal(plugin.app, plugin);
    modal.onOpen();
    document.body.appendChild(modal.contentEl);
    const generateButton = [...modal.contentEl.querySelectorAll('button')]
        .find(button => button.textContent.includes('生成我的首次画像'));

    selectFolderInModal(modal, 'Meeting-Notes');
    generateButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await waitFor(
        () => !!modal.contentEl.querySelector('.tl-first-insight-scan-card'),
        'the scan card renders for the undated folder',
    );
    const warning = modal.contentEl.querySelector('.tl-first-insight-mtime-warning');
    check(!!warning, 'an undated folder gets a visible wrong-folder warning');
    check(warning?.textContent.includes('Meeting-Notes'), 'the warning names the folder so the user can judge it');
    check(!modal.contentEl.querySelector('.tl-first-insight-block'), 'the warning does not block generation');
    modal.contentEl.remove();

    const datedModal = new FirstInsightModal(plugin.app, plugin);
    datedModal.onOpen();
    document.body.appendChild(datedModal.contentEl);
    const datedButton = [...datedModal.contentEl.querySelectorAll('button')]
        .find(button => button.textContent.includes('生成我的首次画像'));
    selectFolderInModal(datedModal, 'Dated-Journals');
    datedButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await waitFor(
        () => !!datedModal.contentEl.querySelector('.tl-first-insight-scan-card'),
        'the scan card renders for the dated folder',
    );
    check(
        !datedModal.contentEl.querySelector('.tl-first-insight-mtime-warning'),
        'a properly dated journal folder is not warned about',
    );
    datedModal.contentEl.remove();
}


// ---------------------------------------------------------------------------
// 档位挡住首次画像时，用户手里已经有什么？
//
// 旧日记读完了、原文复制好了、可分析副本也写好了。他离结果只差一次调用。
// 上一版在这里给他一句「当前版本不支持此功能」——原因说错了（是档位不是版本），
// 而且没有出路。这一组断言锁住三件事：说对原因、就地给出路、不让他重来一遍。
// ---------------------------------------------------------------------------
console.log('\nTest 13: a tier wall on the profile path offers the trial in place');
{
    setLanguage('zh');

    function harnessWithJournals() {
        const harness = createVaultHarness();
        harness.ensureFolder('Legacy');
        for (let i = 1; i <= 5; i++) {
            harness.addFile(
                `Legacy/2026-07-0${i}.md`,
                makeLongBody(`档位${i}`),
                moment(`2026-07-0${i}`).valueOf(),
            );
        }
        return harness;
    }

    function makeGatedPlugin(harness, { error, trialEligible = true, aiResponse = '' }) {
        const plugin = makePlugin(harness, aiResponse, '');
        const state = { trialStarted: 0, imports: 0, calls: 0 };
        plugin.__state = state;
        plugin.licenseManager = {
            isTrialEligible: () => trialEligible,
            startTrial: async () => { state.trialStarted += 1; return trialEligible; },
        };
        plugin.getAIProvider = () => ({
            sendMessage: async (_messages, _system, onChunk) => {
                state.calls += 1;
                // 第一次撞墙，开启试用之后放行——这正是真实链路的形状。
                if (state.calls === 1 && error) throw error;
                onChunk(aiResponse);
            },
        });
        plugin.legacyImportService = new LegacyImportService(plugin);
        const realCreateImport = plugin.legacyImportService.createImport.bind(plugin.legacyImportService);
        plugin.legacyImportService.createImport = async (scan) => {
            state.imports += 1;
            state.lastSessionFolder = scan.folderPath;
            return realCreateImport(scan);
        };
        plugin.firstInsightService = new FirstInsightService(plugin);
        return plugin;
    }

    async function runToWall(plugin) {
        const modal = new FirstInsightModal(plugin.app, plugin);
        modal.onOpen();
        document.body.appendChild(modal.contentEl);
        selectFolderInModal(modal, 'Legacy');
        const button = [...modal.contentEl.querySelectorAll('button')]
            .find(b => b.textContent.includes('生成我的首次画像'));
        button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        await waitFor(
            () => !!modal.contentEl.querySelector('.tl-first-insight-error-card .tl-insights-notice-stale'),
            'generation reports a failure',
        );
        return { modal, button };
    }

    // --- 档位被拒：说对原因 + 就地给出路 ---
    const tierPlugin = makeGatedPlugin(harnessWithJournals(), {
        error: new TideLogError(ErrorCode.FEATURE_UNAVAILABLE, t('error.aiFeatureUnavailable')),
        aiResponse: FIRST_INSIGHT_AHA_REPORT,
    });
    const { modal, button } = await runToWall(tierPlugin);

    const noticeText = modal.contentEl.querySelector('.tl-first-insight-error-card .tl-insights-notice-stale')?.textContent ?? '';
    check(!noticeText.includes('版本不包含'), 'the wall no longer blames the plugin version');
    check(noticeText.includes('试用') || noticeText.includes('订阅'), 'the wall names the real reason', `actual: ${JSON.stringify(noticeText.slice(0, 80))}`);

    const gate = modal.contentEl.querySelector('.tl-first-insight-trial-gate');
    check(!!gate, 'a trial gate is offered right where the wall was hit');
    check(gate?.textContent.includes('已经读好了'), 'the gate tells the user their journals are not lost');
    for (const promise of ['7 天', '无需绑卡', '到期自动结束']) {
        check(gate?.textContent.includes(promise), `the gate carries the compact promise: ${promise}`);
    }
    check(gate?.querySelectorAll('.tl-first-insight-trial-promise').length === 0, 'the gate does not repeat four separate promise paragraphs');

    check(tierPlugin.__state.imports === 1, 'the journals were imported exactly once before the wall');

    const startBtn = gate?.querySelector('.tl-first-insight-trial-start');
    check(!!startBtn, 'the gate has a button the user can actually press');
    startBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await waitFor(
        () => !modal.contentEl.querySelector('.tl-first-insight-trial-gate'),
        'the gate closes once the trial starts',
    );
    check(tierPlugin.__state.trialStarted === 1, 'pressing it starts the trial');
    await waitFor(
        () => !!modal.contentEl.querySelector('.tl-first-insight-confirm'),
        'generation resumes and produces a report',
    );
    check(tierPlugin.__state.imports === 1, 'resuming does NOT copy the journals a second time', `imports: ${tierPlugin.__state.imports}`);
    check(tierPlugin.__state.calls === 2, 'the AI was retried exactly once after the trial started');
    check(!button.textContent.includes('正在生成'), 'the generate button does not stay stuck in its loading state', `actual: ${JSON.stringify(button.textContent)}`);
    modal.contentEl.remove();

    // --- 网络断了：开试用解决不了，就不该给这个按钮 ---
    const netPlugin = makeGatedPlugin(harnessWithJournals(), {
        error: new Error('net::ERR_CONNECTION_CLOSED'),
    });
    const net = await runToWall(netPlugin);
    const netNotice = net.modal.contentEl.querySelector('.tl-first-insight-error-card .tl-insights-notice-stale')?.textContent ?? '';
    check(
        !net.modal.contentEl.querySelector('.tl-first-insight-trial-gate'),
        'a network failure does not pretend a trial would fix it',
    );
    check(netNotice.includes('TL-3001') && !netNotice.includes('**') && !netNotice.includes('`'), 'the first-insight wall shows a classified plain-text network error', netNotice);
    net.modal.contentEl.remove();

    // --- 已经用过试用的人：给了也点不动，不给 ---
    const usedPlugin = makeGatedPlugin(harnessWithJournals(), {
        error: new TideLogError(ErrorCode.FEATURE_UNAVAILABLE, t('error.aiFeatureUnavailable')),
        trialEligible: false,
    });
    const used = await runToWall(usedPlugin);
    check(
        !used.modal.contentEl.querySelector('.tl-first-insight-trial-gate'),
        'a user who already used their trial is not offered it again',
    );
    used.modal.contentEl.remove();

    // --- 换过文件夹之后，缓存的会话必须作废 ---
    // 否则会拿 A 文件夹的副本，生成界面上写着 B 文件夹的画像——错得静悄悄。
    const switchHarness = harnessWithJournals();
    switchHarness.ensureFolder('Other-Journals');
    for (let i = 1; i <= 5; i++) {
        switchHarness.addFile(
            `Other-Journals/2026-08-0${i}.md`,
            makeLongBody(`另一批${i}`),
            moment(`2026-08-0${i}`).valueOf(),
        );
    }
    const switchPlugin = makeGatedPlugin(switchHarness, {
        error: new TideLogError(ErrorCode.FEATURE_UNAVAILABLE, t('error.aiFeatureUnavailable')),
        aiResponse: FIRST_INSIGHT_AHA_REPORT,
    });
    const switched = await runToWall(switchPlugin);
    check(!!switched.modal.contentEl.querySelector('.tl-first-insight-trial-gate'), 'the wall is reached on folder A');
    check(switchPlugin.__state.imports === 1, 'folder A was imported once');

    selectFolderInModal(switched.modal, 'Other-Journals');
    check(
        !switched.modal.contentEl.querySelector('.tl-first-insight-trial-gate'),
        'switching folders clears the stale trial gate',
    );
    switched.button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await waitFor(
        () => switchPlugin.__state.imports === 2,
        'switching folders forces a fresh import instead of reusing the cached session',
    );
    check(switchPlugin.__state.imports === 2, 'the new folder gets its own import session', `imports: ${switchPlugin.__state.imports}`);
    const usedSession = switchPlugin.__state.lastSessionFolder;
    check(usedSession === 'Other-Journals', 'generation runs against the folder the user actually selected', `actual: ${usedSession}`);
    switched.modal.contentEl.remove();
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
try { fs.unlinkSync(mockPath); } catch {}
try { fs.unlinkSync(entryPath); } catch {}
process.exit(fail === 0 ? 0 : 1);
