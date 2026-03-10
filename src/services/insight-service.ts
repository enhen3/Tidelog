/**
 * Insight Service - Generates weekly/monthly insight reports
 * and manages pattern detection & user profile suggestions
 */

import { moment } from 'obsidian';
import TideLogPlugin from '../main';
import { ChatMessage } from '../types';
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
        const dailyNotes = await this.plugin.vaultManager.getDailyNotesInRange(weekStart, weekEnd);

        if (dailyNotes.length === 0) {
            onChunk('⚠️ 本周还没有日记数据，无法生成洞察报告。请先使用晨间/晚间复盘记录几天后再试。');
            onComplete('');
            return;
        }

        // Read all note contents
        const journalEntries: string[] = [];
        for (const note of dailyNotes) {
            const content = await this.plugin.app.vault.read(note);
            journalEntries.push(`--- ${note.basename} ---\n${content}`);
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

            // Save report to archive
            await this.saveInsightReport('weekly', weekStart, fullResponse);

            // Extract patterns if AI mentions them
            await this.extractAndSavePatterns(fullResponse);

            onComplete(fullResponse);
        } catch (error) {
            onChunk(`\n\n❌ 生成报告时出错：${error}`);
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
        const dailyNotes = await this.plugin.vaultManager.getDailyNotesInRange(monthStart, monthEnd);

        if (dailyNotes.length < 1) {
            onChunk('⚠️ 该月没有日记数据，无法生成洞察报告。');
            onComplete('');
            return;
        }

        // Read all note contents (summarize if too long)
        const journalEntries: string[] = [];
        for (const note of dailyNotes) {
            const content = await this.plugin.app.vault.read(note);
            // For monthly reports, extract key sections to avoid token overflow
            const summary = this.extractKeySections(content);
            journalEntries.push(`--- ${note.basename} ---\n${summary}`);
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

            // Save report
            await this.saveInsightReport('monthly', monthStart, fullResponse);

            // Extract patterns
            await this.extractAndSavePatterns(fullResponse);

            onComplete(fullResponse);
        } catch (error) {
            onChunk(`\n\n❌ 生成报告时出错：${error}`);
            onComplete('');
        }
    }

    /**
     * Generate profile update suggestions
     */
    async generateProfileSuggestions(
        onChunk: (chunk: string) => void
    ): Promise<void> {
        const today = moment();
        const twoWeeksAgo = today.clone().subtract(14, 'days');

        const dailyNotes = await this.plugin.vaultManager.getDailyNotesInRange(twoWeeksAgo, today);

        if (dailyNotes.length < 7) {
            onChunk('⚠️ 数据不足（需要至少 7 天的日记），暂时无法生成用户画像建议。');
            return;
        }

        const userProfile = await this.plugin.vaultManager.getUserProfileContent();
        const journalEntries: string[] = [];
        for (const note of dailyNotes) {
            const content = await this.plugin.app.vault.read(note);
            const summary = this.extractKeySections(content);
            journalEntries.push(`--- ${note.basename} ---\n${summary}`);
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
            await provider.sendMessage(messages, systemPrompt, onChunk);
        } catch (error) {
            onChunk(`\n\n❌ 生成建议时出错：${error}`);
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
            if (existingFile) {
                // Overwrite existing report
                await this.plugin.app.vault.modify(existingFile as any, header + content);
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
            '晨间计划', '晚间复盘', '目标对标', '成功日记',
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
     * Try to extract patterns AI mentions and save them
     */
    private async extractAndSavePatterns(report: string): Promise<void> {
        // Look for pattern-related content in the report
        const patternSection = report.match(/(?:模式发现|模式深度分析)([\s\S]*?)(?=###|$)/);
        if (patternSection && patternSection[1]) {
            // Extract bullet points from the pattern section
            const bulletPoints = patternSection[1].match(/- (.+)/g);
            if (bulletPoints && bulletPoints.length > 0) {
                for (const bullet of bulletPoints.slice(0, 3)) {
                    const text = bullet.replace(/^- /, '').trim();
                    if (text.length > 10 && text.length < 200) {
                        await this.plugin.vaultManager.addPattern(text);
                    }
                }
            }
        }
    }
}
