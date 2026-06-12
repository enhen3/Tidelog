/**
 * Regression tests for the Plan periodic action surface:
 * - task reschedule uses TideLog's own picker, not hidden native date inputs
 * - day/week/month/capture use one visual date icon
 * - quick capture promotion opens a concrete period picker and writes the target plan
 * - add subtask opens in the real UI path and writes below existing children
 */

import path from 'path';
import url from 'url';
import fs from 'fs';
import esbuild from 'esbuild';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';
import moment from 'moment';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/',
});
const { window } = dom;
const { document, HTMLElement, Element } = window;

globalThis.window = window;
globalThis.document = document;
globalThis.activeDocument = document;
globalThis.activeWindow = window;
globalThis.HTMLElement = HTMLElement;
globalThis.Element = Element;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.MouseEvent = window.MouseEvent;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.PointerEvent = window.PointerEvent || window.MouseEvent;

function applyOptions(el, options) {
    if (!options) return;
    if (typeof options === 'string') {
        el.className = options;
        return;
    }
    if (options.cls) {
        el.className = String(options.cls);
    }
    if (options.text !== undefined) el.textContent = String(options.text);
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
HTMLElement.prototype.empty = function () { this.replaceChildren(); };
HTMLElement.prototype.addClass = function (...classes) { this.classList.add(...classes); };
HTMLElement.prototype.removeClass = function (...classes) { this.classList.remove(...classes); };
HTMLElement.prototype.hasClass = function (cls) { return this.classList.contains(cls); };
HTMLElement.prototype.setText = function (text) { this.textContent = String(text); };
HTMLElement.prototype.setAttr = function (name, value) { this.setAttribute(name, String(value)); };
HTMLElement.prototype.setCssProps = function (props) {
    for (const [key, value] of Object.entries(props)) this.style.setProperty(key, String(value));
};
const mockPath = path.join(__dirname, 'obsidian-mock-periodic.cjs');
fs.writeFileSync(
    mockPath,
    `
class TFile {
    constructor(path, content = '', mtime = Date.now()) {
        this.path = path;
        this.content = content;
        this.extension = 'md';
        this.name = path.split('/').pop();
        this.basename = this.name.replace(/\.md$/, '');
        this.stat = { mtime, ctime: mtime, size: content.length };
    }
}
class TFolder {
    constructor(path, children = []) {
        this.path = path;
        this.children = children;
    }
}
class MenuItem {
    constructor(menu) { this.menu = menu; this.title = ''; this.icon = ''; this.callback = null; }
    setTitle(title) { this.title = title; return this; }
    setIcon(icon) { this.icon = icon; return this; }
    onClick(callback) { this.callback = callback; return this; }
}
class Menu {
    constructor() { this.items = []; }
    addItem(callback) {
        const item = new MenuItem(this);
        callback(item);
        this.items.push(item);
        return this;
    }
    showAtPosition(pos) { this.pos = pos; global.__lastMenu = this; }
}
module.exports = {
    App: class {},
    ItemView: class { constructor(leaf) { this.leaf = leaf; this.app = leaf?.app; this.contentEl = activeDocument.createElement('div'); } },
    MarkdownRenderer: { render: async (app, content, el) => { el.textContent = content; } },
    Menu,
    Modal: class { constructor(app) { this.app = app; this.contentEl = activeDocument.createElement('div'); } open() { this.onOpen?.(); } close() { this.onClose?.(); } },
    Notice: class {},
    Platform: { isMobile: false },
	    Plugin: class {},
	    PluginSettingTab: class {},
	    Setting: class { setName(){return this} setDesc(){return this} setHeading(){return this} addText(){return this} addDropdown(){return this} addButton(){return this} addSlider(){return this} addExtraButton(){return this} },
	    TFile,
	    TFolder,
	    moment: require('moment'),
	    setIcon: (el, icon) => { el.dataset.icon = icon; },
	    addIcon: () => {},
	};
`,
);

const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
    if (req === 'obsidian') return mockPath;
    return origResolve.call(this, req, parent, ...rest);
};
const { TFile, TFolder } = require(mockPath);

const entryPath = path.join(__dirname, '.test-periodic-entry.ts');
fs.writeFileSync(entryPath, `
export { PeriodicRenderer } from ${JSON.stringify(path.join(__dirname, 'src/views/periodic-renderer.ts'))};
export { ChatView } from ${JSON.stringify(path.join(__dirname, 'src/views/chat-view.ts'))};
export { InsightsRenderer } from ${JSON.stringify(path.join(__dirname, 'src/views/insights-renderer.ts'))};
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
const { PeriodicRenderer, ChatView, InsightsRenderer } = mod.exports;

let pass = 0;
let fail = 0;
function check(condition, label) {
    if (condition) {
        console.log(`  PASS  ${label}`);
        pass++;
    } else {
        console.log(`  FAIL  ${label}`);
        fail++;
    }
}

function flush() {
    return new Promise(resolve => window.setTimeout(resolve, 20));
}

function readSourceFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return readSourceFiles(fullPath);
        if (!entry.name.endsWith('.ts')) return [];
        return [{ file: fullPath, content: fs.readFileSync(fullPath, 'utf8') }];
    });
}

function createHarness() {
    const files = new Map();
    const captures = [];
    const suggestionCalls = [];
    const app = {
        vault: {
            getAbstractFileByPath: p => files.get(p) ?? null,
            read: async file => file.content,
            cachedRead: async file => file.content,
            createFolder: async () => {},
            create: async (p, content) => {
                const file = new TFile(p, content);
                files.set(p, file);
                return file;
            },
            process: async (file, updater) => {
                file.content = updater(file.content);
                return file.content;
            },
            on: () => ({ unload: () => {} }),
        },
        metadataCache: {
            getFileCache: file => ({
                listItems: file.content.split('\n')
                    .filter(line => /^\\s*- \\[[ x]\\]/.test(line))
                    .map(() => ({ task: ' ' })),
            }),
        },
        workspace: { getLeaf: () => ({ openFile: async () => {} }) },
    };
    const plugin = {
        settings: {
            dailyFolder: 'Daily',
            planFolder: 'Plans',
            archiveFolder: 'Archive',
        },
        templateManager: {
            getWeeklyPlanTemplate: (weekLabel, monthLabel) => `# ${monthLabel} ${weekLabel}\n\n`,
            getMonthlyPlanTemplate: monthLabel => `# ${monthLabel}\n\n`,
        },
        vaultManager: {
            getQuickCaptureItems: async () => [...captures],
            addQuickCaptureItem: async text => { captures.unshift(text); },
            removeQuickCaptureItem: async text => {
                const idx = captures.indexOf(text);
                if (idx >= 0) captures.splice(idx, 1);
            },
            editQuickCaptureItem: async (oldText, newText) => {
                const idx = captures.indexOf(oldText);
                if (idx >= 0) captures[idx] = newText;
            },
            getOrCreateDailyNote: async date => {
                const key = `Daily/${moment(date).format('YYYY-MM-DD')}.md`;
                if (!files.has(key)) files.set(key, new TFile(key, `## 计划\n`));
                return files.get(key);
            },
            getOrCreateWeeklyPlan: async date => {
                const weekStart = moment(date).startOf('isoWeek');
                const key = `Plans/Weekly/${weekStart.isoWeekYear()}-W${String(weekStart.isoWeek()).padStart(2, '0')}.md`;
                if (!files.has(key)) files.set(key, new TFile(key, '# Week\n'));
                return files.get(key);
            },
            getOrCreateMonthlyPlan: async date => {
                const month = moment(date).startOf('month');
                const key = `Plans/Monthly/${month.format('YYYY-MM')}.md`;
                if (!files.has(key)) files.set(key, new TFile(key, '# Month\n'));
                return files.get(key);
            },
        },
        planSuggestionService: {
            getCachedSuggestions: async (scope) => [`💡 cached ${scope} suggestion`],
            generateSuggestions: async (scope) => {
                suggestionCalls.push(scope);
                return [`💡 generated ${scope} suggestion`];
            },
        },
    };

    const view = {
        app,
        plugin,
        periodicMode: 'day',
        periodicSelectedDate: moment('2026-05-19'),
        periodicMonthOffset: 0,
        periodicSelectorOpen: false,
        invalidateTabCache: () => {},
        switchTab: () => {},
        _suppressRefresh: false,
    };
    for (const name of [
        'parseMdTasks',
        'toggleMdTask',
        'addMdTask',
        'addSubTask',
        'editMdTask',
        'deleteMdTask',
        'setTaskIndent',
        'reorderMdTasks',
        'deferTaskToToday',
        'moveTaskToDate',
        'moveTaskToPlan',
        'getDefaultPlanDate',
    ]) {
        view[name] = ChatView.prototype[name].bind(view);
    }

    return { app, plugin, files, captures, suggestionCalls, view, renderer: new PeriodicRenderer(view) };
}

function createInsightsHarness(mode = 'monthly', loopCount = 8, serviceDelayMs = 0) {
    const files = new Map();
    const opened = [];
    const generated = [];
    const switched = [];
    const insightChildren = [];
    const insightsFolder = new TFolder('Archive/Insights', insightChildren);
    const app = {
        vault: {
            getAbstractFileByPath: p => {
                if (p === 'Archive/Insights') return insightsFolder;
                return files.get(p) ?? null;
            },
            read: async file => file.content,
            cachedRead: async file => file.content,
            create: async (p, content) => {
                const file = new TFile(p, content);
                files.set(p, file);
                if (p.startsWith('Archive/Insights/')) insightChildren.push(file);
                return file;
            },
        },
        workspace: {
            getLeaf: () => ({
                openFile: async file => { opened.push(file.path); },
            }),
        },
    };
    const plugin = {
        settings: {
            dailyFolder: 'Daily',
            planFolder: 'Plans',
            archiveFolder: 'Archive',
            firstInsightCompleted: true,
        },
        manifest: { id: 'tidelog' },
        licenseManager: { isPro: () => true },
        hasConfiguredAI: () => true,
        openFirstInsight: async () => {},
        insightService: {
            generateWeeklyInsight: async (onChunk, onComplete, target, options = {}) => {
                generated.push(`weekly:${target.format('YYYY-MM-DD')}:${options.force ? 'force' : 'normal'}`);
                onChunk('weekly report');
                if (serviceDelayMs > 0) await new Promise(resolve => setTimeout(resolve, serviceDelayMs));
                onComplete('weekly report');
            },
            generateMonthlyInsight: async (onChunk, onComplete, target, options = {}) => {
                generated.push(`monthly:${target.format('YYYY-MM-DD')}:${options.force ? 'force' : 'normal'}`);
                onChunk('monthly report');
                if (serviceDelayMs > 0) await new Promise(resolve => setTimeout(resolve, serviceDelayMs));
                onComplete('monthly report');
            },
            generateProfileSuggestions: async (onChunk, onComplete) => {
                generated.push('profile');
                onChunk('profile report');
                if (serviceDelayMs > 0) await new Promise(resolve => setTimeout(resolve, serviceDelayMs));
                onComplete?.('profile report');
            },
        },
        planSuggestionService: {
            refreshAfterInsight: async () => {},
        },
        vaultManager: {
            getDailyNotesInRange: (start, end) => {
                return [...files.values()].filter(file => {
                    if (!file.path.startsWith('Daily/') || !file.path.endsWith('.md')) return false;
                    const date = moment(file.basename, 'YYYY-MM-DD', true);
                    return date.isValid() && date.isSameOrAfter(start, 'day') && date.isSameOrBefore(end, 'day');
                });
            },
            getWeeklyPlanPath: date => {
                const start = moment(date).startOf('isoWeek');
                return `Plans/Weekly/${start.isoWeekYear()}-W${String(start.isoWeek()).padStart(2, '0')}.md`;
            },
            getMonthlyPlanPath: date => `Plans/Monthly/${moment(date).format('YYYY-MM')}.md`,
        },
    };
    const host = {
        app,
        plugin,
        insightsMode: mode,
        switchTab: tab => { switched.push(tab); },
        invalidateTabCache: () => {},
    };

    const addLoopDay = date => {
        const key = `Daily/${moment(date).format('YYYY-MM-DD')}.md`;
        files.set(key, new TFile(key, '## 计划\n- [ ] Demo task\n\n## 复盘\nReview done\n'));
    };
    for (let day = 1; day <= loopCount; day++) {
        addLoopDay(moment().startOf('month').date(day));
    }

    return { app, plugin, files, insightChildren, opened, generated, switched, host, renderer: new InsightsRenderer(host) };
}

console.log('\n=== PERIODIC ACTION REGRESSION TESTS ===\n');

{
    const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
    const source = fs.readFileSync(path.join(__dirname, 'src/views/periodic-renderer.ts'), 'utf8');
    const eveningSource = fs.readFileSync(path.join(__dirname, 'src/sop/evening-sop.ts'), 'utf8');
    const controllerSource = fs.readFileSync(path.join(__dirname, 'src/views/chat-controller.ts'), 'utf8');
    const chatViewSource = fs.readFileSync(path.join(__dirname, 'src/views/chat-view.ts'), 'utf8');
    const promptSource = fs.readFileSync(path.join(__dirname, 'src/sop/prompts.ts'), 'utf8');
    const insightSource = fs.readFileSync(path.join(__dirname, 'src/services/insight-service.ts'), 'utf8');
    const insightRendererSource = fs.readFileSync(path.join(__dirname, 'src/views/insights-renderer.ts'), 'utf8');
    const zhSource = fs.readFileSync(path.join(__dirname, 'src/i18n/zh.ts'), 'utf8');
    const sourceFiles = readSourceFiles(path.join(__dirname, 'src'));
    const actionBlocks = [...css.matchAll(/^\.tl-task-actions\s*\{[\s\S]*?\n\}/gm)].map(match => match[0]);
    const actionsBlock = actionBlocks.at(-1) ?? '';
    const actionsHoverBlock = css.match(/\.tl-periodic-task-row:hover \.tl-task-actions\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    const captureActionsBlock = css.match(/\.tl-capture-actions\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    const captureActionsHoverBlock = css.match(/\.tl-capture-item:hover \.tl-capture-actions\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    const dateBlock = css.match(/\.tl-task-date-inline-btn\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    const captureScheduleBlock = css.match(/\.tl-capture-schedule-btn\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    const popupBlock = css.match(/\.tl-period-picker-popup\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    check(typeof document.createDiv === 'undefined', 'test environment does not polyfill document.createDiv');
    check(/opacity:\s*0\b/.test(actionsBlock), 'task action group is hidden before row hover');
    check(/pointer-events:\s*none/.test(actionsBlock), 'hidden task action group is not clickable before hover');
    check(/opacity:\s*1\b/.test(actionsHoverBlock), 'task action group appears on row hover');
    check(!css.includes('.tl-periodic-task-row:focus-within .tl-task-actions'), 'desktop task action group does not stay visible after button focus');
    check(!/opacity\s*:/.test(dateBlock), 'date button does not override hover-only visibility');
    check(/color:\s*var\(--tl-text-tertiary\)/.test(dateBlock), 'date button uses the same default color as other task actions');
    check(/background:\s*transparent/.test(dateBlock), 'date button default background matches other task actions');
    check(!css.includes('.tl-periodic-task-row:hover .tl-task-date-inline-btn,'), 'row hover alone does not highlight the date action');
    check(/color:\s*var\(--tl-text-tertiary\)/.test(captureScheduleBlock), 'capture schedule button uses the same default color as other capture actions');
    check(/background:\s*transparent/.test(captureScheduleBlock), 'capture schedule button default background matches other capture actions');
    check(/z-index:\s*100000/.test(popupBlock), 'period picker renders above Obsidian panes');
    check(/width:\s*min\(272px/.test(popupBlock), 'day period picker uses a compact width');
    check(css.includes('.tl-period-picker-popup-week'), 'week period picker has a distinct compact layout');
    check(css.includes('.tl-period-picker-popup-month'), 'month period picker has a distinct compact layout');
    check(/opacity:\s*0\b/.test(captureActionsBlock), 'capture item actions are hidden before hover');
    check(/pointer-events:\s*none/.test(captureActionsBlock), 'hidden capture actions are not clickable before hover');
    check(/opacity:\s*1\b/.test(captureActionsHoverBlock), 'capture item actions appear on hover');
    check(source.includes('activeDocument.body.createDiv(`tl-period-picker-popup'), 'period picker is attached directly to document body');
    check(!source.includes('activeDocument.createDiv('), 'task actions do not use nonstandard document.createDiv');
    check(!source.includes('activeDocument.createEl('), 'task actions do not use nonstandard document.createEl');
    check(!source.includes('generateSuggestions(scope'), 'Plan UI does not manually trigger AI suggestion generation');
    check(!css.includes('tl-plan-suggestion-generate-btn'), 'Plan suggestion UI has no manual generate button styling');
    check(
        eveningSource.indexOf('await this.plugin.planSuggestionService?.refreshAfterDailyReview(context);') > -1
        && eveningSource.indexOf('await this.plugin.planSuggestionService?.refreshAfterDailyReview(context);') < eveningSource.indexOf('onMessage(summary);'),
        'Daily Review waits for plan suggestions before sending completion message',
    );
    check(controllerSource.includes('markDailyReviewCompleted();'), 'Daily Review completion notifies the Plan view');
    check(chatViewSource.includes('tl-review-complete-state'), 'Review home renders a completed state instead of only a start button');
    check(chatViewSource.includes("t('review.todayLoopComplete')"), 'Review home can show today loop completion copy');
    check(chatViewSource.includes("const todayData = await loadDayLoopData"), 'Review action state reads today independently from the selected month');
    check(source.includes("if (task.done) {\n            createDeleteButton();\n            return;\n        }"), 'Completed task rows only render the delete action');
    check(source.includes("void h.switchTab('kanban');"), 'Task completion refreshes action visibility after toggling');
    check(chatViewSource.includes("{ id: 'capture', icon: 'inbox'"), 'Plan capture tab uses an inbox-style icon');
    check(chatViewSource.includes('tl-subnav-btn-icon-only'), 'Plan capture tab renders as icon-only');
    check(chatViewSource.includes("if (!isCapture)"), 'Plan capture tab omits visible text label');
    check(css.includes('.tl-subnav-btn-icon-only'), 'icon-only subnav button has dedicated compact styling');
    check(css.includes('--tl-nav-rail'), 'subnav uses an attached rail surface for parent-child hierarchy');
    check(!css.includes('.tl-tab-bar-wrap[data-has-subnav="true"]::after'), 'old active parent bubble lobe is removed');
    check(!css.includes('--tl-nav-lobe-left') && !css.includes('--tl-nav-tray'), 'old bubble positioning variables are removed');
    check(/height:\s*38px/.test(css.match(/\.tl-tab-btn\s*\{[\s\S]*?\n\}/)?.[0] ?? '') && /min-height:\s*30px/.test(css.match(/\.tl-subnav-btn\s*\{[\s\S]*?\n\}/)?.[0] ?? ''), 'parent tabs stay visually larger than child tabs');
    check(css.includes('.tl-insights-primary-btn-ready:hover'), 'Insights ready action has a polished hover state');
    check(css.includes('.tl-insights-open-doc-btn'), 'Insights full-report action uses the current compact document button style');
    check(css.includes('@keyframes tl-insights-spin'), 'Insights generation has a loading animation');
    check(css.includes('.tl-insights-primary-btn-loading:disabled'), 'Insights loading button stays visually active while disabled');
    check(!zhSource.includes('当前周期只能生成一次。请确认记录已经准备好。'), 'Insights ready copy is concise');
    check(!zhSource.includes("'insights.onceNotice': '本周期已生成，只能查看。'"), 'Insights no longer uses redundant generated-period notice');
    check(css.includes('.tl-periodic-goal-chip'), 'goal reminder uses compact chip styling');
    check(css.includes('.tl-periodic-goal-summary-toggle svg'), 'goal reminder uses icon chevron styling');
    check(css.includes('.tl-periodic-goal-item'), 'expanded goal reminder uses compact item rows');
    check(css.includes('.tl-periodic-goal-index'), 'expanded goal reminder uses numbered goal markers');
    check(chatViewSource.includes('reviewSelectedDate'), 'Review home tracks an explicitly selected date');
    check(chatViewSource.includes("t('review.backfillReview')"), 'Review home renders a backfill review action for historical dates');
    check(chatViewSource.includes('tl-review-loop-day-selected'), 'Review calendar has a selected-day visual state');
    check(!chatViewSource.includes('tl-review-loop-today-label') && css.includes('.tl-review-loop-day-today::after'), 'Review calendar marks today graphically instead of visible text');
    check(insightRendererSource.includes('renderReportPreview') && css.includes('.tl-insights-report-preview'), 'existing Insights reports render an inline preview');
    check(insightRendererSource.includes('await this.renderReportPreview(card, existing);'), 'AI profile also renders an inline preview when the monthly profile exists');
    check(insightSource.includes('options.force') && insightSource.includes('readWeeklyPlanContext') && insightSource.includes('readMonthlyPlanContext'), 'Insight generation supports forced refresh and includes plan context');
    check(promptSource.includes('<new_patterns>') && promptSource.includes('<new_principles>') && promptSource.includes('<profile_update>'), 'Insight prompts preserve machine-readable extraction tags');
    check(promptSource.includes('不得编造') && promptSource.includes('Do not invent'), 'Insight prompts include no-fabrication constraints');
    check(promptSource.includes('证据') && promptSource.includes('Evidence'), 'Insight prompts require evidence-led analysis');
    check(promptSource.includes('避免套话') && promptSource.includes('Avoid cliches'), 'Insight prompts explicitly reject obvious AI/cliche wording');
    check(
        !sourceFiles.some(({ content }) => /\.vault\.getFiles\s*\(/.test(content) || /getMarkdownFiles\s*\(/.test(content)),
        'production code avoids full vault enumeration APIs',
    );
}

{
    const { files, view } = createHarness();
    const today = moment().format('YYYY-MM-DD');
    files.set(`Daily/${today}.md`, new TFile(`Daily/${today}.md`, '## 计划\n- [ ] Today task\n\n## 复盘\nReview completed\n'));
    const defaultDate = await view.getDefaultPlanDate();
    check(defaultDate.isSame(moment().add(1, 'day'), 'day'), 'Plan defaults to tomorrow when today already has a review');
}

{
    const { files, view } = createHarness();
    const today = moment().format('YYYY-MM-DD');
    files.set(`Daily/${today}.md`, new TFile(`Daily/${today}.md`, '## 计划\n- [ ] Today task\n\n## 复盘\n<!-- empty -->\n'));
    const defaultDate = await view.getDefaultPlanDate();
    check(defaultDate.isSame(moment(), 'day'), 'Plan defaults to today before review completion');
}

{
    const { renderer, generated } = createInsightsHarness('monthly');
    const panel = document.createElement('div');
    await renderer.render(panel);
    const btn = panel.querySelector('.tl-insights-primary-btn');
    check(!!btn && !btn.disabled, 'monthly report button is clickable once loop threshold is unlocked');
    check(!panel.textContent.includes('已解锁') && !panel.textContent.includes('Unlocked'), 'monthly report no longer shows awkward unlocked badge text');
    check(!panel.textContent.includes('每月最后一天生成'), 'unlocked monthly report is not blocked by month-end copy');
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    check(generated.some(item => item.startsWith('monthly:')), 'monthly report action calls monthly generation');
}

{
    const { renderer } = createInsightsHarness('weekly', 2);
    const panel = document.createElement('div');
    await renderer.render(panel);
    const btn = panel.querySelector('.tl-insights-primary-btn');
    check(!!btn && btn.disabled, 'locked weekly report keeps the primary action disabled');
    check(btn.textContent.includes('还差') || btn.textContent.includes('more loops'), 'locked weekly report explains remaining loops in the action area');
    check(!panel.textContent.includes('收集中') && !panel.textContent.includes('Collecting'), 'locked weekly report omits separate collecting badge');
}

{
    const { renderer, files, insightChildren } = createInsightsHarness('monthly');
    const monthKey = moment().format('YYYY-MM');
    const report = new TFile(`Archive/Insights/${monthKey}-月报.md`, `# Monthly

这一月的重点是把任务重新收束。

## 事实证据
- 完成了几次闭环。

## 模式判断
- 周中容易分散。

## 下一步
- 把明天第一件事写清楚。

## 不应出现在预览的第四段
- Too far.
`);
    files.set(report.path, report);
    insightChildren.push(report);
    const panel = document.createElement('div');
    await renderer.render(panel);
    const btn = panel.querySelector('.tl-insights-primary-btn');
    check(!!btn && !btn.disabled, 'existing monthly report view button remains clickable');
    check(btn.textContent.includes('完整') || btn.textContent.includes('full'), 'existing monthly report switches to full-report action');
    check(!!panel.querySelector('.tl-insights-report-preview'), 'existing monthly report renders inline preview');
    check(panel.textContent.includes('事实证据') && panel.textContent.includes('下一步'), 'existing monthly report preview includes key sections');
    check(!panel.textContent.includes('第四段') && !panel.textContent.includes('Too far'), 'existing monthly report preview stays brief');
    check(!panel.textContent.includes('本周期已生成') && !panel.textContent.includes('Generated once'), 'existing monthly report omits redundant generated-period notice');
}

{
    const { renderer, files, insightChildren, generated } = createInsightsHarness('monthly');
    const monthKey = moment().format('YYYY-MM');
    const oldMtime = Date.now() - 60_000;
    const report = new TFile(`Archive/Insights/${monthKey}-月报.md`, '# Monthly', oldMtime);
    files.set(report.path, report);
    insightChildren.push(report);
    files.set(`Plans/Monthly/${monthKey}.md`, new TFile(`Plans/Monthly/${monthKey}.md`, '# Month\n- [ ] New goal\n', Date.now()));
    const panel = document.createElement('div');
    await renderer.render(panel);
    const buttons = [...panel.querySelectorAll('.tl-insights-primary-btn')];
    check(buttons.length === 2, 'stale monthly report renders view and update actions');
    check(buttons[0].textContent.includes('完整') || buttons[0].textContent.includes('full'), 'stale report keeps full-report action first');
    check(buttons[1].textContent.includes('更新') || buttons[1].textContent.includes('Update'), 'stale report offers update action');
    buttons[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    check(generated.some(item => item.startsWith('monthly:') && item.endsWith(':force')), 'stale monthly update regenerates with force');
}

{
    const { renderer } = createInsightsHarness('monthly', 8, 20);
    const panel = document.createElement('div');
    await renderer.render(panel);
    const btn = panel.querySelector('.tl-insights-primary-btn');
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    check(btn.classList.contains('tl-insights-primary-btn-loading'), 'monthly report button enters loading state while generating');
    check(!!btn.querySelector('.tl-insights-spinner'), 'monthly report button renders a loading spinner');
    check(btn.textContent.includes('30-90') || btn.textContent.includes('30-90 seconds'), 'monthly report loading text gives a time expectation');
    await new Promise(resolve => setTimeout(resolve, 25));
}

{
    const { renderer, files, insightChildren, opened } = createInsightsHarness('profile');
    const monthKey = moment().format('YYYY-MM');
    const profile = new TFile(`Archive/Insights/${monthKey}-画像更新.md`, `# AI Profile

这个月的你更像是在收束注意力。

## 事实证据
- 你多次把任务重新拆小。

## 模式判断
- 容易在周中切换方向。

## 下一步
- 先固定每天第一件事。

<profile_update>
internal tag
</profile_update>
`);
    files.set(profile.path, profile);
    insightChildren.push(profile);
    const panel = document.createElement('div');
    await renderer.render(panel);
    const btn = panel.querySelector('.tl-insights-primary-btn');
    check(!!btn && !btn.disabled, 'profile insight view button remains clickable when this month already has a profile');
    check(btn.textContent.includes('完整') || btn.textContent.includes('full'), 'profile insight uses the full-report action after monthly generation exists');
    check(btn.classList.contains('tl-insights-open-doc-btn'), 'profile full-report action uses the compact document button style');
    check(!!panel.querySelector('.tl-insights-report-preview'), 'profile insight renders inline preview in the plugin page');
    check(panel.textContent.includes('事实证据') && panel.textContent.includes('下一步'), 'profile insight preview includes readable key sections');
    check(!panel.textContent.includes('internal tag') && !panel.textContent.includes('profile_update'), 'profile insight preview strips internal extraction tags');
    check(!panel.textContent.includes('每月一次') && !panel.textContent.includes('Once per month'), 'profile insight omits separate monthly-once badge');
    check(!panel.textContent.includes('本周期已生成') && !panel.textContent.includes('Generated once'), 'profile insight omits redundant generated-period notice');
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    check(opened.includes(profile.path), 'profile insight view action opens existing profile file');
}

{
    const { files, renderer } = createHarness();
    files.set('Plans/Weekly/2026-W21.md', new TFile('Plans/Weekly/2026-W21.md', `# 2026-W21

## Backlog
- [ ] Backlog one
- [ ] Backlog two

## 周一
- [x] Done one
- [x] Done two

## 周三
- [ ] Remaining three
- [ ] Remaining four

## 周四
- [ ] Remaining five

## 周五
- [ ] Remaining six

## 周六
- [ ] Remaining seven

## 周日
- [ ] Remaining eight
`));
    files.set('Plans/Monthly/2026-05.md', new TFile('Plans/Monthly/2026-05.md', `# 2026-05 月计划

## 月度目标
1. Goal one
2. Goal two
3. Goal three
4. Goal four

## 关键里程碑
- [x] Milestone one
- [x] Milestone two
- [x] Milestone three
- [ ] Milestone four

## 成长重点
- Should not be counted
`));
    const panel = document.createElement('div');
    await renderer.render(panel);
    const counts = [...panel.querySelectorAll('.tl-periodic-goal-chip-count')].map(el => el.textContent);
    check(counts[0] === '8', 'goal reminder counts remaining weekly tasks instead of excluding checkboxes');
    check(counts[1] === '8', 'goal reminder counts monthly goals from goal sections only');
    check(!panel.textContent.includes('Should not be counted'), 'goal reminder excludes unrelated monthly bullet sections');
    check(!panel.textContent.includes('展开') && !panel.textContent.includes('Expand'), 'goal reminder does not render text expand control');
    check(panel.querySelector('.tl-periodic-goal-summary-toggle')?.dataset.icon === 'chevron-down', 'goal reminder uses chevron icon for collapsed state');
    check(!!panel.querySelector('.tl-periodic-goal-group-week') && !!panel.querySelector('.tl-periodic-goal-group-month'), 'expanded goal reminder renders distinct week and month groups');
    check(panel.querySelectorAll('.tl-periodic-goal-item').length === 16, 'expanded goal reminder renders all compact week and month goal items');
    check(panel.querySelector('.tl-periodic-goal-index')?.textContent === '1', 'expanded goal reminder starts item numbering at one');
    check(!panel.textContent.includes('📋') && !panel.textContent.includes('🎯'), 'expanded goal reminder avoids old emoji section titles');
}

{
    const { files, renderer } = createHarness();
    const file = new TFile('Daily/2026-05-19.md', '## 计划\n- [x] Done task\n');
    files.set(file.path, file);
    const panel = document.createElement('div');
    await renderer.render(panel);
    check(!!panel.querySelector('.tl-task-delete-btn'), 'completed task keeps delete action');
    check(!panel.querySelector('.tl-task-sub-btn'), 'completed task hides add-subtask action');
    check(!panel.querySelector('.tl-task-date-inline-btn'), 'completed task hides reschedule action');
    check(!panel.querySelector('.tl-task-drag-handle'), 'completed task hides drag action');
}

{
    const { files, app, plugin } = createHarness();
    const today = moment().format('YYYY-MM-DD');
    files.set(`Daily/${today}.md`, new TFile(`Daily/${today}.md`, '## 计划\n- [ ] Today task\n\n## 复盘\nReview completed\n'));
    const view = new ChatView({ app }, plugin);
    view.reviewHomeEl = document.createElement('div');
    view.reviewSelectedMonth = moment();
    view.reviewSelectedDate = moment();
    await view.renderReviewHome();
    check(view.reviewHomeEl.textContent.includes('今日完成了闭环'), 'Review home shows today completed-loop state when today is selected');
    check(!view.reviewHomeEl.textContent.includes('开始今日复盘'), 'Review home does not show start button after today is reviewed');
}

{
    const { files, app, plugin } = createHarness();
    const past = moment().subtract(2, 'days');
    const view = new ChatView({ app }, plugin);
    let backfillTarget = null;
    view.startSOP = (type, targetDate) => { backfillTarget = `${type}:${targetDate.format('YYYY-MM-DD')}`; };
    view.reviewHomeEl = document.createElement('div');
    view.reviewSelectedMonth = past.clone();
    view.reviewSelectedDate = past.clone();
    await view.renderReviewHome();
    const backfillBtn = view.reviewHomeEl.querySelector('.tl-review-start-btn');
    check(view.reviewHomeEl.textContent.includes('补上这天的复盘') || view.reviewHomeEl.textContent.includes('Catch up'), 'Review home offers a backfill action for past dates without review');
    backfillBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check(backfillTarget === `evening:${past.format('YYYY-MM-DD')}`, 'Review backfill starts Daily Review for the selected historical date');
    check(!!view.reviewHomeEl.querySelector('.tl-review-loop-day-selected'), 'Review calendar marks selected day');
    check(!view.reviewHomeEl.textContent.includes('今天') && !view.reviewHomeEl.textContent.includes('Today'), 'Review calendar does not mark today with visible text');
    check(!!view.reviewHomeEl.querySelector('.tl-review-loop-day-today'), 'Review calendar keeps a graphical today marker');
}

{
    const { files, view } = createHarness();
    const file = new TFile('Daily/2026-05-19.md', '## 计划\n- [ ] Parent\n  - [ ] Existing child\n- [ ] Next\n');
    files.set(file.path, file);
    await view.addSubTask(file, 'Parent', 'New child', 0);
    check(
        file.content.includes('- [ ] Parent\n  - [ ] Existing child\n  - [ ] New child\n- [ ] Next'),
        'addSubTask inserts after existing children and before next parent',
    );
}

{
    const { files, view } = createHarness();
    const file = new TFile('Plans/Weekly/2026-W21.md', '# Week\n1. [ ] Number parent\n2. [ ] Next\n');
    files.set(file.path, file);
    await view.addSubTask(file, 'Number parent', 'Number child', 0);
    check(
        file.content.includes('1. [ ] Number parent\n  - [ ] Number child\n2. [ ] Next'),
        'addSubTask supports numbered checkbox parents',
    );
}

{
    const { files, renderer } = createHarness();
    const file = new TFile('Daily/2026-05-19.md', '## 计划\n- [ ] UI Parent\n- [ ] Next\n');
    files.set(file.path, file);
    const panel = document.createElement('div');
    await renderer.render(panel);
    const subBtn = panel.querySelector('.tl-task-sub-btn');
    subBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const subInput = panel.querySelector('.tl-subtask-input');
    check(!!subInput, 'add-subtask action opens an inline input in the rendered UI');
    subInput.value = 'UI child';
    subInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    check(
        file.content.includes('- [ ] UI Parent\n  - [ ] UI child\n- [ ] Next'),
        'add-subtask UI writes child under the parent task',
    );
}

{
    const { files, view, renderer } = createHarness();
    const file = new TFile('Daily/2026-05-19.md', '## 计划\n- [ ] Move me\n');
    files.set(file.path, file);
    const panel = document.createElement('div');
    await renderer.render(panel);
    const dateBtn = panel.querySelector('.tl-task-date-inline-btn');
    dateBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const popup = document.querySelector('.tl-period-picker-popup-day');
    check(!!popup, 'task date button opens TideLog day picker');
    check(!document.querySelector('.tl-task-date-hidden-input'), 'task date picker no longer creates hidden native input');
    const targetDay = [...popup.querySelectorAll('.tl-period-picker-cell')]
        .find(btn => btn.textContent === '20' && !btn.classList.contains('tl-period-picker-cell-muted'));
    targetDay.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    check(files.get('Daily/2026-05-20.md')?.content.includes('- [ ] Move me'), 'day picker moves task to chosen daily note');
    check(!file.content.includes('- [ ] Move me'), 'day picker removes task from original daily note');
}

{
    const { files, view, renderer } = createHarness();
    files.set('Plans/Weekly/2026-W21.md', new TFile('Plans/Weekly/2026-W21.md', '# Week\n- [ ] Weekly task\n'));
    view.periodicMode = 'week';
    let panel = document.createElement('div');
    await renderer.render(panel);
    check(panel.querySelector('.tl-task-date-inline-btn')?.dataset.icon === 'calendar-clock', 'week task uses the same date icon');

    files.set('Plans/Monthly/2026-05.md', new TFile('Plans/Monthly/2026-05.md', '# Month\n- [ ] Monthly task\n'));
    view.periodicMode = 'month';
    panel = document.createElement('div');
    await renderer.render(panel);
    check(panel.querySelector('.tl-task-date-inline-btn')?.dataset.icon === 'calendar-clock', 'month task uses the same date icon');

    view.periodicMode = 'capture';
    const harness = createHarness();
    harness.captures.push('Captured idea');
    harness.view.periodicMode = 'capture';
    panel = document.createElement('div');
    await harness.renderer.render(panel);
    check(panel.querySelector('.tl-capture-schedule-btn')?.dataset.icon === 'calendar-clock', 'capture item uses the same date icon');
}

{
    const { captures, renderer, view } = createHarness();
    view.periodicMode = 'capture';
    const panel = document.createElement('div');
    await renderer.render(panel);
    const captureList = panel.querySelector('.tl-capture-list');
    const inputRow = panel.querySelector('.tl-capture-input-row');
    check(
        !!captureList && !!inputRow && !!(captureList.compareDocumentPosition(inputRow) & window.Node.DOCUMENT_POSITION_FOLLOWING),
        'capture input row renders below the idea list',
    );
    const input = panel.querySelector('.tl-capture-input');
    const addBtn = panel.querySelector('.tl-capture-add-btn');
    input.value = 'Fresh idea';
    addBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    check(captures.includes('Fresh idea'), 'capture input add button stores a new idea');
}

{
    const { renderer, view } = createHarness();
    view.periodicMode = 'month';
    const panel = document.createElement('div');
    await renderer.render(panel);
    check(panel.querySelector('.tl-periodic-period-title')?.textContent.includes('2026'), 'month header renders month title');
    check(!panel.querySelector('.tl-periodic-period-subtitle'), 'month header omits redundant click hint');
}

{
    const { captures, files, renderer, view } = createHarness();
    captures.push('Promote idea');
    view.periodicMode = 'capture';
    const panel = document.createElement('div');
    await renderer.render(panel);
    panel.querySelector('.tl-capture-schedule-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check(global.__lastMenu?.items?.length === 3, 'capture schedule menu has day/week/month choices only');
    check(!global.__lastMenu.items.some(item => item.title === '自定义' || item.title === 'Custom'), 'capture schedule menu removed custom choice');
    global.__lastMenu.items[1].callback();
    const popup = document.querySelector('.tl-period-picker-popup-week');
    check(!!popup, 'capture week choice opens concrete week picker');
    const targetWeek = popup.querySelector('.tl-period-picker-week-option-current');
    const currentWeekStart = moment().startOf('isoWeek');
    const currentWeekPath = `Plans/Weekly/${currentWeekStart.isoWeekYear()}-W${String(currentWeekStart.isoWeek()).padStart(2, '0')}.md`;
    check(
        !!targetWeek?.querySelector('.tl-period-picker-week-option-range')?.textContent.match(/\d+\/\d+\s*-\s*\d+\/\d+/),
        'week picker uses week-range options instead of day cells',
    );
    targetWeek?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    check(files.get(currentWeekPath)?.content.includes('- [ ] Promote idea'), 'capture week picker writes selected weekly plan');
    check(!captures.includes('Promote idea'), 'capture item is removed after promotion');
}

{
    const { renderer, view } = createHarness();
    for (const mode of ['day', 'week', 'month']) {
        view.periodicMode = mode;
        const panel = document.createElement('div');
        await renderer.render(panel);
        const inputRow = panel.querySelector('.tl-periodic-task-input-row');
        const suggestion = panel.querySelector('.tl-plan-suggestion');
        check(!!suggestion, `${mode} plan renders an AI suggestion card below the task input`);
        check(!panel.querySelector('.tl-plan-suggestion-generate-btn'), `${mode} plan suggestion card has no manual generate button`);
        check(!panel.querySelector('.tl-plan-suggestion-meta'), `${mode} plan suggestion hides guidance text after suggestions exist`);
        check(
            !!inputRow && !!suggestion && !!(inputRow.compareDocumentPosition(suggestion) & window.Node.DOCUMENT_POSITION_FOLLOWING),
            `${mode} plan suggestion is positioned after the task input row`,
        );
    }
}

{
    const { renderer, view } = createHarness();
    view.plugin.planSuggestionService.getCachedSuggestions = async () => null;
    view.periodicMode = 'day';
    const panel = document.createElement('div');
    await renderer.render(panel);
    check(!!panel.querySelector('.tl-plan-suggestion-meta'), 'empty plan suggestion keeps automatic-update guidance text');
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);

try { fs.unlinkSync(mockPath); } catch {}
try { fs.unlinkSync(entryPath); } catch {}
process.exit(fail === 0 ? 0 : 1);
