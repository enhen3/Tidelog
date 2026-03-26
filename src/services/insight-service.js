/**
 * Insight Service - Generates weekly/monthly insight reports
 * and manages pattern detection & user profile suggestions
 */
import { moment, TFile } from 'obsidian';
import { formatAPIError } from '../utils/error-formatter';
import { t, getLanguage } from '../i18n';
import { getBaseContextPrompt, WEEKLY_INSIGHT_PROMPT, MONTHLY_INSIGHT_PROMPT, PROFILE_SUGGESTION_PROMPT, } from '../sop/prompts';
export class InsightService {
    constructor(plugin) {
        this.plugin = plugin;
    }
    /**
     * Generate a weekly insight report
     */
    async generateWeeklyInsight(onChunk, onComplete) {
        const today = moment();
        const weekStart = today.clone().startOf('isoWeek');
        const weekEnd = today.clone().endOf('isoWeek');
        // Read daily notes for this week
        const dailyNotes = this.plugin.vaultManager.getDailyNotesInRange(weekStart, weekEnd);
        if (dailyNotes.length === 0) {
            onChunk(t('insight.noWeeklyData'));
            onComplete('');
            return;
        }
        // Read all note contents with compact metadata preamble
        const journalEntries = [];
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
        const userMessage = `${t('insight.weeklyUserMsg', weekStart.format('YYYY-MM-DD'), weekEnd.format('YYYY-MM-DD'), String(dailyNotes.length))}

${allJournals}

${patterns ? `\n\n${t('insight.knownPatterns')}\n${patterns}` : ''}
${principles ? `\n\n${t('insight.knownPrinciples')}\n${principles}` : ''}

${t('insight.generateWeeklyReport')}`;
        const messages = [
            { role: 'user', content: userMessage, timestamp: Date.now() },
        ];
        try {
            const provider = this.plugin.getAIProvider();
            let fullResponse = '';
            await provider.sendMessage(messages, systemPrompt, (chunk) => {
                fullResponse += chunk;
                onChunk(chunk);
            });
            // Save report to archive (strip extraction tags before saving)
            const cleanReport = this.stripExtractionTags(fullResponse);
            await this.saveInsightReport('weekly', weekStart, cleanReport);
            // Extract patterns and principles from structured tags
            await this.extractAndSavePatterns(fullResponse);
            await this.extractAndSavePrinciples(fullResponse);
            onComplete(fullResponse);
        }
        catch (error) {
            onChunk(`\n\n${formatAPIError(error, this.plugin.settings.activeProvider)}`);
            onComplete('');
        }
    }
    /**
     * Generate a monthly insight report
     */
    async generateMonthlyInsight(onChunk, onComplete, targetMonth) {
        const ref = targetMonth ? moment(targetMonth) : moment();
        const monthStart = ref.clone().startOf('month');
        const monthEnd = ref.clone().endOf('month');
        // Read daily notes for this month
        const dailyNotes = this.plugin.vaultManager.getDailyNotesInRange(monthStart, monthEnd);
        if (dailyNotes.length < 1) {
            onChunk(t('insight.noMonthlyData'));
            onComplete('');
            return;
        }
        // Read all note contents (summarize if too long)
        const journalEntries = [];
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
        const userMessage = `${t('insight.monthlyUserMsg', monthStart.format('YYYY-MM-DD'), monthEnd.format('YYYY-MM-DD'), String(dailyNotes.length))}

${allJournals}

${patterns ? `\n\n${t('insight.knownPatterns')}\n${patterns}` : ''}
${principles ? `\n\n${t('insight.knownPrinciples')}\n${principles}` : ''}

${t('insight.generateMonthlyReport')}`;
        const messages = [
            { role: 'user', content: userMessage, timestamp: Date.now() },
        ];
        try {
            const provider = this.plugin.getAIProvider();
            let fullResponse = '';
            await provider.sendMessage(messages, systemPrompt, (chunk) => {
                fullResponse += chunk;
                onChunk(chunk);
            });
            // Save report (strip extraction tags)
            const cleanReport = this.stripExtractionTags(fullResponse);
            await this.saveInsightReport('monthly', monthStart, cleanReport);
            // Extract patterns and principles
            await this.extractAndSavePatterns(fullResponse);
            await this.extractAndSavePrinciples(fullResponse);
            onComplete(fullResponse);
        }
        catch (error) {
            onChunk(`\n\n${formatAPIError(error, this.plugin.settings.activeProvider)}`);
            onComplete('');
        }
    }
    /**
     * Generate profile update suggestions
     */
    async generateProfileSuggestions(onChunk, onComplete) {
        const today = moment();
        const twoWeeksAgo = today.clone().subtract(14, 'days');
        const dailyNotes = this.plugin.vaultManager.getDailyNotesInRange(twoWeeksAgo, today);
        if (dailyNotes.length < 7) {
            onChunk(t('insight.noProfileData'));
            onComplete?.('');
            return;
        }
        const userProfile = await this.plugin.vaultManager.getUserProfileContent();
        const journalEntries = [];
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
        const messages = [
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
        }
        catch (error) {
            onChunk(`\n\n${formatAPIError(error, this.plugin.settings.activeProvider)}`);
            onComplete?.('');
        }
    }
    /**
     * Save profile analysis to Insights folder for history tracking
     */
    async saveProfileAnalysis(content) {
        if (!content.trim())
            return;
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
                await this.plugin.app.vault.modify(existingFile, header + analysisOnly);
            }
            else {
                await this.plugin.app.vault.create(filePath, header + analysisOnly);
            }
        }
        catch (error) {
            console.error('Failed to save profile analysis:', error);
        }
    }
    /**
     * Extract profile content from <profile_update> tag and save to user_profile.md
     */
    async extractAndSaveProfile(response) {
        const match = response.match(/<profile_update>([\s\S]*?)<\/profile_update>/);
        if (!match || !match[1].trim())
            return;
        const newProfileContent = match[1].trim();
        try {
            const profilePath = `${this.plugin.settings.archiveFolder}/user_profile.md`;
            const existingFile = this.plugin.app.vault.getAbstractFileByPath(profilePath);
            if (existingFile instanceof TFile) {
                await this.plugin.app.vault.modify(existingFile, newProfileContent);
            }
            else {
                await this.plugin.app.vault.create(profilePath, newProfileContent);
            }
        }
        catch (error) {
            console.error('Failed to save updated user profile:', error);
        }
    }
    /**
     * Save insight report to archive
     */
    async saveInsightReport(type, date, content) {
        if (!content.trim())
            return;
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
                await this.plugin.app.vault.modify(existingFile, header + content);
            }
            else {
                await this.plugin.app.vault.create(filePath, header + content);
            }
        }
        catch (error) {
            console.error(`Failed to save ${type} insight report:`, error);
        }
    }
    /**
     * Extract key sections from a daily note to avoid token overflow
     */
    extractKeySections(content) {
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
        const result = [];
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
    buildCompactDaySummary(file) {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        const listItems = cache?.listItems ?? [];
        const tasks = listItems.filter(item => item.task !== undefined);
        const done = tasks.filter(t => t.task === 'x').length;
        const total = tasks.length;
        const parts = [];
        if (fm?.emotion_score)
            parts.push(`${t('insight.emotionLabel')}: ${fm.emotion_score}/10`);
        if (total > 0)
            parts.push(`${t('insight.taskLabel')}: ${done}/${total}`);
        if (fm?.status)
            parts.push(`${t('insight.statusLabel')}: ${fm.status}`);
        if (fm?.tags && Array.isArray(fm.tags) && fm.tags.length > 0) {
            parts.push(`${t('insight.tagLabel')}: ${fm.tags.join(', ')}`);
        }
        return parts.length > 0 ? `[${parts.join(' | ')}]` : '';
    }
    /**
     * Extract patterns from <new_patterns> tag and save
     */
    async extractAndSavePatterns(response) {
        const match = response.match(/<new_patterns>([\s\S]*?)<\/new_patterns>/);
        if (!match || !match[1].trim() || match[1].trim() === '无' || match[1].trim() === 'None')
            return;
        const bullets = match[1].match(/- (.+)/g);
        if (!bullets)
            return;
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
    async extractAndSavePrinciples(response) {
        const match = response.match(/<new_principles>([\s\S]*?)<\/new_principles>/);
        if (!match || !match[1].trim() || match[1].trim() === '无' || match[1].trim() === 'None')
            return;
        const bullets = match[1].match(/- (.+)/g);
        if (!bullets)
            return;
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
    stripExtractionTags(content) {
        return content
            .replace(/<extraction>[\s\S]*?<\/extraction>/g, '')
            .replace(/<new_patterns>[\s\S]*?<\/new_patterns>/g, '')
            .replace(/<new_principles>[\s\S]*?<\/new_principles>/g, '')
            .trim();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zaWdodC1zZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaW5zaWdodC1zZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7R0FHRztBQUVILE9BQU8sRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBR3pDLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxNQUFNLFNBQVMsQ0FBQztBQUN6QyxPQUFPLEVBQ0gsb0JBQW9CLEVBQ3BCLHFCQUFxQixFQUNyQixzQkFBc0IsRUFDdEIseUJBQXlCLEdBQzVCLE1BQU0sZ0JBQWdCLENBQUM7QUFFeEIsTUFBTSxPQUFPLGNBQWM7SUFHdkIsWUFBWSxNQUFxQjtRQUM3QixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztJQUN6QixDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMscUJBQXFCLENBQ3ZCLE9BQWdDLEVBQ2hDLFVBQXdDO1FBRXhDLE1BQU0sS0FBSyxHQUFHLE1BQU0sRUFBRSxDQUFDO1FBQ3ZCLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbkQsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUUvQyxpQ0FBaUM7UUFDakMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsb0JBQW9CLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRXJGLElBQUksVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMxQixPQUFPLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztZQUNuQyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUM7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LElBQUksQ0FBQyxPQUFPO1lBQUUsT0FBTztRQUVyQixLQUFLLE1BQU0sTUFBTSxJQUFJLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDdkMsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDOUMsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLEdBQUcsRUFBRSxDQUFDO2dCQUN2QyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN0RCxDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNLLG1CQUFtQixDQUFDLE9BQWU7UUFDdkMsT0FBTyxPQUFPO2FBQ1QsT0FBTyxDQUFDLHFDQUFxQyxFQUFFLEVBQUUsQ0FBQzthQUNsRCxPQUFPLENBQUMseUNBQXlDLEVBQUUsRUFBRSxDQUFDO2FBQ3RELE9BQU8sQ0FBQyw2Q0FBNkMsRUFBRSxFQUFFLENBQUM7YUFDMUQsSUFBSSxFQUFFLENBQUM7SUFDaEIsQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBJbnNpZ2h0IFNlcnZpY2UgLSBHZW5lcmF0ZXMgd2Vla2x5L21vbnRobHkgaW5zaWdodCByZXBvcnRzXG4gKiBhbmQgbWFuYWdlcyBwYXR0ZXJuIGRldGVjdGlvbiAmIHVzZXIgcHJvZmlsZSBzdWdnZXN0aW9uc1xuICovXG5cbmltcG9ydCB7IG1vbWVudCwgVEZpbGUgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgVGlkZUxvZ1BsdWdpbiBmcm9tICcuLi9tYWluJztcbmltcG9ydCB7IENoYXRNZXNzYWdlIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZm9ybWF0QVBJRXJyb3IgfSBmcm9tICcuLi91dGlscy9lcnJvci1mb3JtYXR0ZXInO1xuaW1wb3J0IHsgdCwgZ2V0TGFuZ3VhZ2UgfSBmcm9tICcuLi9pMThuJztcbmltcG9ydCB7XG4gICAgZ2V0QmFzZUNvbnRleHRQcm9tcHQsXG4gICAgV0VFS0xZX0lOU0lHSFRfUFJPTVBULFxuICAgIE1PTlRITFlfSU5TSUdIVF9QUk9NUFQsXG4gICAgUFJPRklMRV9TVUdHRVNUSU9OX1BST01QVCxcbn0gZnJvbSAnLi4vc29wL3Byb21wdHMnO1xuXG5leHBvcnQgY2xhc3MgSW5zaWdodFNlcnZpY2Uge1xuICAgIHByaXZhdGUgcGx1Z2luOiBUaWRlTG9nUGx1Z2luO1xuXG4gICAgY29uc3RydWN0b3IocGx1Z2luOiBUaWRlTG9nUGx1Z2luKSB7XG4gICAgICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlIGEgd2Vla2x5IGluc2lnaHQgcmVwb3J0XG4gICAgICovXG4gICAgYXN5bmMgZ2VuZXJhdGVXZWVrbHlJbnNpZ2h0KFxuICAgICAgICBvbkNodW5rOiAoY2h1bms6IHN0cmluZykgPT4gdm9pZCxcbiAgICAgICAgb25Db21wbGV0ZTogKGZ1bGxSZXBvcnQ6IHN0cmluZykgPT4gdm9pZFxuICAgICk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCB0b2RheSA9IG1vbWVudCgpO1xuICAgICAgICBjb25zdCB3ZWVrU3RhcnQgPSB0b2RheS5jbG9uZSgpLnN0YXJ0T2YoJ2lzb1dlZWsnKTtcbiAgICAgICAgY29uc3Qgd2Vla0VuZCA9IHRvZGF5LmNsb25lKCkuZW5kT2YoJ2lzb1dlZWsnKTtcblxuICAgICAgICAvLyBSZWFkIGRhaWx5IG5vdGVzIGZvciB0aGlzIHdlZWtcbiAgICAgICAgY29uc3QgZGFpbHlOb3RlcyA9IHRoaXMucGx1Z2luLnZhdWx0TWFuYWdlci5nZXREYWlseU5vdGVzSW5SYW5nZSh3ZWVrU3RhcnQsIHdlZWtFbmQpO1xuXG4gICAgICAgIGlmIChkYWlseU5vdGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgb25DaHVuayh0KCdpbnNpZ2h0Lm5vV2Vla2x5RGF0YScpKTtcbiAgICAgICAgICAgIG9uQ29tcGxldGUoJycpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVhZCBhbGwgbm90ZSBjb250ZW50cyB3aXRoIGNvbXBhY3QgbWV0YWRhdGEgcHJlYW1ibGVcbiAgICAgICAgY29uc3Qgam91cm5hbEVudHJpZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGZvciAoY29uc3Qgbm90ZSBvZiBkYWlseU5vdGVzKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVhbWJsZSA9IHRoaXMuYnVpbGRDb21wYWN0RGF5U3VtbWFyeShub3RlKTtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnBsdWdpbi5hcHAudmF1bHQuY2FjaGVkUmVhZChub3RlKTtcbiAgICAgICAgICAgIGNvbnN0IGtleVNlY3Rpb25zID0gdGhpcy5leHRyYWN0S2V5U2VjdGlvbnMoY29udGVudCk7XG4gICAgICAgICAgICBqb3VybmFsRW50cmllcy5wdXNoKGAtLS0gJHtub3RlLmJhc2VuYW1lfSAtLS1cXG4ke3ByZWFtYmxlfVxcbiR7a2V5U2VjdGlvbnN9YCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYWxsSm91cm5hbHMgPSBqb3VybmFsRW50cmllcy5qb2luKCdcXG5cXG4nKTtcblxuICAgICAgICAvLyBSZWFkIGNvbnRleHQgZGF0YVxuICAgICAgICBjb25zdCB1c2VyUHJvZmlsZSA9IGF3YWl0IHRoaXMucGx1Z2luLnZhdWx0TWFuYWdlci5nZXRVc2VyUHJvZmlsZUNvbnRlbnQoKTtcbiAgICAgICAgY29uc3QgcGF0dGVybnMgPSBhd2FpdCB0aGlzLnBsdWdpbi52YXVsdE1hbmFnZXIuZ2V0UGF0dGVybnNDb250ZW50KCk7XG4gICAgICAgIGNvbnN0IHByaW5jaXBsZXMgPSBhd2FpdCB0aGlzLnBsdWdpbi52YXVsdE1hbmFnZXIuZ2V0UHJpbmNpcGxlc0NvbnRlbnQoKTtcblxuICAgICAgICBjb25zdCBzeXN0ZW1Qcm9tcHQgPSBnZXRCYXNlQ29udGV4dFByb21wdCh1c2VyUHJvZmlsZSkgKyAnXFxuXFxuJyArIFdFRUtMWV9JTlNJR0hUX1BST01QVDtcblxuICAgICAgICBjb25zdCB1c2VyTWVzc2FnZSA9IGAke3QoJ2luc2lnaHQud2Vla2x5VXNlck1zZycsIHdlZWtTdGFydC5mb3JtYXQoJ1lZWVktTU0tREQnKSwgd2Vla0VuZC5mb3JtYXQoJ1lZWVktTU0tREQnKSwgU3RyaW5nKGRhaWx5Tm90ZXMubGVuZ3RoKSl9XG5cbiR7YWxsSm91cm5hbHN9XG5cbiR7cGF0dGVybnMgPyBgXFxuXFxuJHt0KCdpbnNpZ2h0Lmtub3duUGF0dGVybnMnKX1cXG4ke3BhdHRlcm5zfWAgOiAnJ31cbiR7cHJpbmNpcGxlcyA/IGBcXG5cXG4ke3QoJ2luc2lnaHQua25vd25QcmluY2lwbGVzJyl9XFxuJHtwcmluY2lwbGVzfWAgOiAnJ31cblxuJHt0KCdpbnNpZ2h0LmdlbmVyYXRlV2Vla2x5UmVwb3J0Jyl9YDtcblxuICAgICAgICBjb25zdCBtZXNzYWdlczogQ2hhdE1lc3NhZ2VbXSA9IFtcbiAgICAgICAgICAgIHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiB1c2VyTWVzc2FnZSwgdGltZXN0YW1wOiBEYXRlLm5vdygpIH0sXG4gICAgICAgIF07XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHByb3ZpZGVyID0gdGhpcy5wbHVnaW4uZ2V0QUlQcm92aWRlcigpO1xuICAgICAgICAgICAgbGV0IGZ1bGxSZXNwb25zZSA9ICcnO1xuXG4gICAgICAgICAgICBhd2FpdCBwcm92aWRlci5zZW5kTWVzc2FnZShcbiAgICAgICAgICAgICAgICBtZXNzYWdlcyxcbiAgICAgICAgICAgICAgICBzeXN0ZW1Qcm9tcHQsXG4gICAgICAgICAgICAgICAgKGNodW5rKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGZ1bGxSZXNwb25zZSArPSBjaHVuaztcbiAgICAgICAgICAgICAgICAgICAgb25DaHVuayhjaHVuayk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgLy8gU2F2ZSByZXBvcnQgdG8gYXJjaGl2ZSAoc3RyaXAgZXh0cmFjdGlvbiB0YWdzIGJlZm9yZSBzYXZpbmcpXG4gICAgICAgICAgICBjb25zdCBjbGVhblJlcG9ydCA9IHRoaXMuc3RyaXBFeHRyYWN0aW9uVGFncyhmdWxsUmVzcG9uc2UpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5zYXZlSW5zaWdodFJlcG9ydCgnd2Vla2x5Jywgd2Vla1N0YXJ0LCBjbGVhblJlcG9ydCk7XG5cbiAgICAgICAgICAgIC8vIEV4dHJhY3QgcGF0dGVybnMgYW5kIHByaW5jaXBsZXMgZnJvbSBzdHJ1Y3R1cmVkIHRhZ3NcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZXh0cmFjdEFuZFNhdmVQYXR0ZXJucyhmdWxsUmVzcG9uc2UpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5leHRyYWN0QW5kU2F2ZVByaW5jaXBsZXMoZnVsbFJlc3BvbnNlKTtcblxuICAgICAgICAgICAgb25Db21wbGV0ZShmdWxsUmVzcG9uc2UpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgb25DaHVuayhgXFxuXFxuJHtmb3JtYXRBUElFcnJvcihlcnJvciwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYWN0aXZlUHJvdmlkZXIpfWApO1xuICAgICAgICAgICAgb25Db21wbGV0ZSgnJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZW5lcmF0ZSBhIG1vbnRobHkgaW5zaWdodCByZXBvcnRcbiAgICAgKi9cbiAgICBhc3luYyBnZW5lcmF0ZU1vbnRobHlJbnNpZ2h0KFxuICAgICAgICBvbkNodW5rOiAoY2h1bms6IHN0cmluZykgPT4gdm9pZCxcbiAgICAgICAgb25Db21wbGV0ZTogKGZ1bGxSZXBvcnQ6IHN0cmluZykgPT4gdm9pZCxcbiAgICAgICAgdGFyZ2V0TW9udGg/OiBtb21lbnQuTW9tZW50LFxuICAgICk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCByZWYgPSB0YXJnZXRNb250aCA/IG1vbWVudCh0YXJnZXRNb250aCkgOiBtb21lbnQoKTtcbiAgICAgICAgY29uc3QgbW9udGhTdGFydCA9IHJlZi5jbG9uZSgpLnN0YXJ0T2YoJ21vbnRoJyk7XG4gICAgICAgIGNvbnN0IG1vbnRoRW5kID0gcmVmLmNsb25lKCkuZW5kT2YoJ21vbnRoJyk7XG5cbiAgICAgICAgLy8gUmVhZCBkYWlseSBub3RlcyBmb3IgdGhpcyBtb250aFxuICAgICAgICBjb25zdCBkYWlseU5vdGVzID0gdGhpcy5wbHVnaW4udmF1bHRNYW5hZ2VyLmdldERhaWx5Tm90ZXNJblJhbmdlKG1vbnRoU3RhcnQsIG1vbnRoRW5kKTtcblxuICAgICAgICBpZiAoZGFpbHlOb3Rlcy5sZW5ndGggPCAxKSB7XG4gICAgICAgICAgICBvbkNodW5rKHQoJ2luc2lnaHQubm9Nb250aGx5RGF0YScpKTtcbiAgICAgICAgICAgIG9uQ29tcGxldGUoJycpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVhZCBhbGwgbm90ZSBjb250ZW50cyAoc3VtbWFyaXplIGlmIHRvbyBsb25nKVxuICAgICAgICBjb25zdCBqb3VybmFsRW50cmllczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBub3RlIG9mIGRhaWx5Tm90ZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnBsdWdpbi5hcHAudmF1bHQuY2FjaGVkUmVhZChub3RlKTtcbiAgICAgICAgICAgIC8vIEZvciBtb250aGx5IHJlcG9ydHMsIHVzZSBjb21wYWN0IHByZWFtYmxlICsga2V5IHNlY3Rpb25zXG4gICAgICAgICAgICBjb25zdCBwcmVhbWJsZSA9IHRoaXMuYnVpbGRDb21wYWN0RGF5U3VtbWFyeShub3RlKTtcbiAgICAgICAgICAgIGNvbnN0IHN1bW1hcnkgPSB0aGlzLmV4dHJhY3RLZXlTZWN0aW9ucyhjb250ZW50KTtcbiAgICAgICAgICAgIGpvdXJuYWxFbnRyaWVzLnB1c2goYC0tLSAke25vdGUuYmFzZW5hbWV9IC0tLVxcbiR7cHJlYW1ibGV9XFxuJHtzdW1tYXJ5fWApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGFsbEpvdXJuYWxzID0gam91cm5hbEVudHJpZXMuam9pbignXFxuXFxuJyk7XG5cbiAgICAgICAgLy8gUmVhZCBjb250ZXh0IGRhdGFcbiAgICAgICAgY29uc3QgdXNlclByb2ZpbGUgPSBhd2FpdCB0aGlzLnBsdWdpbi52YXVsdE1hbmFnZXIuZ2V0VXNlclByb2ZpbGVDb250ZW50KCk7XG4gICAgICAgIGNvbnN0IHBhdHRlcm5zID0gYXdhaXQgdGhpcy5wbHVnaW4udmF1bHRNYW5hZ2VyLmdldFBhdHRlcm5zQ29udGVudCgpO1xuICAgICAgICBjb25zdCBwcmluY2lwbGVzID0gYXdhaXQgdGhpcy5wbHVnaW4udmF1bHRNYW5hZ2VyLmdldFByaW5jaXBsZXNDb250ZW50KCk7XG5cbiAgICAgICAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gZ2V0QmFzZUNvbnRleHRQcm9tcHQodXNlclByb2ZpbGUpICsgJ1xcblxcbicgKyBNT05USExZX0lOU0lHSFRfUFJPTVBUO1xuXG4gICAgICAgIGNvbnN0IHVzZXJNZXNzYWdlID0gYCR7dCgnaW5zaWdodC5tb250aGx5VXNlck1zZycsIG1vbnRoU3RhcnQuZm9ybWF0KCdZWVlZLU1NLUREJyksIG1vbnRoRW5kLmZvcm1hdCgnWVlZWS1NTS1ERCcpLCBTdHJpbmcoZGFpbHlOb3Rlcy5sZW5ndGgpKX1cblxuJHthbGxKb3VybmFsc31cblxuJHtwYXR0ZXJucyA/IGBcXG5cXG4ke3QoJ2luc2lnaHQua25vd25QYXR0ZXJucycpfVxcbiR7cGF0dGVybnN9YCA6ICcnfVxuJHtwcmluY2lwbGVzID8gYFxcblxcbiR7dCgnaW5zaWdodC5rbm93blByaW5jaXBsZXMnKX1cXG4ke3ByaW5jaXBsZXN9YCA6ICcnfVxuXG4ke3QoJ2luc2lnaHQuZ2VuZXJhdGVNb250aGx5UmVwb3J0Jyl9YDtcblxuICAgICAgICBjb25zdCBtZXNzYWdlczogQ2hhdE1lc3NhZ2VbXSA9IFtcbiAgICAgICAgICAgIHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiB1c2VyTWVzc2FnZSwgdGltZXN0YW1wOiBEYXRlLm5vdygpIH0sXG4gICAgICAgIF07XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHByb3ZpZGVyID0gdGhpcy5wbHVnaW4uZ2V0QUlQcm92aWRlcigpO1xuICAgICAgICAgICAgbGV0IGZ1bGxSZXNwb25zZSA9ICcnO1xuXG4gICAgICAgICAgICBhd2FpdCBwcm92aWRlci5zZW5kTWVzc2FnZShcbiAgICAgICAgICAgICAgICBtZXNzYWdlcyxcbiAgICAgICAgICAgICAgICBzeXN0ZW1Qcm9tcHQsXG4gICAgICAgICAgICAgICAgKGNodW5rKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGZ1bGxSZXNwb25zZSArPSBjaHVuaztcbiAgICAgICAgICAgICAgICAgICAgb25DaHVuayhjaHVuayk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgLy8gU2F2ZSByZXBvcnQgKHN0cmlwIGV4dHJhY3Rpb24gdGFncylcbiAgICAgICAgICAgIGNvbnN0IGNsZWFuUmVwb3J0ID0gdGhpcy5zdHJpcEV4dHJhY3Rpb25UYWdzKGZ1bGxSZXNwb25zZSk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnNhdmVJbnNpZ2h0UmVwb3J0KCdtb250aGx5JywgbW9udGhTdGFydCwgY2xlYW5SZXBvcnQpO1xuXG4gICAgICAgICAgICAvLyBFeHRyYWN0IHBhdHRlcm5zIGFuZCBwcmluY2lwbGVzXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmV4dHJhY3RBbmRTYXZlUGF0dGVybnMoZnVsbFJlc3BvbnNlKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZXh0cmFjdEFuZFNhdmVQcmluY2lwbGVzKGZ1bGxSZXNwb25zZSk7XG5cbiAgICAgICAgICAgIG9uQ29tcGxldGUoZnVsbFJlc3BvbnNlKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIG9uQ2h1bmsoYFxcblxcbiR7Zm9ybWF0QVBJRXJyb3IoZXJyb3IsIHRoaXMucGx1Z2luLnNldHRpbmdzLmFjdGl2ZVByb3ZpZGVyKX1gKTtcbiAgICAgICAgICAgIG9uQ29tcGxldGUoJycpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGUgcHJvZmlsZSB1cGRhdGUgc3VnZ2VzdGlvbnNcbiAgICAgKi9cbiAgICBhc3luYyBnZW5lcmF0ZVByb2ZpbGVTdWdnZXN0aW9ucyhcbiAgICAgICAgb25DaHVuazogKGNodW5rOiBzdHJpbmcpID0+IHZvaWQsXG4gICAgICAgIG9uQ29tcGxldGU/OiAoZnVsbFJlc3BvbnNlOiBzdHJpbmcpID0+IHZvaWRcbiAgICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgdG9kYXkgPSBtb21lbnQoKTtcbiAgICAgICAgY29uc3QgdHdvV2Vla3NBZ28gPSB0b2RheS5jbG9uZSgpLnN1YnRyYWN0KDE0LCAnZGF5cycpO1xuXG4gICAgICAgIGNvbnN0IGRhaWx5Tm90ZXMgPSB0aGlzLnBsdWdpbi52YXVsdE1hbmFnZXIuZ2V0RGFpbHlOb3Rlc0luUmFuZ2UodHdvV2Vla3NBZ28sIHRvZGF5KTtcblxuICAgICAgICBpZiAoZGFpbHlOb3Rlcy5sZW5ndGggPCA3KSB7XG4gICAgICAgICAgICBvbkNodW5rKHQoJ2luc2lnaHQubm9Qcm9maWxlRGF0YScpKTtcbiAgICAgICAgICAgIG9uQ29tcGxldGU/LignJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB1c2VyUHJvZmlsZSA9IGF3YWl0IHRoaXMucGx1Z2luLnZhdWx0TWFuYWdlci5nZXRVc2VyUHJvZmlsZUNvbnRlbnQoKTtcbiAgICAgICAgY29uc3Qgam91cm5hbEVudHJpZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGZvciAoY29uc3Qgbm90ZSBvZiBkYWlseU5vdGVzKSB7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5wbHVnaW4uYXBwLnZhdWx0LmNhY2hlZFJlYWQobm90ZSk7XG4gICAgICAgICAgICBjb25zdCBwcmVhbWJsZSA9IHRoaXMuYnVpbGRDb21wYWN0RGF5U3VtbWFyeShub3RlKTtcbiAgICAgICAgICAgIGNvbnN0IHN1bW1hcnkgPSB0aGlzLmV4dHJhY3RLZXlTZWN0aW9ucyhjb250ZW50KTtcbiAgICAgICAgICAgIGpvdXJuYWxFbnRyaWVzLnB1c2goYC0tLSAke25vdGUuYmFzZW5hbWV9IC0tLVxcbiR7cHJlYW1ibGV9XFxuJHtzdW1tYXJ5fWApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcHJvbXB0ID0gUFJPRklMRV9TVUdHRVNUSU9OX1BST01QVFxuICAgICAgICAgICAgLnJlcGxhY2UoJ3tDVVJSRU5UX1BST0ZJTEV9JywgdXNlclByb2ZpbGUgfHwgdCgnaW5zaWdodC5ub1Byb2ZpbGUnKSlcbiAgICAgICAgICAgIC5yZXBsYWNlKCd7UkVDRU5UX0pPVVJOQUxTfScsIGpvdXJuYWxFbnRyaWVzLmpvaW4oJ1xcblxcbicpKTtcblxuICAgICAgICBjb25zdCBzeXN0ZW1Qcm9tcHQgPSBnZXRCYXNlQ29udGV4dFByb21wdCh1c2VyUHJvZmlsZSk7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2VzOiBDaGF0TWVzc2FnZVtdID0gW1xuICAgICAgICAgICAgeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6IHByb21wdCwgdGltZXN0YW1wOiBEYXRlLm5vdygpIH0sXG4gICAgICAgIF07XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHByb3ZpZGVyID0gdGhpcy5wbHVnaW4uZ2V0QUlQcm92aWRlcigpO1xuICAgICAgICAgICAgbGV0IGZ1bGxSZXNwb25zZSA9ICcnO1xuXG4gICAgICAgICAgICBhd2FpdCBwcm92aWRlci5zZW5kTWVzc2FnZShtZXNzYWdlcywgc3lzdGVtUHJvbXB0LCAoY2h1bmspID0+IHtcbiAgICAgICAgICAgICAgICBmdWxsUmVzcG9uc2UgKz0gY2h1bms7XG4gICAgICAgICAgICAgICAgb25DaHVuayhjaHVuayk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gU2F2ZSBmdWxsIGFuYWx5c2lzIHRvIEluc2lnaHRzIGZvciBoaXN0b3J5IHRyYWNraW5nXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnNhdmVQcm9maWxlQW5hbHlzaXMoZnVsbFJlc3BvbnNlKTtcblxuICAgICAgICAgICAgLy8gRXh0cmFjdCBhbmQgc2F2ZSB1cGRhdGVkIHByb2ZpbGUgZnJvbSA8cHJvZmlsZV91cGRhdGU+IHRhZ1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5leHRyYWN0QW5kU2F2ZVByb2ZpbGUoZnVsbFJlc3BvbnNlKTtcblxuICAgICAgICAgICAgLy8gRXh0cmFjdCBwYXR0ZXJucyBhbmQgcHJpbmNpcGxlc1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5leHRyYWN0QW5kU2F2ZVBhdHRlcm5zKGZ1bGxSZXNwb25zZSk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmV4dHJhY3RBbmRTYXZlUHJpbmNpcGxlcyhmdWxsUmVzcG9uc2UpO1xuXG4gICAgICAgICAgICBvbkNvbXBsZXRlPy4oZnVsbFJlc3BvbnNlKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIG9uQ2h1bmsoYFxcblxcbiR7Zm9ybWF0QVBJRXJyb3IoZXJyb3IsIHRoaXMucGx1Z2luLnNldHRpbmdzLmFjdGl2ZVByb3ZpZGVyKX1gKTtcbiAgICAgICAgICAgIG9uQ29tcGxldGU/LignJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTYXZlIHByb2ZpbGUgYW5hbHlzaXMgdG8gSW5zaWdodHMgZm9sZGVyIGZvciBoaXN0b3J5IHRyYWNraW5nXG4gICAgICovXG4gICAgcHJpdmF0ZSBhc3luYyBzYXZlUHJvZmlsZUFuYWx5c2lzKGNvbnRlbnQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBpZiAoIWNvbnRlbnQudHJpbSgpKSByZXR1cm47XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnZhdWx0TWFuYWdlci5lbnN1cmVJbnNpZ2h0c0ZvbGRlcigpO1xuICAgICAgICAgICAgY29uc3QgZGF0ZSA9IG1vbWVudCgpLmZvcm1hdCgnWVlZWS1NTS1ERCcpO1xuICAgICAgICAgICAgY29uc3QgZmlsZVBhdGggPSBgJHt0aGlzLnBsdWdpbi5zZXR0aW5ncy5hcmNoaXZlRm9sZGVyfS9JbnNpZ2h0cy8ke3QoJ2luc2lnaHQucHJvZmlsZVVwZGF0ZUZpbGUnLCBkYXRlKX1gO1xuICAgICAgICAgICAgY29uc3QgaGVhZGVyID0gYCR7dCgnaW5zaWdodC5wcm9maWxlVXBkYXRlVGl0bGUnKX1cXG5cXG4ke3QoJ2luc2lnaHQuZ2VuZXJhdGVkQXQnLCBtb21lbnQoKS5mb3JtYXQoJ1lZWVktTU0tREQgSEg6bW0nKSl9XFxuXFxuYDtcblxuICAgICAgICAgICAgLy8gUmVtb3ZlIDxwcm9maWxlX3VwZGF0ZT4gYW5kIGV4dHJhY3Rpb24gdGFncyBmcm9tIHRoZSBzYXZlZCBhbmFseXNpc1xuICAgICAgICAgICAgLy8gKHByb2ZpbGUgZ29lcyB0byB1c2VyX3Byb2ZpbGUubWQsIHBhdHRlcm5zL3ByaW5jaXBsZXMgdG8gdGhlaXIgZmlsZXMpXG4gICAgICAgICAgICBjb25zdCBhbmFseXNpc09ubHkgPSBjb250ZW50XG4gICAgICAgICAgICAgICAgLnJlcGxhY2UoLzxwcm9maWxlX3VwZGF0ZT5bXFxzXFxTXSo/PFxcL3Byb2ZpbGVfdXBkYXRlPi9nLCAnJylcbiAgICAgICAgICAgICAgICAucmVwbGFjZSgvPG5ld19wYXR0ZXJucz5bXFxzXFxTXSo/PFxcL25ld19wYXR0ZXJucz4vZywgJycpXG4gICAgICAgICAgICAgICAgLnJlcGxhY2UoLzxuZXdfcHJpbmNpcGxlcz5bXFxzXFxTXSo/PFxcL25ld19wcmluY2lwbGVzPi9nLCAnJylcbiAgICAgICAgICAgICAgICAudHJpbSgpO1xuXG4gICAgICAgICAgICBjb25zdCBleGlzdGluZ0ZpbGUgPSB0aGlzLnBsdWdpbi5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZpbGVQYXRoKTtcbiAgICAgICAgICAgIGlmIChleGlzdGluZ0ZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmFwcC52YXVsdC5tb2RpZnkoZXhpc3RpbmdGaWxlLCBoZWFkZXIgKyBhbmFseXNpc09ubHkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5hcHAudmF1bHQuY3JlYXRlKGZpbGVQYXRoLCBoZWFkZXIgKyBhbmFseXNpc09ubHkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHNhdmUgcHJvZmlsZSBhbmFseXNpczonLCBlcnJvcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeHRyYWN0IHByb2ZpbGUgY29udGVudCBmcm9tIDxwcm9maWxlX3VwZGF0ZT4gdGFnIGFuZCBzYXZlIHRvIHVzZXJfcHJvZmlsZS5tZFxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgZXh0cmFjdEFuZFNhdmVQcm9maWxlKHJlc3BvbnNlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSByZXNwb25zZS5tYXRjaCgvPHByb2ZpbGVfdXBkYXRlPihbXFxzXFxTXSo/KTxcXC9wcm9maWxlX3VwZGF0ZT4vKTtcbiAgICAgICAgaWYgKCFtYXRjaCB8fCAhbWF0Y2hbMV0udHJpbSgpKSByZXR1cm47XG5cbiAgICAgICAgY29uc3QgbmV3UHJvZmlsZUNvbnRlbnQgPSBtYXRjaFsxXS50cmltKCk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHByb2ZpbGVQYXRoID0gYCR7dGhpcy5wbHVnaW4uc2V0dGluZ3MuYXJjaGl2ZUZvbGRlcn0vdXNlcl9wcm9maWxlLm1kYDtcbiAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nRmlsZSA9IHRoaXMucGx1Z2luLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocHJvZmlsZVBhdGgpO1xuXG4gICAgICAgICAgICBpZiAoZXhpc3RpbmdGaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5hcHAudmF1bHQubW9kaWZ5KGV4aXN0aW5nRmlsZSwgbmV3UHJvZmlsZUNvbnRlbnQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5hcHAudmF1bHQuY3JlYXRlKHByb2ZpbGVQYXRoLCBuZXdQcm9maWxlQ29udGVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gc2F2ZSB1cGRhdGVkIHVzZXIgcHJvZmlsZTonLCBlcnJvcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTYXZlIGluc2lnaHQgcmVwb3J0IHRvIGFyY2hpdmVcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIHNhdmVJbnNpZ2h0UmVwb3J0KFxuICAgICAgICB0eXBlOiAnd2Vla2x5JyB8ICdtb250aGx5JyxcbiAgICAgICAgZGF0ZTogbW9tZW50Lk1vbWVudCxcbiAgICAgICAgY29udGVudDogc3RyaW5nXG4gICAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGlmICghY29udGVudC50cmltKCkpIHJldHVybjtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4udmF1bHRNYW5hZ2VyLmVuc3VyZUluc2lnaHRzRm9sZGVyKCk7XG5cbiAgICAgICAgICAgIGNvbnN0IGZpbGVOYW1lID0gdHlwZSA9PT0gJ3dlZWtseSdcbiAgICAgICAgICAgICAgICA/IHQoJ2luc2lnaHQud2Vla2x5RmlsZU5hbWUnLCBkYXRlLmZvcm1hdCgnWVlZWScpLCBTdHJpbmcoZGF0ZS5pc29XZWVrKCkpKVxuICAgICAgICAgICAgICAgIDogdCgnaW5zaWdodC5tb250aGx5RmlsZU5hbWUnLCBkYXRlLmZvcm1hdCgnWVlZWS1NTScpKTtcblxuICAgICAgICAgICAgY29uc3QgZmlsZVBhdGggPSBgJHt0aGlzLnBsdWdpbi5zZXR0aW5ncy5hcmNoaXZlRm9sZGVyfS9JbnNpZ2h0cy8ke2ZpbGVOYW1lfWA7XG4gICAgICAgICAgICBjb25zdCBoZWFkZXIgPSB0eXBlID09PSAnd2Vla2x5J1xuICAgICAgICAgICAgICAgID8gYCR7dCgnaW5zaWdodC53ZWVrbHlSZXBvcnRUaXRsZScsIGRhdGUuZm9ybWF0KCdZWVlZJyksIFN0cmluZyhkYXRlLmlzb1dlZWsoKSkpfVxcblxcbiR7dCgnaW5zaWdodC5nZW5lcmF0ZWRBdCcsIG1vbWVudCgpLmZvcm1hdCgnWVlZWS1NTS1ERCBISDptbScpKX1cXG5cXG5gXG4gICAgICAgICAgICAgICAgOiBgJHt0KCdpbnNpZ2h0Lm1vbnRobHlSZXBvcnRUaXRsZScsIGdldExhbmd1YWdlKCkgPT09ICdlbicgPyBkYXRlLmZvcm1hdCgnWVlZWS1NTScpIDogZGF0ZS5mb3JtYXQoJ1lZWVnlubRNTeaciCcpKX1cXG5cXG4ke3QoJ2luc2lnaHQuZ2VuZXJhdGVkQXQnLCBtb21lbnQoKS5mb3JtYXQoJ1lZWVktTU0tREQgSEg6bW0nKSl9XFxuXFxuYDtcblxuICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdGaWxlID0gdGhpcy5wbHVnaW4uYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmaWxlUGF0aCk7XG4gICAgICAgICAgICBpZiAoZXhpc3RpbmdGaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgICAgICAgICAvLyBPdmVyd3JpdGUgZXhpc3RpbmcgcmVwb3J0XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uYXBwLnZhdWx0Lm1vZGlmeShleGlzdGluZ0ZpbGUsIGhlYWRlciArIGNvbnRlbnQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5hcHAudmF1bHQuY3JlYXRlKGZpbGVQYXRoLCBoZWFkZXIgKyBjb250ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBzYXZlICR7dHlwZX0gaW5zaWdodCByZXBvcnQ6YCwgZXJyb3IpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXh0cmFjdCBrZXkgc2VjdGlvbnMgZnJvbSBhIGRhaWx5IG5vdGUgdG8gYXZvaWQgdG9rZW4gb3ZlcmZsb3dcbiAgICAgKi9cbiAgICBwcml2YXRlIGV4dHJhY3RLZXlTZWN0aW9ucyhjb250ZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICBjb25zdCBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpO1xuICAgICAgICBjb25zdCBrZWVwU2VjdGlvbnMgPSBbXG4gICAgICAgICAgICB0KCdpbnNpZ2h0LnNlY3Rpb25QbGFuJyksIHQoJ2luc2lnaHQuc2VjdGlvblJldmlldycpLFxuICAgICAgICAgICAgdCgnaW5zaWdodC5zZWN0aW9uR29hbEFsaWduJyksIHQoJ2luc2lnaHQuc2VjdGlvblN1Y2Nlc3MnKSxcbiAgICAgICAgICAgIHQoJ2luc2lnaHQuc2VjdGlvbkpveUVtb3Rpb24nKSwgdCgnaW5zaWdodC5zZWN0aW9uQW54aWV0eScpLFxuICAgICAgICAgICAgdCgnaW5zaWdodC5zZWN0aW9uVG9tb3Jyb3cnKSwgdCgnaW5zaWdodC5zZWN0aW9uRGVlcCcpLFxuICAgICAgICAgICAgdCgnaW5zaWdodC5zZWN0aW9uUmVmbGVjdCcpLCB0KCdpbnNpZ2h0LnNlY3Rpb25QcmluY2lwbGUnKSxcbiAgICAgICAgICAgIHQoJ2luc2lnaHQuc2VjdGlvbkZyZWVXcml0ZScpLFxuICAgICAgICAgICAgLy8gQWx3YXlzIGluY2x1ZGUgQ2hpbmVzZSBzZWN0aW9uIG5hbWVzIGZvciBtYXRjaGluZyBleGlzdGluZyBub3Rlc1xuICAgICAgICAgICAgJ+iuoeWIkicsICflpI3nm5gnLCAn55uu5qCH5a+55qCHJywgJ+aIkOWKn+aXpeiusCcsXG4gICAgICAgICAgICAn5byA5b+D5LqL5LiO5oOF57uqJywgJ+eEpuiZkeinieWvnycsICfmmI7ml6XorqHliJInLCAn5rex5bqm5YiG5p6QJyxcbiAgICAgICAgICAgICflj43mgJ0nLCAn5Y6f5YiZ5o+Q54K8JywgJ+iHqueUsemaj+eslCcsXG4gICAgICAgIF07XG5cbiAgICAgICAgY29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBsZXQgaW5LZWVwU2VjdGlvbiA9IGZhbHNlO1xuXG4gICAgICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIHNlY3Rpb24gaGVhZGVyc1xuICAgICAgICAgICAgaWYgKGxpbmUuc3RhcnRzV2l0aCgnIyMgJykgfHwgbGluZS5zdGFydHNXaXRoKCcjIyMgJykpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzZWN0aW9uTmFtZSA9IGxpbmUucmVwbGFjZSgvXiN7MiwzfVxccysvLCAnJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIGluS2VlcFNlY3Rpb24gPSBrZWVwU2VjdGlvbnMuc29tZShzID0+IHNlY3Rpb25OYW1lLmluY2x1ZGVzKHMpKTtcbiAgICAgICAgICAgICAgICBpZiAoaW5LZWVwU2VjdGlvbikge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQucHVzaChsaW5lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpbktlZXBTZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2gobGluZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFsc28ga2VlcCBlbmVyZ3kgbGV2ZWwgYW5kIHRhc2sgbGluZXMgYXQgdG9wIGxldmVsXG4gICAgICAgICAgICBpZiAobGluZS5pbmNsdWRlcyh0KCdpbnNpZ2h0LmVuZXJneUxldmVsJykpIHx8IGxpbmUuaW5jbHVkZXMoJ+eyvuWKm+eKtuaAgScpIHx8IGxpbmUuaW5jbHVkZXMoJ0VuZXJneScpIHx8IGxpbmUubWF0Y2goL14tIFxcW1sgeF1cXF0vKSkge1xuICAgICAgICAgICAgICAgIGlmICghcmVzdWx0LmluY2x1ZGVzKGxpbmUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGxpbmUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXN1bHQuam9pbignXFxuJykudHJpbSgpIHx8IGNvbnRlbnQuc3Vic3RyaW5nKDAsIDEwMDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEJ1aWxkIGEgY29tcGFjdCBkYXkgc3VtbWFyeSBmcm9tIG1ldGFkYXRhQ2FjaGUgKHplcm8gSS9PIGZvciBtZXRhZGF0YSlcbiAgICAgKi9cbiAgICBwcml2YXRlIGJ1aWxkQ29tcGFjdERheVN1bW1hcnkoZmlsZTogVEZpbGUpOiBzdHJpbmcge1xuICAgICAgICBjb25zdCBjYWNoZSA9IHRoaXMucGx1Z2luLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmaWxlKTtcbiAgICAgICAgY29uc3QgZm0gPSBjYWNoZT8uZnJvbnRtYXR0ZXI7XG4gICAgICAgIGNvbnN0IGxpc3RJdGVtcyA9IGNhY2hlPy5saXN0SXRlbXMgPz8gW107XG4gICAgICAgIGNvbnN0IHRhc2tzID0gbGlzdEl0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0udGFzayAhPT0gdW5kZWZpbmVkKTtcbiAgICAgICAgY29uc3QgZG9uZSA9IHRhc2tzLmZpbHRlcih0ID0+IHQudGFzayA9PT0gJ3gnKS5sZW5ndGg7XG4gICAgICAgIGNvbnN0IHRvdGFsID0gdGFza3MubGVuZ3RoO1xuXG4gICAgICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBpZiAoZm0/LmVtb3Rpb25fc2NvcmUpIHBhcnRzLnB1c2goYCR7dCgnaW5zaWdodC5lbW90aW9uTGFiZWwnKX06ICR7Zm0uZW1vdGlvbl9zY29yZX0vMTBgKTtcbiAgICAgICAgaWYgKHRvdGFsID4gMCkgcGFydHMucHVzaChgJHt0KCdpbnNpZ2h0LnRhc2tMYWJlbCcpfTogJHtkb25lfS8ke3RvdGFsfWApO1xuICAgICAgICBpZiAoZm0/LnN0YXR1cykgcGFydHMucHVzaChgJHt0KCdpbnNpZ2h0LnN0YXR1c0xhYmVsJyl9OiAke2ZtLnN0YXR1c31gKTtcbiAgICAgICAgaWYgKGZtPy50YWdzICYmIEFycmF5LmlzQXJyYXkoZm0udGFncykgJiYgZm0udGFncy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwYXJ0cy5wdXNoKGAke3QoJ2luc2lnaHQudGFnTGFiZWwnKX06ICR7Zm0udGFncy5qb2luKCcsICcpfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHBhcnRzLmxlbmd0aCA+IDAgPyBgWyR7cGFydHMuam9pbignIHwgJyl9XWAgOiAnJztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeHRyYWN0IHBhdHRlcm5zIGZyb20gPG5ld19wYXR0ZXJucz4gdGFnIGFuZCBzYXZlXG4gICAgICovXG4gICAgcHJpdmF0ZSBhc3luYyBleHRyYWN0QW5kU2F2ZVBhdHRlcm5zKHJlc3BvbnNlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSByZXNwb25zZS5tYXRjaCgvPG5ld19wYXR0ZXJucz4oW1xcc1xcU10qPyk8XFwvbmV3X3BhdHRlcm5zPi8pO1xuICAgICAgICBpZiAoIW1hdGNoIHx8ICFtYXRjaFsxXS50cmltKCkgfHwgbWF0Y2hbMV0udHJpbSgpID09PSAn5pegJyB8fCBtYXRjaFsxXS50cmltKCkgPT09ICdOb25lJykgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IGJ1bGxldHMgPSBtYXRjaFsxXS5tYXRjaCgvLSAoLispL2cpO1xuICAgICAgICBpZiAoIWJ1bGxldHMpIHJldHVybjtcblxuICAgICAgICBmb3IgKGNvbnN0IGJ1bGxldCBvZiBidWxsZXRzLnNsaWNlKDAsIDUpKSB7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gYnVsbGV0LnJlcGxhY2UoL14tIC8sICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAodGV4dC5sZW5ndGggPiA1ICYmIHRleHQubGVuZ3RoIDwgMjAwKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4udmF1bHRNYW5hZ2VyLmFkZFBhdHRlcm4odGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeHRyYWN0IHByaW5jaXBsZXMgZnJvbSA8bmV3X3ByaW5jaXBsZXM+IHRhZyBhbmQgc2F2ZVxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgZXh0cmFjdEFuZFNhdmVQcmluY2lwbGVzKHJlc3BvbnNlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSByZXNwb25zZS5tYXRjaCgvPG5ld19wcmluY2lwbGVzPihbXFxzXFxTXSo/KTxcXC9uZXdfcHJpbmNpcGxlcz4vKTtcbiAgICAgICAgaWYgKCFtYXRjaCB8fCAhbWF0Y2hbMV0udHJpbSgpIHx8IG1hdGNoWzFdLnRyaW0oKSA9PT0gJ+aXoCcgfHwgbWF0Y2hbMV0udHJpbSgpID09PSAnTm9uZScpIHJldHVybjtcblxuICAgICAgICBjb25zdCBidWxsZXRzID0gbWF0Y2hbMV0ubWF0Y2goLy0gKC4rKS9nKTtcbiAgICAgICAgaWYgKCFidWxsZXRzKSByZXR1cm47XG5cbiAgICAgICAgZm9yIChjb25zdCBidWxsZXQgb2YgYnVsbGV0cy5zbGljZSgwLCAzKSkge1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGJ1bGxldC5yZXBsYWNlKC9eLSAvLCAnJykudHJpbSgpO1xuICAgICAgICAgICAgaWYgKHRleHQubGVuZ3RoID4gNSAmJiB0ZXh0Lmxlbmd0aCA8IDIwMCkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnZhdWx0TWFuYWdlci5hZGRQcmluY2lwbGUodGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdHJpcCBleHRyYWN0aW9uIHRhZ3MgZnJvbSByZXBvcnQgY29udGVudCAodXNlcnMgc2hvdWxkbid0IHNlZSB0aGVzZSlcbiAgICAgKi9cbiAgICBwcml2YXRlIHN0cmlwRXh0cmFjdGlvblRhZ3MoY29udGVudDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIGNvbnRlbnRcbiAgICAgICAgICAgIC5yZXBsYWNlKC88ZXh0cmFjdGlvbj5bXFxzXFxTXSo/PFxcL2V4dHJhY3Rpb24+L2csICcnKVxuICAgICAgICAgICAgLnJlcGxhY2UoLzxuZXdfcGF0dGVybnM+W1xcc1xcU10qPzxcXC9uZXdfcGF0dGVybnM+L2csICcnKVxuICAgICAgICAgICAgLnJlcGxhY2UoLzxuZXdfcHJpbmNpcGxlcz5bXFxzXFxTXSo/PFxcL25ld19wcmluY2lwbGVzPi9nLCAnJylcbiAgICAgICAgICAgIC50cmltKCk7XG4gICAgfVxufVxuIl19