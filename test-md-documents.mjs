/**
 * Regression tests for TideLog-generated Markdown documents.
 *
 * The goal is that every user-facing TideLog .md document has a coherent
 * reading-view structure while preserving native Markdown task parsing.
 */

import path from 'path';
import url from 'url';
import fs from 'fs';
import esbuild from 'esbuild';
import { createRequire } from 'module';
import moment from 'moment';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const mockPath = path.join(__dirname, 'obsidian-mock-md-documents.cjs');
fs.writeFileSync(
    mockPath,
    `
class TFile {
    constructor(path, content = '') {
        this.path = path;
        this.content = content;
        this.extension = 'md';
        this.name = path.split('/').pop();
        this.basename = this.name.replace(/\\.md$/, '');
        this.stat = { mtime: Date.now(), ctime: Date.now(), size: content.length };
    }
}
class TFolder {
    constructor(path, children = []) {
        this.path = path;
        this.name = path.split('/').pop() || '';
        this.children = children;
    }
}
module.exports = {
    App: class {},
    TFile,
    TFolder,
    moment: require('moment'),
};
`,
);

const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
    if (req === 'obsidian') return mockPath;
    return origResolve.call(this, req, parent, ...rest);
};
const { TFile } = require(mockPath);

const entryPath = path.join(__dirname, '.test-md-documents-entry.ts');
fs.writeFileSync(entryPath, `
export { TemplateManager } from ${JSON.stringify(path.join(__dirname, 'src/services/template-manager.ts'))};
export { VaultManager } from ${JSON.stringify(path.join(__dirname, 'src/services/vault-manager.ts'))};
export { PlanSuggestionService } from ${JSON.stringify(path.join(__dirname, 'src/services/plan-suggestion-service.ts'))};
export { buildSystemDailyNoteFromLegacy } from ${JSON.stringify(path.join(__dirname, 'src/services/legacy-import-service.ts'))};
export { formatTideLogTitle } from ${JSON.stringify(path.join(__dirname, 'src/utils/document-format.ts'))};
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
const mod = { exports: {} };
new Function('module', 'exports', 'require', bundled.outputFiles[0].text)(mod, mod.exports, require);
const {
    TemplateManager,
    VaultManager,
    PlanSuggestionService,
    buildSystemDailyNoteFromLegacy,
    formatTideLogTitle,
} = mod.exports;

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

function createAppHarness() {
    const files = new Map();
    const folders = new Set(['Daily', 'Plans', 'Plans/Weekly', 'Plans/Monthly', 'Archive']);
    const addFile = (filePath, content) => {
        const file = new TFile(filePath, content);
        files.set(filePath, file);
        return file;
    };

    const app = {
        vault: {
            getAbstractFileByPath: p => files.get(p) ?? (folders.has(p) ? { path: p } : null),
            cachedRead: async file => file.content,
            read: async file => file.content,
            createFolder: async p => { folders.add(p); },
            create: async (p, content) => addFile(p, content),
            process: async (file, updater) => {
                file.content = updater(file.content);
                return file.content;
            },
        },
        fileManager: {
            processFrontMatter: async (file, updater) => {
                const frontmatter = {};
                updater(frontmatter);
                file.frontmatter = frontmatter;
            },
        },
        metadataCache: { getFileCache: () => null },
    };

    const settings = {
        dailyFolder: 'Daily',
        planFolder: 'Plans',
        archiveFolder: 'Archive',
        dayBoundaryHour: 6,
    };

    return { app, files, settings };
}

console.log('\n=== TIDELOG MARKDOWN DOCUMENT TESTS ===\n');

{
    check(formatTideLogTitle('# 2026-W21 周报', '🧭') === '# 🧭 2026-W21 周报', 'report title formatter adds one emoji');
    check(formatTideLogTitle('# 🧭 2026-W21 周报', '🧭') === '# 🧭 2026-W21 周报', 'report title formatter does not duplicate emoji');
}

{
    const { app, files, settings } = createAppHarness();
    const templates = new TemplateManager(app, settings);
    await templates.ensureTemplateFiles();

    const weekly = templates.getWeeklyPlanTemplate('W21', '2026-05');
    check(/^# 🧭 /m.test(weekly), 'weekly plan title gets one restrained emoji');
    check(weekly.includes('> [!tl-plan]'), 'weekly plan template has TideLog plan callout');
    check(/^- \[ \]/m.test(weekly), 'weekly plan keeps checkbox tasks as top-level Markdown');
    check(!/^> - \[ \]/m.test(weekly), 'weekly plan does not blockquote checkbox tasks');

    const monthly = templates.getMonthlyPlanTemplate('2026-05');
    check(/^# 🧭 /m.test(monthly), 'monthly plan title gets one restrained emoji');
    check(monthly.includes('> [!tl-plan]'), 'monthly plan template has TideLog plan callout');
    check(monthly.includes('> [!tl-experiment]'), 'monthly plan template has TideLog action/growth callout');
    check(/^- \[ \]/m.test(monthly), 'monthly plan keeps milestone checkboxes as top-level Markdown');

    check(/^# 🧩 /m.test(files.get('Archive/principles.md')?.content ?? ''), 'principles title gets one restrained emoji');
    check(/^# 🔁 /m.test(files.get('Archive/patterns.md')?.content ?? ''), 'patterns title gets one restrained emoji');
    check(files.get('Archive/principles.md')?.content.includes('> [!tl-experiment]'), 'principles.md template uses TideLog callouts');
    check(files.get('Archive/patterns.md')?.content.includes('> [!tl-pattern]'), 'patterns.md template uses TideLog callouts');
}

{
    const { app, settings } = createAppHarness();
    const vault = new VaultManager(app, settings);
    const daily = await vault.getOrCreateDailyNote(new Date('2026-05-20T12:00:00'));
    check(/^# 🌊 /m.test(daily.content), 'daily note title gets one restrained emoji');
    check(daily.content.includes('> [!tl-day]'), 'default daily note has TideLog day summary callout');
    check(daily.content.includes('> [!tl-plan]'), 'default daily note has plan intro callout');
    check(daily.content.includes('> [!tl-review]'), 'default daily note has review intro callout');

    await vault.addTaskToDaily('Keep native task parsing', new Date('2026-05-20T12:00:00'));
    check(/^- \[ \] Keep native task parsing/m.test(daily.content), 'daily tasks remain top-level checkboxes after insert');
    check(!/^> - \[ \] Keep native task parsing/m.test(daily.content), 'daily inserted tasks are not blockquoted');

    await vault.addQuickCaptureItem('Small idea');
    const capture = app.vault.getAbstractFileByPath('Archive/quick_capture.md');
    check(capture?.content.includes('# 💡 Quick Capture') || capture?.content.includes('# 💡 灵感收集'), 'quick capture file gets a readable title with one emoji');
    check(capture?.content.includes('> [!tl-capture]'), 'quick capture file gets TideLog capture callout');
    check(/^- Small idea/m.test(capture?.content ?? ''), 'quick capture item remains a top-level bullet');
}

{
    const legacy = buildSystemDailyNoteFromLegacy({
        date: '2026-05-20',
        sourcePath: 'Old/2026-05-20.md',
        normalizedPath: 'Archive/Imports/Normalized/2026-05-20.md',
        sourceMtime: Date.parse('2026-05-20T08:00:00Z'),
        originalContent: 'original',
        analyzableBody: '今天完成了一个重要闭环。',
        summary: '完成重要闭环。',
        candidateTopics: ['闭环', '行动'],
        wordCount: 32,
        title: 'old journal',
    });
    check(legacy.includes('> [!tl-day]'), 'legacy-imported daily note has TideLog day callout');
    check(legacy.includes('> [!tl-meta]'), 'legacy import metadata is formatted as a TideLog meta callout');
    check(legacy.includes('> [!tl-report]'), 'legacy import summary is formatted as a TideLog report callout');
    check(legacy.includes('> [!tl-evidence]'), 'legacy import body is formatted as TideLog evidence');
}

{
    const { app, files, settings } = createAppHarness();
    const providerCalls = [];
    files.set('Daily/2026-05-19.md', new TFile('Daily/2026-05-19.md', `# 2026-05-19

## 计划
- [x] 修复导入

## 复盘
今天确认 MD 页面也要统一优化。
`));

    const plugin = {
        app,
        settings,
        getAIProvider: () => ({
            sendMessage: async (messages, systemPrompt) => {
                providerCalls.push({ messages, systemPrompt });
                return '- 明天先检查日报格式\n- 保留任务 checkbox\n- 统一 callout 风格';
            },
        }),
        vaultManager: {
            getDailyNotesInRange: () => [files.get('Daily/2026-05-19.md')],
            getWeeklyPlanPath: () => 'Plans/Weekly/2026-W21.md',
            getMonthlyPlanPath: () => 'Plans/Monthly/2026-05.md',
            getUserProfileContent: async () => '',
            getPatternsContent: async () => '',
            getPrinciplesContent: async () => '',
        },
    };
    const service = new PlanSuggestionService(plugin);
    const lines = await service.generateSuggestions('day', moment('2026-05-20'), { force: true });
    const saved = app.vault.getAbstractFileByPath('Archive/plan_suggestions/day/2026-05-20.md');
    check(lines.length === 3, 'plan suggestions still normalize generated lines');
    check(/^# 💡 /m.test(saved?.content ?? ''), 'plan suggestions title gets one restrained emoji');
    check(saved?.content.includes('#') && saved?.content.includes('> [!tl-experiment]'), 'plan suggestions cache is a readable TideLog document');
    const cached = await service.getCachedSuggestions('day', moment('2026-05-20'));
    check(cached?.length === 3 && cached.every(line => line.startsWith('💡')), 'optimized plan suggestions remain readable from cache');
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);

try { fs.unlinkSync(mockPath); } catch {}
try { fs.unlinkSync(entryPath); } catch {}
process.exit(fail === 0 ? 0 : 1);
