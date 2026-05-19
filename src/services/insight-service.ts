/**
 * Insight Service - Generates weekly/monthly insight reports
 * and manages pattern detection & user profile suggestions
 */

import { moment, TFile, TFolder } from 'obsidian';
import TideLogPlugin from '../main';
import { ChatMessage } from '../types';
import { formatAPIError } from '../utils/error-formatter';
import { replaceFile } from '../utils/vault-write';
import { t, getLanguage } from '../i18n';
import {
    getBaseContextPrompt,
    WEEKLY_INSIGHT_PROMPT,
    MONTHLY_INSIGHT_PROMPT,
    PROFILE_SUGGESTION_PROMPT,
} from '../sop/prompts';

interface GenerateInsightOptions {
    force?: boolean;
}

export class InsightService {
    private plugin: TideLogPlugin;

    constructor(plugin: TideLogPlugin) {
        this.plugin = plugin;
    }

    /**
     * Generate a weekly insight report
     */
    async generateWeeklyInsight(
        onChunk: (chunk: string) => void,
        onComplete: (fullReport: string) => void,
        targetWeek?: moment.Moment,
        options: GenerateInsightOptions = {},
    ): Promise<void> {
        const today = targetWeek ? moment(targetWeek) : moment();
        const weekStart = today.clone().startOf('isoWeek');
        const weekEnd = today.clone().endOf('isoWeek');

        const existingReport = this.findInsightReport('weekly', weekStart);
        if (existingReport && !options.force) {
            onChunk(t('insights.alreadyGenerated'));
            onComplete('');
            return;
        }

        // Read daily notes for this week
        const dailyNotes = this.plugin.vaultManager.getDailyNotesInRange(weekStart, weekEnd);

        if (dailyNotes.length === 0) {
            onChunk(t('insight.noWeeklyData'));
            onComplete('');
            return;
        }

        // Read all note contents with compact metadata preamble
        const journalEntries: string[] = [];
        for (const note of dailyNotes) {
            const preamble = this.buildCompactDaySummary(note);
            const content = await this.plugin.app.vault.cachedRead(note);
            const keySections = this.extractKeySections(content);
            journalEntries.push(`--- ${note.basename} ---\n${preamble}\n${keySections}`);
        }
        const allJournals = journalEntries.join('\n\n');

        // Read context data
        const userProfile = await this.plugin.vaultManager.getUserProfileContent();
        const patterns = await this.plugin.vaultManager.getPatternsContent();
        const principles = await this.plugin.vaultManager.getPrinciplesContent();
        const planContext = await this.readWeeklyPlanContext(weekStart);

        const systemPrompt = getBaseContextPrompt(userProfile) + '\n\n' + WEEKLY_INSIGHT_PROMPT;

        const userMessage = `${t('insight.weeklyUserMsg', weekStart.format('YYYY-MM-DD'), weekEnd.format('YYYY-MM-DD'), String(dailyNotes.length))}

${allJournals}

${planContext ? `\n\n${this.label('Related plan context', '相关计划上下文')}\n${planContext}` : ''}
${patterns ? `\n\n${t('insight.knownPatterns')}\n${patterns}` : ''}
${principles ? `\n\n${t('insight.knownPrinciples')}\n${principles}` : ''}

${t('insight.generateWeeklyReport')}`;

        const messages: ChatMessage[] = [
            { role: 'user', content: userMessage, timestamp: Date.now() },
        ];

        try {
            const provider = this.plugin.getAIProvider();
            let fullResponse = '';

            await provider.sendMessage(
                messages,
                systemPrompt,
                (chunk) => {
                    fullResponse += chunk;
                    onChunk(chunk);
                }
            );

            // Save report to archive (strip extraction tags before saving)
            const cleanReport = this.stripExtractionTags(fullResponse);
            await this.saveInsightReport('weekly', weekStart, cleanReport);

            // Extract patterns and principles from structured tags
            await this.extractAndSavePatterns(fullResponse);
            await this.extractAndSavePrinciples(fullResponse);

            onComplete(fullResponse);
        } catch (error) {
            onChunk(`\n\n${formatAPIError(error, this.plugin.settings.activeProvider)}`);
            onComplete('');
        }
    }

    /**
     * Generate a monthly insight report
     */
    async generateMonthlyInsight(
        onChunk: (chunk: string) => void,
        onComplete: (fullReport: string) => void,
        targetMonth?: moment.Moment,
        options: GenerateInsightOptions = {},
    ): Promise<void> {
        const ref = targetMonth ? moment(targetMonth) : moment();
        const monthStart = ref.clone().startOf('month');
        const monthEnd = ref.clone().endOf('month');

        const existingReport = this.findInsightReport('monthly', monthStart);
        if (existingReport && !options.force) {
            onChunk(t('insights.alreadyGenerated'));
            onComplete('');
            return;
        }

        // Read daily notes for this month
        const dailyNotes = this.plugin.vaultManager.getDailyNotesInRange(monthStart, monthEnd);

        if (dailyNotes.length < 1) {
            onChunk(t('insight.noMonthlyData'));
            onComplete('');
            return;
        }

        // Read all note contents (summarize if too long)
        const journalEntries: string[] = [];
        for (const note of dailyNotes) {
            const content = await this.plugin.app.vault.cachedRead(note);
            // For monthly reports, use compact preamble + key sections
            const preamble = this.buildCompactDaySummary(note);
            const summary = this.extractKeySections(content);
            journalEntries.push(`--- ${note.basename} ---\n${preamble}\n${summary}`);
        }
        const allJournals = journalEntries.join('\n\n');

        // Read context data
        const userProfile = await this.plugin.vaultManager.getUserProfileContent();
        const patterns = await this.plugin.vaultManager.getPatternsContent();
        const principles = await this.plugin.vaultManager.getPrinciplesContent();
        const planContext = await this.readMonthlyPlanContext(monthStart, monthEnd);

        const systemPrompt = getBaseContextPrompt(userProfile) + '\n\n' + MONTHLY_INSIGHT_PROMPT;

        const userMessage = `${t('insight.monthlyUserMsg', monthStart.format('YYYY-MM-DD'), monthEnd.format('YYYY-MM-DD'), String(dailyNotes.length))}

${allJournals}

${planContext ? `\n\n${this.label('Related plan context', '相关计划上下文')}\n${planContext}` : ''}
${patterns ? `\n\n${t('insight.knownPatterns')}\n${patterns}` : ''}
${principles ? `\n\n${t('insight.knownPrinciples')}\n${principles}` : ''}

${t('insight.generateMonthlyReport')}`;

        const messages: ChatMessage[] = [
            { role: 'user', content: userMessage, timestamp: Date.now() },
        ];

        try {
            const provider = this.plugin.getAIProvider();
            let fullResponse = '';

            await provider.sendMessage(
                messages,
                systemPrompt,
                (chunk) => {
                    fullResponse += chunk;
                    onChunk(chunk);
                }
            );

            // Save report (strip extraction tags)
            const cleanReport = this.stripExtractionTags(fullResponse);
            await this.saveInsightReport('monthly', monthStart, cleanReport);

            // Extract patterns and principles
            await this.extractAndSavePatterns(fullResponse);
            await this.extractAndSavePrinciples(fullResponse);

            onComplete(fullResponse);
        } catch (error) {
            onChunk(`\n\n${formatAPIError(error, this.plugin.settings.activeProvider)}`);
            onComplete('');
        }
    }

    private async readWeeklyPlanContext(weekStart: moment.Moment): Promise<string> {
        const weekPath = this.plugin.vaultManager.getWeeklyPlanPath(weekStart.toDate());
        const monthPath = this.plugin.vaultManager.getMonthlyPlanPath(weekStart.toDate());
        const parts = await Promise.all([
            this.readPlanFile(weekPath, this.label('Weekly plan', '周计划')),
            this.readPlanFile(monthPath, this.label('Monthly plan', '月计划')),
        ]);
        return parts.filter(Boolean).join('\n\n').slice(0, 5000);
    }

    private async readMonthlyPlanContext(monthStart: moment.Moment, monthEnd: moment.Moment): Promise<string> {
        const parts: string[] = [];
        const monthPath = this.plugin.vaultManager.getMonthlyPlanPath(monthStart.toDate());
        const monthPlan = await this.readPlanFile(monthPath, this.label('Monthly plan', '月计划'));
        if (monthPlan) parts.push(monthPlan);

        const seen = new Set<string>();
        const cursor = monthStart.clone().startOf('isoWeek');
        while (cursor.isSameOrBefore(monthEnd, 'day')) {
            const path = this.plugin.vaultManager.getWeeklyPlanPath(cursor.toDate());
            if (!seen.has(path)) {
                seen.add(path);
                const weeklyPlan = await this.readPlanFile(path, this.label('Weekly plan', '周计划'));
                if (weeklyPlan) parts.push(weeklyPlan);
            }
            cursor.add(1, 'week');
        }

        return parts.join('\n\n').slice(0, 7000);
    }

    private async readPlanFile(path: string, label: string): Promise<string> {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return '';
        const content = await this.plugin.app.vault.cachedRead(file);
        return `### ${label}: ${file.basename}\n${this.extractKeySections(content)}`.trim();
    }

    private label(en: string, zh: string): string {
        return getLanguage() === 'en' ? en : zh;
    }

    /**
     * Generate profile update suggestions
     */
    async generateProfileSuggestions(
        onChunk: (chunk: string) => void,
        onComplete?: (fullResponse: string) => void
    ): Promise<void> {
        const today = moment();
        const twoWeeksAgo = today.clone().subtract(14, 'days');

        const existingProfile = this.findProfileAnalysisForMonth(today.format('YYYY-MM'));
        if (existingProfile) {
            onChunk(t('insights.alreadyGenerated'));
            onComplete?.('');
            return;
        }

        const dailyNotes = this.plugin.vaultManager.getDailyNotesInRange(twoWeeksAgo, today);

        if (dailyNotes.length < 7) {
            onChunk(t('insight.noProfileData'));
            onComplete?.('');
            return;
        }

        const userProfile = await this.plugin.vaultManager.getUserProfileContent();
        const journalEntries: string[] = [];
        for (const note of dailyNotes) {
            const content = await this.plugin.app.vault.cachedRead(note);
            const preamble = this.buildCompactDaySummary(note);
            const summary = this.extractKeySections(content);
            journalEntries.push(`--- ${note.basename} ---\n${preamble}\n${summary}`);
        }

        const prompt = PROFILE_SUGGESTION_PROMPT
            .replace('{CURRENT_PROFILE}', userProfile || t('insight.noProfile'))
            .replace('{RECENT_JOURNALS}', journalEntries.join('\n\n'));

        const systemPrompt = getBaseContextPrompt(userProfile);
        const messages: ChatMessage[] = [
            { role: 'user', content: prompt, timestamp: Date.now() },
        ];

        try {
            const provider = this.plugin.getAIProvider();
            let fullResponse = '';

            await provider.sendMessage(messages, systemPrompt, (chunk) => {
                fullResponse += chunk;
                onChunk(chunk);
            });

            // Save full analysis to Insights for history tracking
            await this.saveProfileAnalysis(fullResponse);

            // Extract and save updated profile from <profile_update> tag
            await this.extractAndSaveProfile(fullResponse);

            // Extract patterns and principles
            await this.extractAndSavePatterns(fullResponse);
            await this.extractAndSavePrinciples(fullResponse);

            onComplete?.(fullResponse);
        } catch (error) {
            onChunk(`\n\n${formatAPIError(error, this.plugin.settings.activeProvider)}`);
            onComplete?.('');
        }
    }

    /**
     * Save profile analysis to Insights folder for history tracking
     */
    private async saveProfileAnalysis(content: string): Promise<void> {
        if (!content.trim()) return;

        try {
            await this.plugin.vaultManager.ensureInsightsFolder();
            const date = moment().format('YYYY-MM-DD');
            const filePath = `${this.plugin.settings.archiveFolder}/Insights/${t('insight.profileUpdateFile', date)}`;
            const header = `${t('insight.profileUpdateTitle')}\n\n${t('insight.generatedAt', moment().format('YYYY-MM-DD HH:mm'))}\n\n`;

            // Remove <profile_update> and extraction tags from the saved analysis
            // (profile goes to user_profile.md, patterns/principles to their files)
            const analysisOnly = content
                .replace(/<profile_update>[\s\S]*?<\/profile_update>/g, '')
                .replace(/<new_patterns>[\s\S]*?<\/new_patterns>/g, '')
                .replace(/<new_principles>[\s\S]*?<\/new_principles>/g, '')
                .trim();

            const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (existingFile instanceof TFile) {
                await replaceFile(this.plugin.app, existingFile, header + analysisOnly);
            } else {
                await this.plugin.app.vault.create(filePath, header + analysisOnly);
            }
        } catch (error) {
            console.error('Failed to save profile analysis:', error);
        }
    }

    /**
     * Extract profile content from <profile_update> tag and save to user_profile.md
     */
    private async extractAndSaveProfile(response: string): Promise<void> {
        const match = response.match(/<profile_update>([\s\S]*?)<\/profile_update>/);
        if (!match || !match[1].trim()) return;

        const newProfileContent = match[1].trim();

        try {
            const profilePath = `${this.plugin.settings.archiveFolder}/user_profile.md`;
            const existingFile = this.plugin.app.vault.getAbstractFileByPath(profilePath);

            if (existingFile instanceof TFile) {
                await replaceFile(this.plugin.app, existingFile, newProfileContent);
            } else {
                await this.plugin.app.vault.create(profilePath, newProfileContent);
            }
        } catch (error) {
            console.error('Failed to save updated user profile:', error);
        }
    }

    /**
     * Save insight report to archive
     */
    private async saveInsightReport(
        type: 'weekly' | 'monthly',
        date: moment.Moment,
        content: string
    ): Promise<void> {
        if (!content.trim()) return;

        try {
            await this.plugin.vaultManager.ensureInsightsFolder();

            const fileName = type === 'weekly'
                ? t('insight.weeklyFileName', date.format('YYYY'), String(date.isoWeek()))
                : t('insight.monthlyFileName', date.format('YYYY-MM'));

            const filePath = `${this.plugin.settings.archiveFolder}/Insights/${fileName}`;
            const header = type === 'weekly'
                ? `${t('insight.weeklyReportTitle', date.format('YYYY'), String(date.isoWeek()))}\n\n${t('insight.generatedAt', moment().format('YYYY-MM-DD HH:mm'))}\n\n`
                : `${t('insight.monthlyReportTitle', getLanguage() === 'en' ? date.format('YYYY-MM') : date.format('YYYY年MM月'))}\n\n${t('insight.generatedAt', moment().format('YYYY-MM-DD HH:mm'))}\n\n`;

            const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (existingFile instanceof TFile) {
                // Overwrite existing report
                await replaceFile(this.plugin.app, existingFile, header + content);
            } else {
                await this.plugin.app.vault.create(filePath, header + content);
            }
        } catch (error) {
            console.error(`Failed to save ${type} insight report:`, error);
        }
    }

    private findInsightReport(type: 'weekly' | 'monthly', date: moment.Moment): TFile | null {
        const fileNames = type === 'weekly'
            ? [
                t('insight.weeklyFileName', date.format('YYYY'), String(date.isoWeek())),
                t('insight.weeklyFileName', date.format('YYYY'), String(date.isoWeek()).padStart(2, '0')),
            ]
            : [t('insight.monthlyFileName', date.format('YYYY-MM'))];

        for (const fileName of fileNames) {
            const file = this.plugin.app.vault.getAbstractFileByPath(`${this.plugin.settings.archiveFolder}/Insights/${fileName}`);
            if (file instanceof TFile) return file;
        }
        return null;
    }

    private findProfileAnalysisForMonth(monthKey: string): TFile | null {
        const folder = this.plugin.app.vault.getAbstractFileByPath(`${this.plugin.settings.archiveFolder}/Insights`);
        if (!(folder instanceof TFolder)) return null;
        const files = folder.children
            .filter((child): child is TFile => child instanceof TFile)
            .filter((file) => file.name.startsWith(monthKey) && (file.name.includes('画像更新') || file.name.includes('profile-update')))
            .sort((a, b) => b.name.localeCompare(a.name));
        return files[0] ?? null;
    }

    /**
     * Extract key sections from a daily note to avoid token overflow
     */
    private extractKeySections(content: string): string {
        const lines = content.split('\n');
        const keepSections = [
            t('insight.sectionPlan'), t('insight.sectionReview'),
            t('insight.sectionGoalAlign'), t('insight.sectionSuccess'),
            t('insight.sectionJoyEmotion'), t('insight.sectionAnxiety'),
            t('insight.sectionTomorrow'), t('insight.sectionDeep'),
            t('insight.sectionReflect'), t('insight.sectionPrinciple'),
            t('insight.sectionFreeWrite'),
            // Always include Chinese section names for matching existing notes
            '计划', '复盘', '目标对标', '成功日记',
            '开心事与情绪', '焦虑觉察', '明日计划', '深度分析',
            '反思', '原则提炼', '自由随笔',
        ];

        const result: string[] = [];
        let inKeepSection = false;

        for (const line of lines) {
            // Check for section headers
            if (line.startsWith('## ') || line.startsWith('### ')) {
                const sectionName = line.replace(/^#{2,3}\s+/, '').trim();
                inKeepSection = keepSections.some(s => sectionName.includes(s));
                if (inKeepSection) {
                    result.push(line);
                }
                continue;
            }

            if (inKeepSection) {
                result.push(line);
            }

            // Also keep energy level and task lines at top level
            if (line.includes(t('insight.energyLevel')) || line.includes('精力状态') || line.includes('Energy') || line.match(/^- \[[ x]\]/)) {
                if (!result.includes(line)) {
                    result.push(line);
                }
            }
        }

        return result.join('\n').trim() || content.substring(0, 1000);
    }

    /**
     * Build a compact day summary from metadataCache (zero I/O for metadata)
     */
    private buildCompactDaySummary(file: TFile): string {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        const listItems = cache?.listItems ?? [];
        const tasks = listItems.filter(item => item.task !== undefined);
        const done = tasks.filter(t => t.task === 'x').length;
        const total = tasks.length;

        const parts: string[] = [];
        if (fm?.emotion_score) parts.push(`${t('insight.emotionLabel')}: ${fm.emotion_score}/10`);
        if (total > 0) parts.push(`${t('insight.taskLabel')}: ${done}/${total}`);
        if (fm?.status) parts.push(`${t('insight.statusLabel')}: ${fm.status}`);
        if (fm?.tags && Array.isArray(fm.tags) && fm.tags.length > 0) {
            parts.push(`${t('insight.tagLabel')}: ${fm.tags.join(', ')}`);
        }

        return parts.length > 0 ? `[${parts.join(' | ')}]` : '';
    }

    /**
     * Extract patterns from <new_patterns> tag and save
     */
    private async extractAndSavePatterns(response: string): Promise<void> {
        const match = response.match(/<new_patterns>([\s\S]*?)<\/new_patterns>/);
        if (!match || !match[1].trim() || match[1].trim() === '无' || match[1].trim() === 'None') return;

        const bullets = match[1].match(/- (.+)/g);
        if (!bullets) return;

        for (const bullet of bullets.slice(0, 5)) {
            const text = bullet.replace(/^- /, '').trim();
            if (text.length > 5 && text.length < 200) {
                await this.plugin.vaultManager.addPattern(text);
            }
        }
    }

    /**
     * Extract principles from <new_principles> tag and save
     */
    private async extractAndSavePrinciples(response: string): Promise<void> {
        const match = response.match(/<new_principles>([\s\S]*?)<\/new_principles>/);
        if (!match || !match[1].trim() || match[1].trim() === '无' || match[1].trim() === 'None') return;

        const bullets = match[1].match(/- (.+)/g);
        if (!bullets) return;

        for (const bullet of bullets.slice(0, 3)) {
            const text = bullet.replace(/^- /, '').trim();
            if (text.length > 5 && text.length < 200) {
                await this.plugin.vaultManager.addPrinciple(text);
            }
        }
    }

    /**
     * Strip extraction tags from report content (users shouldn't see these)
     */
    private stripExtractionTags(content: string): string {
        return content
            .replace(/<extraction>[\s\S]*?<\/extraction>/g, '')
            .replace(/<new_patterns>[\s\S]*?<\/new_patterns>/g, '')
            .replace(/<new_principles>[\s\S]*?<\/new_principles>/g, '')
            .trim();
    }
}
