/**
 * Regression tests for AI planning suggestions:
 * - day/week/month suggestions are cached per target period
 * - generated lines are normalized into the TideLog suggestion format
 * - Daily Review refresh updates day/week/month suggestions in one user-triggered loop
 */

import path from 'path';
import url from 'url';
import fs from 'fs';
import esbuild from 'esbuild';
import { createRequire } from 'module';
import moment from 'moment';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const mockPath = path.join(__dirname, 'obsidian-mock-plan-suggestions.cjs');
fs.writeFileSync(
    mockPath,
    `
class TFile {
    constructor(path, content = '') {
        this.path = path;
        this.content = content;
        this.extension = 'md';
        this.basename = path.split('/').pop().replace(/\\.md$/, '');
    }
}
module.exports = {
    TFile,
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

const entryPath = path.join(__dirname, '.test-plan-suggestions-entry.ts');
fs.writeFileSync(entryPath, `
export { PlanSuggestionService } from ${JSON.stringify(path.join(__dirname, 'src/services/plan-suggestion-service.ts'))};
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
const { PlanSuggestionService } = mod.exports;

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

function createHarness() {
    const files = new Map();
    const folders = new Set(['Daily', 'Archive', 'Plans', 'Plans/Weekly', 'Plans/Monthly']);
    const providerCalls = [];

    const addFile = (filePath, content) => {
        const file = new TFile(filePath, content);
        files.set(filePath, file);
        return file;
    };

    addFile('Daily/2026-05-18.md', `# 2026-05-18

## 计划
- [x] 整理插件反馈
- [ ] 修复计划建议

## 复盘
今天发现计划建议被 UI 改版挤掉了，需要恢复到添加任务下方，并且让日周月都能看到不同建议。

## 明日计划
继续验证计划建议闭环。
`);
    addFile('Daily/2026-05-19.md', `# 2026-05-19

## 计划
- [ ] 继续修计划 UI

## 复盘
需要减少重复信息，恢复 AI 个性化提醒。
`);
    addFile('Plans/Weekly/2026-W21.md', '# Week\n- [ ] 本周完成计划建议恢复\n');
    addFile('Plans/Monthly/2026-05.md', '# Month\n- [ ] 本月完成 TideLog 改版内测\n');

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
    };

    const plugin = {
        app,
        settings: {
            dailyFolder: 'Daily',
            planFolder: 'Plans',
            archiveFolder: 'Archive',
        },
        getAIProvider: () => ({
            name: 'mock',
            sendMessage: async (messages, systemPrompt) => {
                providerCalls.push({ messages, systemPrompt });
                return '1. 优先修复计划建议\n- 把建议放回输入框下方\n💡 复盘后刷新后续计划';
            },
        }),
        vaultManager: {
            getDailyNotesInRange: (start, end) => [...files.values()]
                .filter(file => file.path.startsWith('Daily/'))
                .filter(file => {
                    const d = moment(file.basename, 'YYYY-MM-DD');
                    return d.isValid() && d.isSameOrAfter(start, 'day') && d.isSameOrBefore(end, 'day');
                })
                .sort((a, b) => a.basename.localeCompare(b.basename)),
            getWeeklyPlanPath: date => {
                const d = moment(date).startOf('isoWeek');
                return `Plans/Weekly/${d.isoWeekYear()}-W${String(d.isoWeek()).padStart(2, '0')}.md`;
            },
            getMonthlyPlanPath: date => `Plans/Monthly/${moment(date).format('YYYY-MM')}.md`,
            getUserProfileContent: async () => '用户会持续迭代 TideLog，并重视低认知负担。',
            getPatternsContent: async () => '如果 UI 变复杂，用户会快速发现并要求简化。',
            getPrinciplesContent: async () => '规划建议必须贴近真实任务和复盘。',
        },
    };

    return { files, providerCalls, service: new PlanSuggestionService(plugin) };
}

console.log('\n=== PLAN SUGGESTION SERVICE TESTS ===\n');

{
    const { files, providerCalls, service } = createHarness();
    const target = moment('2026-05-20');
    const dayLines = await service.generateSuggestions('day', target, { source: 'manual', force: true });
    check(dayLines.length === 3, 'day generation returns normalized suggestion lines');
    check(dayLines.every(line => line.startsWith('💡')), 'generated suggestions all start with the suggestion marker');
    check(files.has('Archive/plan_suggestions/day/2026-05-20.md'), 'day suggestions are saved to the day cache path');

    const cached = await service.getCachedSuggestions('day', target);
    check(cached?.[0] === dayLines[0], 'day suggestions can be read back from cache');

    await service.generateSuggestions('week', target, { source: 'manual', force: true });
    await service.generateSuggestions('month', target, { source: 'manual', force: true });
    check(files.has('Archive/plan_suggestions/week/2026-W21.md'), 'week suggestions are saved to the week cache path');
    check(files.has('Archive/plan_suggestions/month/2026-05.md'), 'month suggestions are saved to the month cache path');
    check(providerCalls.length === 3, 'manual day/week/month generation makes one AI call per scope');
}

{
    const { files, providerCalls, service } = createHarness();
    await service.refreshAfterDailyReview({
        type: 'evening',
        currentStep: 0,
        responses: {
            reflection: '今天确认 AI 计划建议需要恢复。',
            tomorrow_plan: '明天检查日、周、月建议是否都在输入框下方。',
        },
    });

    check(providerCalls.length === 3, 'Daily Review refresh generates day/week/month suggestions');
    check(files.has(`Archive/plan_suggestions/day/${moment().add(1, 'day').format('YYYY-MM-DD')}.md`), 'Daily Review refresh writes tomorrow day suggestions');
    check(files.has(`Archive/plan_suggestions/week/${moment().add(1, 'day').startOf('isoWeek').isoWeekYear()}-W${String(moment().add(1, 'day').startOf('isoWeek').isoWeek()).padStart(2, '0')}.md`), 'Daily Review refresh writes current week suggestions');
    check(files.has(`Archive/plan_suggestions/month/${moment().add(1, 'day').format('YYYY-MM')}.md`), 'Daily Review refresh writes current month suggestions');
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);

try { fs.unlinkSync(mockPath); } catch {}
try { fs.unlinkSync(entryPath); } catch {}
process.exit(fail === 0 ? 0 : 1);
