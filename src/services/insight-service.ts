/**
 * Insight Service - Generates weekly/monthly insight reports
 * and manages pattern detection & user profile suggestions
 */

import { moment, TFile } from 'obsidian';
import TideLogPlugin from '../main';
import { ChatMessage } from '../types';
import { formatAPIError } from '../utils/error-formatter';
import {
    getBaseContextPrompt,
    WEEKLY_INSIGHT_PROMPT,
    MONTHLY_INSIGHT_PROMPT,
    PROFILE_SUGGESTION_PROMPT,
} from '../sop/prompts';

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
        onComplete: (fullReport: string) => void
    ): Promise<void> {
        const today = moment();
        const weekStart = today.clone().startOf('isoWeek');
        const weekEnd = today.clone().endOf('isoWeek');

        // Read daily notes for this week
        const dailyNotes = this.plugin.vaultManager.getDailyNotesInRange(weekStart, weekEnd);

        if (dailyNotes.length === 0) {
            onChunk('⚠️ 本周还没有日记数据，无法生成洞察报告。请先使用复盘记录几天后再试。');
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

        const systemPrompt = getBaseContextPrompt(userProfile) + '\n\n' + WEEKLY_INSIGHT_PROMPT;

        const userMessage = `以下是我本周的日记内容（${weekStart.format('YYYY-MM-DD')} ~ ${weekEnd.format('YYYY-MM-DD')}，共 ${dailyNotes.length} 天）：

${allJournals}

${patterns ? `\n\n已知的模式库：\n${patterns}` : ''}
${principles ? `\n\n已有的原则库：\n${principles}` : ''}

请根据以上内容生成本周的洞察报告。`;

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
    ): Promise<void> {
        const ref = targetMonth ? moment(targetMonth) : moment();
        const monthStart = ref.clone().startOf('month');
        const monthEnd = ref.clone().endOf('month');

        // Read daily notes for this month
        const dailyNotes = this.plugin.vaultManager.getDailyNotesInRange(monthStart, monthEnd);

        if (dailyNotes.length < 1) {
            onChunk('⚠️ 该月没有日记数据，无法生成洞察报告。');
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

        const systemPrompt = getBaseContextPrompt(userProfile) + '\n\n' + MONTHLY_INSIGHT_PROMPT;

        const userMessage = `以下是我本月的日记内容（${monthStart.format('YYYY-MM-DD')} ~ ${monthEnd.format('YYYY-MM-DD')}，共 ${dailyNotes.length} 天）：

${allJournals}

${patterns ? `\n\n已知的模式库：\n${patterns}` : ''}
${principles ? `\n\n已有的原则库：\n${principles}` : ''}

请根据以上内容生成本月的深度洞察报告。`;

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

    /**
     * Generate profile update suggestions
     */
    async generateProfileSuggestions(
        onChunk: (chunk: string) => void,
        onComplete?: (fullResponse: string) => void
    ): Promise<void> {
        const today = moment();
        const twoWeeksAgo = today.clone().subtract(14, 'days');

        const dailyNotes = this.plugin.vaultManager.getDailyNotesInRange(twoWeeksAgo, today);

        if (dailyNotes.length < 7) {
            onChunk('⚠️ 数据不足（需要至少 7 天的日记），暂时无法生成用户画像建议。');
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
            .replace('{CURRENT_PROFILE}', userProfile || '（暂无用户画像）')
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
            const filePath = `${this.plugin.settings.archiveFolder}/Insights/${date}-画像更新.md`;
            const header = `# 用户画像更新分析\n\n> 生成于 ${moment().format('YYYY-MM-DD HH:mm')}\n\n`;

            // Remove <profile_update> and extraction tags from the saved analysis
            // (profile goes to user_profile.md, patterns/principles to their files)
            const analysisOnly = content
                .replace(/<profile_update>[\s\S]*?<\/profile_update>/g, '')
                .replace(/<new_patterns>[\s\S]*?<\/new_patterns>/g, '')
                .replace(/<new_principles>[\s\S]*?<\/new_principles>/g, '')
                .trim();

            const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (existingFile instanceof TFile) {
                await this.plugin.app.vault.modify(existingFile, header + analysisOnly);
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
                await this.plugin.app.vault.modify(existingFile, newProfileContent);
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
                ? `${date.format('YYYY')}-W${date.isoWeek()}-周报.md`
                : `${date.format('YYYY-MM')}-月报.md`;

            const filePath = `${this.plugin.settings.archiveFolder}/Insights/${fileName}`;
            const header = type === 'weekly'
                ? `# ${date.format('YYYY')} 第 ${date.isoWeek()} 周 洞察报告\n\n> 生成于 ${moment().format('YYYY-MM-DD HH:mm')}\n\n`
                : `# ${date.format('YYYY年MM月')} 洞察报告\n\n> 生成于 ${moment().format('YYYY-MM-DD HH:mm')}\n\n`;

            const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (existingFile instanceof TFile) {
                // Overwrite existing report
                await this.plugin.app.vault.modify(existingFile, header + content);
            } else {
                await this.plugin.app.vault.create(filePath, header + content);
            }
        } catch (error) {
            console.error(`Failed to save ${type} insight report:`, error);
        }
    }

    /**
     * Extract key sections from a daily note to avoid token overflow
     */
    private extractKeySections(content: string): string {
        const lines = content.split('\n');
        const keepSections = [
            '\u8ba1\u5212', '\u590d\u76d8', '\u76ee\u6807\u5bf9\u6807', '\u6210\u529f\u65e5\u8bb0',
            '开心事与情绪', '焦虑觉察', '明日计划', '深度分析',
            '反思', '原则提炼', '自由随笔'
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
            if (line.includes('精力状态') || line.match(/^- \[[ x]\]/)) {
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
        if (fm?.emotion_score) parts.push(`情绪: ${fm.emotion_score}/10`);
        if (total > 0) parts.push(`任务: ${done}/${total}`);
        if (fm?.status) parts.push(`状态: ${fm.status}`);
        if (fm?.tags && Array.isArray(fm.tags) && fm.tags.length > 0) {
            parts.push(`标签: ${fm.tags.join(', ')}`);
        }

        return parts.length > 0 ? `[${parts.join(' | ')}]` : '';
    }

    /**
     * Extract patterns from <new_patterns> tag and save
     */
    private async extractAndSavePatterns(response: string): Promise<void> {
        const match = response.match(/<new_patterns>([\s\S]*?)<\/new_patterns>/);
        if (!match || !match[1].trim() || match[1].trim() === '无') return;

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
        if (!match || !match[1].trim() || match[1].trim() === '无') return;

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
