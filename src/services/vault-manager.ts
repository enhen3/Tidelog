/**
 * Vault Manager - Handles file and folder operations
 */

import { App, CachedMetadata, TFile, TFolder, moment } from 'obsidian';
import { TideLogSettings } from '../types';
import { t } from '../i18n';

export class VaultManager {
    private app: App;
    private settings: TideLogSettings;

    constructor(app: App, settings: TideLogSettings) {
        this.app = app;
        this.settings = settings;
    }

    /**
     * Ensure the required directory structure exists
     */
    async ensureDirectoryStructure(): Promise<void> {
        const folders = [
            this.settings.dailyFolder,
            this.settings.planFolder,
            `${this.settings.planFolder}/Weekly`,
            `${this.settings.planFolder}/Monthly`,
            this.settings.archiveFolder,
            `${this.settings.archiveFolder}/Insights`,
        ];

        for (const folder of folders) {
            await this.ensureFolder(folder);
        }
    }

    /**
     * Create a folder if it doesn't exist
     */
    async ensureFolder(folderPath: string): Promise<void> {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            await this.app.vault.createFolder(folderPath);
        }
    }

    /**
     * Get the effective date considering the day boundary hour
     * Before 6:00 AM (or configured hour) counts as previous day
     */
    getEffectiveDate(date?: Date): moment.Moment {
        const now = date ? moment(date) : moment();
        const boundaryHour = this.settings.dayBoundaryHour;

        if (now.hour() < boundaryHour) {
            return now.subtract(1, 'day');
        }
        return now;
    }

    /**
     * Get the daily note path for a date
     */
    getDailyNotePath(date?: Date): string {
        const effectiveDate = this.getEffectiveDate(date);
        const filename = effectiveDate.format('YYYY-MM-DD');
        return `${this.settings.dailyFolder}/${filename}.md`;
    }

    /**
     * Get or create today's daily note
     */
    async getOrCreateDailyNote(date?: Date): Promise<TFile> {
        const path = this.getDailyNotePath(date);
        let file = this.app.vault.getAbstractFileByPath(path);

        if (!file) {
            const effectiveDate = this.getEffectiveDate(date);
            const content = this.createDailyNoteTemplate(effectiveDate);
            file = await this.app.vault.create(path, content);
        }

        if (!(file instanceof TFile)) {
            throw new Error(`Expected TFile at path: ${path}`);
        }
        return file;
    }

    /**
     * Create daily note template content
     */
    private createDailyNoteTemplate(date: moment.Moment): string {
        const dateStr = date.format('YYYY-MM-DD');
        const weekday = date.format('dddd');
        const weekRef = this.getWeekRef(date);
        const monthRef = date.format('YYYY-MM');

        return `---
type: daily
date: ${dateStr}
weekday: ${weekday}
tags:
  - daily
emotion_score:
status: todo
tasks_total: 0
tasks_done: 0
weekly_ref: "[[${weekRef}]]"
monthly_ref: "[[${monthRef}]]"
---

${t('vault.dailyNoteTitle', dateStr, weekday)}

## ${t('vault.sectionPlan')}

${t('vault.planComment')}

## ${t('vault.sectionReview')}

${t('vault.reviewComment')}

`;
    }

    /**
     * Get the week reference string (e.g., "2026-W06")
     */
    getWeekRef(date?: moment.Moment): string {
        const d = date || this.getEffectiveDate();
        return `${d.format('YYYY')}-W${d.format('ww')}`;
    }

    /**
     * Update YAML frontmatter fields using Obsidian's processFrontMatter API
     */
    async updateDailyNoteYAML(
        filePath: string,
        fields: Record<string, unknown>
    ): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file || !(file instanceof TFile)) return;

        await this.app.fileManager.processFrontMatter(file, (fm) => {
            for (const [key, value] of Object.entries(fields)) {
                fm[key] = value;
            }
        });
    }

    /**
     * Get parsed frontmatter from metadataCache (zero I/O)
     */
    getFrontmatter(file: TFile): Record<string, unknown> | undefined {
        return this.app.metadataCache.getFileCache(file)?.frontmatter;
    }

    /**
     * Get full file cache from metadataCache (zero I/O)
     */
    getFileCache(file: TFile): CachedMetadata | null {
        return this.app.metadataCache.getFileCache(file);
    }

    /**
     * Get the weekly plan path
     */
    getWeeklyPlanPath(date?: Date): string {
        // When an explicit date is provided (e.g. from week selector), use it directly
        // without day boundary offset — the boundary is only relevant for "today"
        const d = date ? moment(date) : this.getEffectiveDate();
        const year = d.isoWeekYear();
        const week = String(d.isoWeek()).padStart(2, '0');
        return `${this.settings.planFolder}/Weekly/${year}-W${week}.md`;
    }

    /**
     * Get the weekly plan content
     */
    async getWeeklyPlanContent(date?: Date): Promise<string | null> {
        const path = this.getWeeklyPlanPath(date);
        const file = this.app.vault.getAbstractFileByPath(path);

        if (file && file instanceof TFile) {
            return await this.app.vault.cachedRead(file);
        }

        return null;
    }

    /**
     * Get the monthly plan path
     */
    getMonthlyPlanPath(date?: Date): string {
        const d = date ? moment(date) : this.getEffectiveDate();
        const yearMonth = d.format('YYYY-MM');
        return `${this.settings.planFolder}/Monthly/${yearMonth}.md`;
    }

    /**
     * Get or create the weekly plan file
     */
    async getOrCreateWeeklyPlan(date?: Date, template?: string): Promise<TFile> {
        const path = this.getWeeklyPlanPath(date);
        let file = this.app.vault.getAbstractFileByPath(path);

        if (!file) {
            // Ensure folder exists
            const folder = path.substring(0, path.lastIndexOf('/'));
            if (!this.app.vault.getAbstractFileByPath(folder)) {
                await this.app.vault.createFolder(folder);
            }

            const content = template || `# Weekly Plan\n\n- [ ] \n`;
            file = await this.app.vault.create(path, content);
        }

        if (!(file instanceof TFile)) {
            throw new Error(`Expected TFile at path: ${path}`);
        }
        return file;
    }

    /**
     * Get or create the monthly plan file
     */
    async getOrCreateMonthlyPlan(date?: Date, template?: string): Promise<TFile> {
        const path = this.getMonthlyPlanPath(date);
        let file = this.app.vault.getAbstractFileByPath(path);

        if (!file) {
            // Ensure folder exists
            const folder = path.substring(0, path.lastIndexOf('/'));
            if (!this.app.vault.getAbstractFileByPath(folder)) {
                await this.app.vault.createFolder(folder);
            }

            const content = template || `# Monthly Plan\n\n- [ ] \n`;
            file = await this.app.vault.create(path, content);
        }

        if (!(file instanceof TFile)) {
            throw new Error(`Expected TFile at path: ${path}`);
        }
        return file;
    }

    /**
     * Get user profile content
     */
    async getUserProfileContent(): Promise<string | null> {
        const path = `${this.settings.archiveFolder}/user_profile.md`;
        const file = this.app.vault.getAbstractFileByPath(path);

        if (file && file instanceof TFile) {
            return await this.app.vault.cachedRead(file);
        }

        return null;
    }

    /**
     * Get principles content
     */
    async getPrinciplesContent(): Promise<string | null> {
        const path = `${this.settings.archiveFolder}/principles.md`;
        const file = this.app.vault.getAbstractFileByPath(path);

        if (file && file instanceof TFile) {
            return await this.app.vault.cachedRead(file);
        }

        return null;
    }

    /**
     * Append content to a file
     */
    async appendToFile(filePath: string, content: string): Promise<void> {
        let file = this.app.vault.getAbstractFileByPath(filePath);

        if (!file) {
            // Create the file if it doesn't exist
            file = await this.app.vault.create(filePath, content);
        } else if (file instanceof TFile) {
            const existingContent = await this.app.vault.read(file);
            await this.app.vault.modify(file, existingContent + content);
        }
    }

    /**
     * Append content to a specific section in a file
     */
    async appendToSection(
        filePath: string,
        sectionHeader: string,
        content: string
    ): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);

        if (file && file instanceof TFile) {
            const existingContent = await this.app.vault.read(file);
            const lines = existingContent.split('\n');
            let sectionIndex = -1;

            // Find the section header
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim().startsWith(`## ${sectionHeader}`)) {
                    sectionIndex = i;
                    break;
                }
            }

            if (sectionIndex === -1) {
                // Section not found, append at end with header
                await this.app.vault.modify(
                    file,
                    existingContent + `\n## ${sectionHeader}\n\n${content}\n`
                );
            } else {
                // Find the next section or end of file
                let insertIndex = sectionIndex + 1;
                while (insertIndex < lines.length) {
                    if (lines[insertIndex].startsWith('## ')) {
                        break;
                    }
                    insertIndex++;
                }

                // Insert content before next section
                lines.splice(insertIndex, 0, content);
                await this.app.vault.modify(file, lines.join('\n'));
            }
        }
    }

    /**
     * Replace all content within a section (between header and next header)
     */
    async replaceSectionContent(
        filePath: string,
        sectionHeader: string,
        newContent: string
    ): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);

        if (file && file instanceof TFile) {
            const existingContent = await this.app.vault.read(file);
            const lines = existingContent.split('\n');
            let sectionIndex = -1;

            // Find the section header
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim().startsWith(`## ${sectionHeader}`)) {
                    sectionIndex = i;
                    break;
                }
            }

            if (sectionIndex === -1) {
                // Section not found, append at end with header
                await this.app.vault.modify(
                    file,
                    existingContent + `\n## ${sectionHeader}\n\n${newContent}\n`
                );
            } else {
                // Find the next section or end of file
                let nextSectionIndex = sectionIndex + 1;
                while (nextSectionIndex < lines.length) {
                    if (lines[nextSectionIndex].startsWith('## ')) {
                        break;
                    }
                    nextSectionIndex++;
                }

                // Replace everything between section header and next section
                const before = lines.slice(0, sectionIndex + 1);
                const after = lines.slice(nextSectionIndex);
                const result = [...before, '', newContent, '', ...after];
                await this.app.vault.modify(file, result.join('\n'));
            }
        }
    }

    /**
     * Add a principle to the principles file
     */
    async addPrinciple(principle: string, category?: string): Promise<void> {
        category = category || t('vault.principleCategory');
        const path = `${this.settings.archiveFolder}/principles.md`;
        const date = moment().format('YYYY-MM-DD');
        const entry = `\n- ${principle} _(${date})_`;

        await this.appendToSection(path, category, entry);
    }

    /**
     * Add a pattern to the patterns file
     */
    async addPattern(pattern: string, category?: string): Promise<void> {
        category = category || t('vault.patternCategory');
        const path = `${this.settings.archiveFolder}/patterns.md`;
        const date = moment().format('YYYY-MM-DD');
        const entry = `\n- ${pattern} _(${t('vault.patternDatePrefix')} ${date})_`;

        await this.appendToSection(path, category, entry);
    }

    /**
     * Get all daily notes in a date range
     */
    getDailyNotesInRange(
        startDate: moment.Moment,
        endDate: moment.Moment
    ): TFile[] {
        const files: TFile[] = [];
        const folder = this.app.vault.getAbstractFileByPath(this.settings.dailyFolder);

        if (folder && folder instanceof TFolder) {
            for (const child of folder.children) {
                if (child instanceof TFile && child.extension === 'md') {
                    const dateStr = child.basename;
                    const fileDate = moment(dateStr, 'YYYY-MM-DD');

                    if (
                        fileDate.isValid() &&
                        fileDate.isSameOrAfter(startDate, 'day') &&
                        fileDate.isSameOrBefore(endDate, 'day')
                    ) {
                        files.push(child);
                    }
                }
            }
        }

        return files.sort((a, b) => a.basename.localeCompare(b.basename));
    }

    /**
     * Read content of a specific section from a file
     */
    async readSectionContent(filePath: string, sectionHeader: string): Promise<string | null> {
        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return null;

            const content = await this.app.vault.cachedRead(file);
            const lines = content.split('\n');
            let inSection = false;
            const sectionLines: string[] = [];

            for (const line of lines) {
                if (line.trim().startsWith(`## ${sectionHeader}`)) {
                    inSection = true;
                    continue;
                }
                if (inSection && line.startsWith('## ')) {
                    break;
                }
                if (inSection) {
                    sectionLines.push(line);
                }
            }

            const result = sectionLines.join('\n').trim();
            return result || null;
        } catch {
            return null;
        }
    }

    /**
     * Get patterns file content
     */
    async getPatternsContent(): Promise<string | null> {
        try {
            const path = `${this.settings.archiveFolder}/patterns.md`;
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!file || !(file instanceof TFile)) return null;
            return await this.app.vault.cachedRead(file);
        } catch {
            return null;
        }
    }

    /**
     * Ensure the insights directory exists
     */
    async ensureInsightsFolder(): Promise<void> {
        await this.ensureFolder(`${this.settings.archiveFolder}/Insights`);
    }

    /**
     * Get unfinished tasks from recent daily notes (excluding today)
     */
    async getUnfinishedTasks(daysBack: number = 3): Promise<{ text: string; date: string; filePath: string }[]> {
        const result: { text: string; date: string; filePath: string }[] = [];
        const today = this.getEffectiveDate();

        for (let i = 1; i <= daysBack; i++) {
            const d = moment(today).subtract(i, 'days');
            const dateStr = d.format('YYYY-MM-DD');
            const path = `${this.settings.dailyFolder}/${dateStr}.md`;
            const file = this.app.vault.getAbstractFileByPath(path);

            if (file && file instanceof TFile) {
                try {
                    const cache = this.app.metadataCache.getFileCache(file);
                    if (!cache?.listItems) continue;

                    // Only read file if there are unchecked tasks
                    const unchecked = cache.listItems.filter(item => item.task === ' ');
                    if (unchecked.length === 0) continue;

                    const content = await this.app.vault.cachedRead(file);
                    for (const item of unchecked) {
                        const line = content.substring(
                            item.position.start.offset,
                            item.position.end.offset
                        );
                        const m = line.match(/^- \[ \] (.+)$/);
                        if (m) {
                            result.push({ text: m[1].trim(), date: dateStr, filePath: path });
                        }
                    }
                } catch { /* skip */ }
            }
        }

        return result;
    }

    /**
     * Add a task line to today's daily note under 计划
     */
    async addTaskToDaily(taskText: string, date?: Date): Promise<void> {
        const file = await this.getOrCreateDailyNote(date);
        const content = await this.app.vault.cachedRead(file);
        const taskLine = `- [ ] ${taskText}`;

        // Try to insert under ## Plan / ## 计划
        const sectionHeader = `## ${t('vault.sectionPlan')}`;
        const lines = content.split('\n');
        let insertIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith(sectionHeader) || lines[i].trim().startsWith('## 计划') || lines[i].trim().startsWith('## Plan')) {
                insertIdx = i + 1;
                // Skip past any sub-headers, blank lines, or existing content until next ## or ---
                while (insertIdx < lines.length && !lines[insertIdx].startsWith('## ') && !lines[insertIdx].startsWith('---')) {
                    insertIdx++;
                }
                break;
            }
        }

        if (insertIdx >= 0) {
            lines.splice(insertIdx, 0, taskLine);
        } else {
            // Fallback: append
            lines.push(taskLine);
        }

        await this.app.vault.modify(file, lines.join('\n'));
    }
}
