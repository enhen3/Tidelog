/**
 * Plan Suggestion Service
 *
 * Builds AI planning suggestions for day/week/month planning surfaces and
 * stores them per target period so Plan can render without calling AI.
 */

import { TFile, moment } from 'obsidian';
import type TideLogPlugin from '../main';
import type { ChatMessage, SOPContext } from '../types';
import { getLanguage } from '../i18n';
import { replaceFile } from '../utils/vault-write';
import { formatPlanSuggestionsDocument } from '../utils/document-format';

export type PlanSuggestionScope = 'day' | 'week' | 'month';

interface GenerateOptions {
    source?: 'manual' | 'review' | 'insight';
    reviewSummary?: string;
    force?: boolean;
}

export class PlanSuggestionService {
    constructor(private plugin: TideLogPlugin) { }

    async getCachedSuggestions(scope: PlanSuggestionScope, date: moment.Moment): Promise<string[] | null> {
        const path = this.getSuggestionPath(scope, date);
        const lines = await this.readSuggestionLines(path);
        if (lines.length > 0) return lines;

        if (scope === 'day') {
            const legacy = await this.readLegacyDaySuggestions(date);
            if (legacy.length > 0) return legacy;
        }

        return null;
    }

    async generateSuggestions(
        scope: PlanSuggestionScope,
        date: moment.Moment,
        options: GenerateOptions = {},
    ): Promise<string[]> {
        if (!options.force) {
            const cached = await this.getCachedSuggestions(scope, date);
            if (cached && cached.length > 0) return cached;
        }

        const context = await this.buildPlanningContext(scope, date, options.reviewSummary);
        if (!context.trim()) return [];

        const provider = this.plugin.getAIProvider();
        const systemPrompt = this.buildSystemPrompt(scope, date);
        const targetLabel = this.formatTargetLabel(scope, date);
        const userPrompt = getLanguage() === 'en'
            ? `Target: ${targetLabel}\n\nPlanning context:\n${context}`
            : `目标周期：${targetLabel}\n\n规划上下文：\n${context}`;
        const messages: ChatMessage[] = [{ role: 'user', content: userPrompt, timestamp: Date.now() }];
        const response = await provider.sendMessage(messages, systemPrompt, () => { /* background generation */ });
        const lines = this.normalizeSuggestionLines(response);
        if (lines.length === 0) return [];

        await this.saveSuggestions(scope, date, lines, options.source ?? 'manual');
        return lines;
    }

    async refreshAfterDailyReview(context: SOPContext): Promise<void> {
        const reviewSummary = this.buildReviewSummary(context);
        if (!reviewSummary) return;

        const target = moment().add(1, 'day');
        await Promise.allSettled([
            this.generateSuggestions('day', target, { source: 'review', reviewSummary, force: true }),
            this.generateSuggestions('week', target, { source: 'review', reviewSummary, force: true }),
            this.generateSuggestions('month', target, { source: 'review', reviewSummary, force: true }),
        ]);
    }

    async refreshAfterInsight(kind: 'weekly' | 'monthly', target: moment.Moment): Promise<void> {
        const next = kind === 'weekly'
            ? moment(target).add(1, 'week').startOf('isoWeek')
            : moment(target).add(1, 'month').startOf('month');

        if (kind === 'weekly') {
            await this.generateSuggestions('week', next, { source: 'insight', force: true });
        } else {
            await this.generateSuggestions('month', next, { source: 'insight', force: true });
        }
    }

    private getSuggestionPath(scope: PlanSuggestionScope, date: moment.Moment): string {
        return `${this.plugin.settings.archiveFolder}/plan_suggestions/${scope}/${this.getCacheKey(scope, date)}.md`;
    }

    private getCacheKey(scope: PlanSuggestionScope, date: moment.Moment): string {
        if (scope === 'day') return moment(date).format('YYYY-MM-DD');
        if (scope === 'week') {
            const d = moment(date).startOf('isoWeek');
            return `${d.isoWeekYear()}-W${String(d.isoWeek()).padStart(2, '0')}`;
        }
        return moment(date).format('YYYY-MM');
    }

    private formatTargetLabel(scope: PlanSuggestionScope, date: moment.Moment): string {
        if (scope === 'day') {
            return getLanguage() === 'en' ? moment(date).format('MMM D, YYYY') : moment(date).format('YYYY年M月D日');
        }
        if (scope === 'week') {
            const start = moment(date).startOf('isoWeek');
            const end = moment(start).add(6, 'days');
            return getLanguage() === 'en'
                ? `Week ${start.isoWeek()} (${start.format('MMM D')} - ${end.format('MMM D')})`
                : `${start.format('M月D日')} - ${end.format('M月D日')}`;
        }
        return getLanguage() === 'en' ? moment(date).format('MMMM YYYY') : moment(date).format('YYYY年M月');
    }

    private async readSuggestionLines(path: string): Promise<string[]> {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return [];
        const content = await this.plugin.app.vault.cachedRead(file);
        return this.normalizeSuggestionLines(this.stripFrontmatter(content));
    }

    private async readLegacyDaySuggestions(date: moment.Moment): Promise<string[]> {
        const path = `${this.plugin.settings.archiveFolder}/plan_suggestions.md`;
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return [];

        const content = await this.plugin.app.vault.cachedRead(file);
        const key = this.getCacheKey('day', date);
        const hasExplicitTarget = /^\s*(date|target):\s+/m.test(content);
        const matchesTarget = content.includes(`date: ${key}`) || content.includes(`target: ${key}`);
        if (hasExplicitTarget && !matchesTarget) return [];

        return this.normalizeSuggestionLines(this.stripFrontmatter(content));
    }

    private async saveSuggestions(
        scope: PlanSuggestionScope,
        date: moment.Moment,
        lines: string[],
        source: string,
    ): Promise<void> {
        const path = this.getSuggestionPath(scope, date);
        const folder = path.substring(0, path.lastIndexOf('/'));
        await this.ensureFolder(folder);

        const content = formatPlanSuggestionsDocument({
            scope,
            target: this.getCacheKey(scope, date),
            updated: new Date().toISOString(),
            source,
            lines,
        });

        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            await replaceFile(this.plugin.app, file, content);
        } else {
            await this.plugin.app.vault.create(path, content);
        }
    }

    private async ensureFolder(path: string): Promise<void> {
        const parts = path.split('/').filter(Boolean);
        let current = '';
        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            if (!this.plugin.app.vault.getAbstractFileByPath(current)) {
                await this.plugin.app.vault.createFolder(current);
            }
        }
    }

    private async buildPlanningContext(
        scope: PlanSuggestionScope,
        date: moment.Moment,
        reviewSummary?: string,
    ): Promise<string> {
        const parts: string[] = [];
        if (reviewSummary) {
            parts.push(getLanguage() === 'en' ? `Latest Daily Review\n${reviewSummary}` : `最新 Daily Review\n${reviewSummary}`);
        }

        if (scope === 'day') {
            const end = moment(date).subtract(1, 'day');
            const start = moment(end).subtract(6, 'days');
            parts.push(await this.buildDailyRangeSummary(start, end));
            parts.push(await this.readPlanFileSummary('week', date));
            parts.push(await this.readPlanFileSummary('month', date));
        } else if (scope === 'week') {
            const weekStart = moment(date).startOf('isoWeek');
            const historyEnd = moment(weekStart).subtract(1, 'day');
            const historyStart = moment(historyEnd).subtract(13, 'days');
            parts.push(await this.buildDailyRangeSummary(historyStart, historyEnd));
            parts.push(await this.readPlanFileSummary('week', weekStart));
            parts.push(await this.readPlanFileSummary('month', weekStart));
            parts.push(await this.readInsightSummary('weekly', moment(weekStart).subtract(1, 'week')));
        } else {
            const monthStart = moment(date).startOf('month');
            parts.push(await this.buildDailyRangeSummary(moment(monthStart).subtract(1, 'month'), moment(monthStart).subtract(1, 'day')));
            parts.push(await this.readPlanFileSummary('month', moment(monthStart).subtract(1, 'month')));
            parts.push(await this.readInsightSummary('monthly', moment(monthStart).subtract(1, 'month')));
        }

        const [profile, patterns, principles] = await Promise.all([
            this.plugin.vaultManager.getUserProfileContent(),
            this.plugin.vaultManager.getPatternsContent(),
            this.plugin.vaultManager.getPrinciplesContent(),
        ]);
        if (profile) parts.push(this.clip(getLanguage() === 'en' ? `User Profile\n${profile}` : `用户画像\n${profile}`, 1400));
        if (patterns) parts.push(this.clip(getLanguage() === 'en' ? `Known Patterns\n${patterns}` : `已知行为模式\n${patterns}`, 1200));
        if (principles) parts.push(this.clip(getLanguage() === 'en' ? `Known Principles\n${principles}` : `已知原则\n${principles}`, 1000));

        return parts.filter(p => p.trim()).join('\n\n---\n\n').slice(0, 10000);
    }

    private async buildDailyRangeSummary(start: moment.Moment, end: moment.Moment): Promise<string> {
        const files = this.plugin.vaultManager.getDailyNotesInRange(start, end);
        if (files.length === 0) return '';

        const summaries = await Promise.all(files.slice(-14).map(async file => this.compactDailyNote(file)));
        const title = getLanguage() === 'en'
            ? `Recent daily data (${start.format('YYYY-MM-DD')} - ${end.format('YYYY-MM-DD')})`
            : `近期日记录（${start.format('YYYY-MM-DD')} - ${end.format('YYYY-MM-DD')}）`;
        return `${title}\n${summaries.filter(Boolean).join('\n\n')}`;
    }

    private async compactDailyNote(file: TFile): Promise<string> {
        const content = await this.plugin.app.vault.cachedRead(file);
        const taskLines = content.split('\n').filter(line => /^\s*[-*]\s+\[[ xX]\]\s+/.test(line));
        const done = taskLines.filter(line => /^\s*[-*]\s+\[[xX]\]/.test(line));
        const open = taskLines.filter(line => /^\s*[-*]\s+\[ \]/.test(line));
        const review = this.extractSection(content, ['复盘', 'Review']);
        const tomorrow = this.extractSection(content, ['明日计划', "Tomorrow's plan", 'Tomorrow Plan']);

        const chunks = [
            `### ${file.basename}`,
            open.length ? `${getLanguage() === 'en' ? 'Open tasks' : '未完成任务'}: ${open.slice(0, 6).map(line => this.cleanTaskLine(line)).join(' / ')}` : '',
            done.length ? `${getLanguage() === 'en' ? 'Completed tasks' : '已完成任务'}: ${done.slice(0, 4).map(line => this.cleanTaskLine(line)).join(' / ')}` : '',
            review ? `${getLanguage() === 'en' ? 'Review' : '复盘'}: ${this.clip(review, 700)}` : '',
            tomorrow ? `${getLanguage() === 'en' ? 'Tomorrow' : '明日计划'}: ${this.clip(tomorrow, 450)}` : '',
        ];
        return chunks.filter(Boolean).join('\n');
    }

    private cleanTaskLine(line: string): string {
        return line.replace(/^\s*[-*]\s+\[[ xX]\]\s*/, '').trim();
    }

    private async readPlanFileSummary(scope: 'week' | 'month', date: moment.Moment): Promise<string> {
        const path = scope === 'week'
            ? this.plugin.vaultManager.getWeeklyPlanPath(date.toDate())
            : this.plugin.vaultManager.getMonthlyPlanPath(date.toDate());
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return '';
        const content = await this.plugin.app.vault.cachedRead(file);
        const label = scope === 'week'
            ? (getLanguage() === 'en' ? 'Related weekly plan' : '相关周计划')
            : (getLanguage() === 'en' ? 'Related monthly plan' : '相关月计划');
        return this.clip(`${label}\n${content}`, 1300);
    }

    private async readInsightSummary(kind: 'weekly' | 'monthly', date: moment.Moment): Promise<string> {
        const candidates = kind === 'weekly'
            ? [
                `${this.plugin.settings.archiveFolder}/Insights/${getLanguage() === 'en' ? `${date.format('YYYY')}-W${String(date.isoWeek())}-weekly-report.md` : `${date.format('YYYY')}-W${String(date.isoWeek())}-周报.md`}`,
                `${this.plugin.settings.archiveFolder}/Insights/${getLanguage() === 'en' ? `${date.format('YYYY')}-W${String(date.isoWeek()).padStart(2, '0')}-weekly-report.md` : `${date.format('YYYY')}-W${String(date.isoWeek()).padStart(2, '0')}-周报.md`}`,
            ]
            : [
                `${this.plugin.settings.archiveFolder}/Insights/${getLanguage() === 'en' ? `${date.format('YYYY-MM')}-monthly-report.md` : `${date.format('YYYY-MM')}-月报.md`}`,
            ];

        for (const path of candidates) {
            const file = this.plugin.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                return this.clip(`${getLanguage() === 'en' ? 'Recent insight report' : '近期洞察报告'}\n${await this.plugin.app.vault.cachedRead(file)}`, 1600);
            }
        }
        return '';
    }

    private extractSection(content: string, names: string[]): string {
        const lines = content.split('\n');
        const result: string[] = [];
        let inSection = false;
        for (const line of lines) {
            const heading = line.match(/^#{2,3}\s+(.+?)\s*$/);
            if (heading) {
                const title = heading[1].trim();
                if (inSection && line.startsWith('## ')) break;
                inSection = names.some(name => title.toLowerCase().includes(name.toLowerCase()));
                continue;
            }
            if (inSection) result.push(line);
        }
        return result.join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
    }

    private stripFrontmatter(content: string): string {
        if (!content.startsWith('---')) return content;
        const end = content.indexOf('---', 3);
        return end > 0 ? content.substring(end + 3) : content;
    }

    private normalizeSuggestionLines(content: string): string[] {
        const candidates = content
            .replace(/<!--[\s\S]*?-->/g, '')
            .split('\n')
            .map(line => line.trim())
            .map(line => line.replace(/^>\s?/, '').trim())
            .filter(Boolean)
            .filter(line => !line.startsWith('---'))
            .filter(line => !line.startsWith('#'))
            .filter(line => !line.startsWith('[!'))
            .filter(line => !/^(scope|target|updated|source):\s+/i.test(line))
            .map(line => line.replace(/^[-*]\s*/, '').replace(/^\d+[.)、]\s*/, '').trim())
            .filter(Boolean);
        return candidates
            .map(line => line.startsWith('💡') ? line : `💡 ${line}`)
            .slice(0, 4);
    }

    private buildReviewSummary(context: SOPContext): string {
        const responses = context.responses || {};
        return Object.entries(responses)
            .filter(([, value]) => typeof value === 'string' && value.trim())
            .map(([key, value]) => `【${key}】${String(value).trim()}`)
            .join('\n');
    }

    private buildSystemPrompt(scope: PlanSuggestionScope, date: moment.Moment): string {
        const target = this.formatTargetLabel(scope, date);
        if (getLanguage() === 'en') {
            const scopeName = scope === 'day' ? 'daily plan' : scope === 'week' ? 'weekly plan' : 'monthly plan';
            return `You generate concise, personalized planning suggestions for TideLog.

Target: ${target}
Scope: ${scopeName}

Strict rules:
- Use only the provided tasks, reviews, plans, reports, profile, patterns, and principles.
- Do not invent habits, activities, or facts that the user did not mention.
- Give 3 concrete suggestions that help the user plan this exact ${scopeName}.
- Each line starts with "💡".
- Keep each line under 32 words.
- Output suggestions only, no preamble.`;
        }

        const scopeName = scope === 'day' ? '日计划' : scope === 'week' ? '周计划' : '月计划';
        return `你是 TideLog 的计划建议助手，根据用户过往任务、复盘、计划、洞察报告和画像，为用户生成个性化计划建议。

目标周期：${target}
计划类型：${scopeName}

严格规则：
- 只能依据提供的任务、复盘、计划、报告、画像、模式和原则，不得凭空编造。
- 不要建议用户从未提过的习惯、活动或方法。
- 给出 3 条能帮助用户制定当前${scopeName}的具体建议。
- 每条以“💡”开头。
- 每条不超过 32 个字。
- 只输出建议本身，不要加前言。`;
    }

    private clip(text: string, max: number): string {
        return text.length > max ? `${text.slice(0, max)}...` : text;
    }
}
