/**
 * First insight / legacy import regression tests.
 *
 * Covers the first-value path:
 * - non-standard old journals are read-only
 * - source copies and normalized copies are created under Archive/Imports
 * - date extraction priority and 7-journal threshold work
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
class Notice {
    constructor(message) {
        global.__lastNotice = message;
    }
}
module.exports = {
    App: class {},
    Component: class { load(){} unload(){} },
    MarkdownRenderer: { render: async (app, content, el) => { el.textContent = content; } },
    Modal,
    Notice,
    TFile,
    TFolder,
    moment,
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
} from ${JSON.stringify(path.join(__dirname, 'src/services/legacy-import-service.ts'))};
export {
    FirstInsightService,
    buildFirstInsightPrompt,
    extractProfileUpdate,
    stripProfileTags,
    hasRequiredAhaModules,
    ensureProfileAhaStructure,
} from ${JSON.stringify(path.join(__dirname, 'src/services/first-insight-service.ts'))};
export { FirstInsightModal } from ${JSON.stringify(path.join(__dirname, 'src/views/first-insight-modal.ts'))};
export { setLanguage } from ${JSON.stringify(path.join(__dirname, 'src/i18n/index.ts'))};
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
    FirstInsightService,
    buildFirstInsightPrompt,
    extractLegacyJournalDate,
    extractProfileUpdate,
    stripProfileTags,
    hasRequiredAhaModules,
    ensureProfileAhaStructure,
    FirstInsightModal,
    setLanguage,
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
    };

    return { nodes, root, vault, ensureFolder, addFile };
}

function makePlugin(harness, aiResponse = '', currentProfile = '# 用户画像\n\n## 旧格式画像\n\n- 已有内容。') {
    const opened = [];
    return {
        __opened: opened,
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
        hasConfiguredAI: () => true,
        vaultManager: {
            getUserProfileContent: async () => currentProfile,
            ensureInsightsFolder: async () => { await harness.vault.createFolder('Archive/Insights'); },
        },
        getAIProvider: () => ({
            sendMessage: async (messages, systemPrompt, onChunk) => {
                makePlugin.lastMessages = messages;
                makePlugin.lastSystemPrompt = systemPrompt;
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
    for (let i = 1; i <= 6; i++) {
        harness.addFile(`Legacy/2026-06-0${i}.md`, makeLongBody(`主题${i}`), moment(`2026-06-0${i}`).valueOf());
    }
    harness.addFile('Legacy/2026-06-07-short.md', '太短', moment('2026-06-07').valueOf());
    harness.addFile('Legacy/2026-05-30.md', makeLongBody('范围外'), moment('2026-05-30').valueOf());

    const service = new LegacyImportService(makePlugin(harness));
    const scan = await service.scanFolder('Legacy', { start: '2026-06-01', end: '2026-06-30' });
    check(scan.candidateCount === 7, 'candidate count includes dated markdown in range');
    check(scan.validCount === 6, 'valid count excludes too-short content');
    check(!scan.canGenerate, 'fewer than 7 valid journals cannot generate formal report');
    check(scan.excludedEntries.some(item => item.reason === 'too_short'), 'too-short journal is listed as excluded');
    check(scan.excludedEntries.some(item => item.reason === 'outside_range'), 'outside-range journal is listed as excluded');

    const autoScan = await service.scanFolder('Legacy');
    check(autoScan.candidateCount === 8, 'folder-only scan includes all dated markdown candidates');
    check(autoScan.validCount === 7, 'folder-only scan relies on detected dates instead of manual date inputs');
    check(autoScan.canGenerate, 'folder-only scan can generate when at least 7 journals are analyzable');
    check(
        autoScan.dateRange.start === '2026-05-30' && autoScan.dateRange.end === '2026-06-07',
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
    check(scan.validCount === 7 && scan.canGenerate, 'representative Obsidian fixture passes the 7-note generation threshold');
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

console.log('\nTest 3: threshold allows exactly 7 and more than 7 valid journals');
{
    const harness = createVaultHarness();
    harness.ensureFolder('Legacy');
    harness.ensureFolder('Daily');
    const originals = new Map();
    for (let i = 1; i <= 7; i++) {
        const file = harness.addFile(`Legacy/2026-06-${String(i).padStart(2, '0')}.md`, makeLongBody(`导入${i}`), moment(`2026-06-${String(i).padStart(2, '0')}`).valueOf());
        originals.set(file.path, file.content);
    }

    const service = new LegacyImportService(makePlugin(harness));
    const scan = await service.scanFolder('Legacy', { start: '2026-06-01', end: '2026-06-30' });
    const session = await service.createImport(scan);

    check(scan.canGenerate, 'exactly 7 valid journals can generate');
    check(session.normalizedEntries.length === 7, 'exactly 7 valid journals are all normalized');
}

{
    const harness = createVaultHarness();
    harness.ensureFolder('Legacy');
    for (let i = 1; i <= 8; i++) {
        harness.addFile(`Legacy/2026-06-${String(i).padStart(2, '0')}.md`, makeLongBody(`阈值${i}`), moment(`2026-06-${String(i).padStart(2, '0')}`).valueOf());
    }

    const service = new LegacyImportService(makePlugin(harness));
    const scan = await service.scanFolder('Legacy', { start: '2026-06-01', end: '2026-06-30' });
    const session = await service.createImport(scan);

    check(scan.validCount === 8, 'more than 7 valid journals are counted');
    check(scan.canGenerate, 'more than 7 valid journals can generate');
    check(session.normalizedEntries.length === 8, 'more than 7 valid journals are all normalized');
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
    check(modalSource.includes('tl-insights-notice') && modalSource.includes('tl-insights-stream'), 'first insight modal reuses notice and stream classes');
    check(modalSource.includes('tl-first-insight-stepper'), 'first insight modal renders a compact three-step flow');
    check(modalSource.includes('importSessionToDailyNotes') && modalSource.includes('tl-first-insight-system-import-option'), 'first insight modal exposes optional one-click system import');
    check(!modalSource.includes("type: 'date'") && !modalSource.includes('startInputEl') && !modalSource.includes('endInputEl'), 'first insight modal asks for folder only and does not render date inputs');
    check(modalSource.includes('tl-first-insight-folder-tree') && modalSource.includes('renderFolderTree'), 'first insight modal renders a hierarchical folder tree instead of a flat folder list');
    check(!modalSource.includes("createEl('select', { cls: 'tl-first-insight-folder-select'"), 'first insight modal no longer renders all vault folders as one flat select');
    check(modalSource.includes('resetGeneratedStateForFolderChange') && modalSource.includes("addEventListener('change', resetGeneratedState"), 'folder changes reset generated state for another first insight run');
    check(onboardingSource.includes('tl-onboarding-first-insight'), 'onboarding contains a dedicated first insight CTA');
    check(onboardingSource.includes('hasConfiguredAI'), 'onboarding first insight entry is aware of API configuration');
    check(insightsSource.includes('firstInsightCompleted') && insightsSource.includes('return;'), 'Insights hides the first insight entry after the initial profile is saved');
    const renderProfileSource = insightsSource.slice(insightsSource.indexOf('private async renderProfile'), insightsSource.indexOf('private async generateReport'));
    check(renderProfileSource.indexOf('if (this.shouldShowFirstInsightEntry())') < renderProfileSource.indexOf("const card = body.createDiv('tl-insights-card');"), 'profile Insights shows old-journal entry instead of the default AI profile card before initial profile is saved');
    check(insightsSource.includes("this.host.insightsMode === 'profile'") && insightsSource.includes('this.renderFirstInsightEntry(panel);'), 'locked profile Insights also uses the old-journal entry as the single card');
    check(settingsSource.includes('tl-settings-legacy-import') && settingsSource.includes('openFirstInsight'), 'settings keeps a folded legacy import entry for later imports');
    check(mainSource.includes('this.settings.firstInsightCompleted && !this.licenseManager.isPro()'), 'initial profile stays free once while later old-journal profile runs require trial or Pro');
    check(modalSource.includes('showTrialOfferOnce') && eveningSource.includes('showTrialOfferOnce'), 'initial profile save and first review both feed the one-time contextual trial offer');
    check(insightsSource.includes("this.host.openInsights('profile')") && insightsSource.includes('insights.valueWeekly'), 'weekly value card guides trial users to update AI view of you without adding a new report type');
    check(css.includes('.modal.tl-first-insight-shell') && css.includes('.tl-first-insight-stats') && css.includes('.tl-first-insight-system-import-option') && css.includes('.tl-first-insight-report-card .tl-insights-stream'), 'first insight CSS covers modal shell, scan stats, optional import, and report preview scrolling');
    check(css.includes('.tl-first-insight-modal {') && css.includes('.tl-chat-container,') && css.includes('.tl-first-insight-modal {'), 'first insight modal receives TideLog design tokens');
    check(!modalSource.toLowerCase().includes('token') && !modalSource.includes('费用'), 'first insight UI does not show token or cost estimates');
    check(zhSource.includes("'firstInsight.stepScan': '分析记录'") && enSource.includes("'firstInsight.stepScan': 'Analyze records'"), 'first insight stepper uses user-facing analyze-records wording');
    check(modalSource.includes('buildGenerationEstimate') && modalSource.includes('scan.validEntries.reduce'), 'first insight estimates generation time from scanned journal count and content size');
    check(modalSource.includes('formatRemainingMinutes') && modalSource.includes('window.setInterval(updateProgress, 1000)'), 'first insight generation updates minute-level remaining time while waiting for the model');
    check(modalSource.includes('tl-first-insight-generating-status') && css.includes('.tl-first-insight-generating-status'), 'first insight generation status is shown near the loading button');
    check(modalSource.includes('window.setTimeout(() => this.revealElement(card), 120') && modalSource.includes('container.scrollTo'), 'first insight scrolls to the generated report after completion');
    check(!zhSource.includes('已等待') && !zhSource.includes('elapsedSeconds') && !enSource.includes('Elapsed:'), 'first insight generation copy does not show elapsed time');
    check(!zhSource.includes('不代表失败') && zhSource.includes('正在继续整理证据和生成报告'), 'long-running generation copy uses reassuring user-facing wording');
    check(zhSource.includes('estimateMinutesRange') && zhSource.includes('remainingMinutesRange'), 'first insight generation uses conservative time ranges instead of a precise single minute');
    check(zhSource.includes("'firstInsight.generatedBtn': '已经生成完成'") && css.includes('.tl-insights-primary-btn-complete:disabled'), 'completed generation button has a distinct finished state');
    const estimateHarness = createVaultHarness();
    const estimatePlugin = makePlugin(estimateHarness);
    const estimateModal = new FirstInsightModal(estimatePlugin.app, estimatePlugin);
    const sevenShortJournalEstimate = estimateModal.buildGenerationEstimate({
        validCount: 7,
        validEntries: Array.from({ length: 7 }, () => ({ analyzableBody: 'x'.repeat(226) })),
    });
    check(sevenShortJournalEstimate.maxSeconds <= 480, 'seven short journals receive a compact but realistic estimate');
    const sixtySixShortJournalEstimate = estimateModal.buildGenerationEstimate({
        validCount: 66,
        validEntries: Array.from({ length: 66 }, () => ({ analyzableBody: 'x'.repeat(173) })),
    });
    check(sixtySixShortJournalEstimate.maxSeconds <= 720, '66 short journals no longer show a 20-minute upper estimate', JSON.stringify(sixtySixShortJournalEstimate));
    check(zhSource.includes('系统正在读取大量信息、提取证据并组织成专业报告') && enSource.includes('organizing a professional report'), 'first insight wait copy explains why the wait is valuable');
    check(zhSource.includes('TideLog 不会保存你的个人数据') && enSource.includes('does not store your personal data'), 'first insight copy reassures users about local privacy');
    check(css.includes('.tl-first-insight-privacy-note') && css.includes('.tl-onboarding-privacy-note'), 'privacy notes reuse lightweight card styling');

    const chatSource = fs.readFileSync(path.join(__dirname, 'src/views/chat-view.ts'), 'utf8');
    check(chatSource.includes('shouldStartAtFirstInsight') && chatSource.includes("this.insightsMode = 'profile'") && chatSource.includes("await this.switchTab('review')"), 'fresh users land on Insights profile so the old-journal entry is first visible');
    check(chatSource.includes("this.shouldStartAtFirstInsight() ? 'profile' : 'weekly'"), 'clicking the Insights tab keeps fresh users on the profile entry until first insight is completed');
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
    check(modal.contentEl.textContent.includes('同时纳入 TideLog 日记库'), 'modal offers optional one-click system import');

    const generateButton = [...modal.contentEl.querySelectorAll('button')]
        .find(button => button.textContent.includes('生成我的首次画像'));
    check(!!generateButton && !generateButton.disabled, 'modal starts with one direct generation action');
    generateButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    await waitFor(
        () => modal.contentEl.textContent.includes('找到 8 篇可能的日记，其中 7 篇内容足够分析'),
        'modal shows candidate and valid counts during direct generation',
    );
    check(modal.contentEl.textContent.includes('预计生成约'), 'modal scan preview shows an estimate before report generation completes');
    check(modal.contentEl.textContent.includes('Legacy · 自动识别到 2026-06-01 至 2026-06-08'), 'modal scan preview shows selected folder and auto-detected range');
    check(modal.contentEl.textContent.includes('正文不足以分析'), 'modal scan preview shows exclusion reason');
    const primaryActions = [...modal.contentEl.querySelectorAll('button')]
        .filter(button => button.textContent.includes('生成我的首次画像'));
    check(primaryActions.length <= 1, 'modal does not render a second confirmation step before generation');

    await waitFor(
        () => modal.contentEl.textContent.includes('报告草稿已生成，并已纳入日记库'),
        'modal renders generated draft notice',
    );
    check(generateButton.textContent.includes('已经生成完成') && generateButton.disabled, 'modal marks the generate button as completed after report generation');
    check(modal.contentEl.textContent.includes('你的首次画像报告'), 'modal renders user-facing report title');
    check(modal.contentEl.textContent.includes('引用证据'), 'modal renders evidence module');
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
        .find(button => button.textContent.includes('保存这份画像'));
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
    check(plugin.__opened.includes('Archive/user_profile.md'), 'modal opens saved user profile after confirmation');

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
    check(!modal.contentEl.textContent.includes('报告草稿已生成'), 'changing the old-journal folder clears the previous report state');
    modal.contentEl.remove();
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
try { fs.unlinkSync(mockPath); } catch {}
try { fs.unlinkSync(entryPath); } catch {}
process.exit(fail === 0 ? 0 : 1);
