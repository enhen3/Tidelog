/**
 * Vault Manager - Handles file and folder operations
 */
import { TFile, TFolder, moment } from 'obsidian';
import { t } from '../i18n';
export class VaultManager {
    constructor(app, settings) {
        this.app = app;
        this.settings = settings;
    }
    /**
     * Ensure the required directory structure exists
     */
    async ensureDirectoryStructure() {
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
    async ensureFolder(folderPath) {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            await this.app.vault.createFolder(folderPath);
        }
    }
    /**
     * Get the effective date considering the day boundary hour
     * Before 6:00 AM (or configured hour) counts as previous day
     */
    getEffectiveDate(date) {
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
    getDailyNotePath(date) {
        // When an explicit date is provided (e.g. from calendar selector), use it directly
        // without day boundary offset — the boundary is only relevant for "today"
        const d = date ? moment(date) : this.getEffectiveDate();
        const filename = d.format('YYYY-MM-DD');
        return `${this.settings.dailyFolder}/${filename}.md`;
    }
    /**
     * Get or create today's daily note
     */
    async getOrCreateDailyNote(date) {
        const path = this.getDailyNotePath(date);
        let file = this.app.vault.getAbstractFileByPath(path);
        if (!file) {
            const d = date ? moment(date) : this.getEffectiveDate();
            const content = this.createDailyNoteTemplate(d);
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
    createDailyNoteTemplate(date) {
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
    getWeekRef(date) {
        const d = date || this.getEffectiveDate();
        return `${d.format('YYYY')}-W${d.format('ww')}`;
    }
    /**
     * Update YAML frontmatter fields using Obsidian's processFrontMatter API
     */
    async updateDailyNoteYAML(filePath, fields) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file || !(file instanceof TFile))
            return;
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            for (const [key, value] of Object.entries(fields)) {
                fm[key] = value;
            }
        });
    }
    /**
     * Get parsed frontmatter from metadataCache (zero I/O)
     */
    getFrontmatter(file) {
        return this.app.metadataCache.getFileCache(file)?.frontmatter;
    }
    /**
     * Get full file cache from metadataCache (zero I/O)
     */
    getFileCache(file) {
        return this.app.metadataCache.getFileCache(file);
    }
    /**
     * Get the weekly plan path
     */
    getWeeklyPlanPath(date) {
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
    async getWeeklyPlanContent(date) {
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
    getMonthlyPlanPath(date) {
        const d = date ? moment(date) : this.getEffectiveDate();
        const yearMonth = d.format('YYYY-MM');
        return `${this.settings.planFolder}/Monthly/${yearMonth}.md`;
    }
    /**
     * Get or create the weekly plan file
     */
    async getOrCreateWeeklyPlan(date, template) {
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
    async getOrCreateMonthlyPlan(date, template) {
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
    async getUserProfileContent() {
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
    async getPrinciplesContent() {
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
    async appendToFile(filePath, content) {
        let file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file) {
            // Create the file if it doesn't exist
            file = await this.app.vault.create(filePath, content);
        }
        else if (file instanceof TFile) {
            const existingContent = await this.app.vault.read(file);
            await this.app.vault.modify(file, existingContent + content);
        }
    }
    /**
     * Append content to a specific section in a file
     */
    async appendToSection(filePath, sectionHeader, content) {
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
                await this.app.vault.modify(file, existingContent + `\n## ${sectionHeader}\n\n${content}\n`);
            }
            else {
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
    async replaceSectionContent(filePath, sectionHeader, newContent) {
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
                await this.app.vault.modify(file, existingContent + `\n## ${sectionHeader}\n\n${newContent}\n`);
            }
            else {
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
    async addPrinciple(principle, category) {
        category = category || t('vault.principleCategory');
        const path = `${this.settings.archiveFolder}/principles.md`;
        const date = moment().format('YYYY-MM-DD');
        const entry = `\n- ${principle} _(${date})_`;
        await this.appendToSection(path, category, entry);
    }
    /**
     * Add a pattern to the patterns file
     */
    async addPattern(pattern, category) {
        category = category || t('vault.patternCategory');
        const path = `${this.settings.archiveFolder}/patterns.md`;
        const date = moment().format('YYYY-MM-DD');
        const entry = `\n- ${pattern} _(${t('vault.patternDatePrefix')} ${date})_`;
        await this.appendToSection(path, category, entry);
    }
    /**
     * Get all daily notes in a date range
     */
    getDailyNotesInRange(startDate, endDate) {
        const files = [];
        const folder = this.app.vault.getAbstractFileByPath(this.settings.dailyFolder);
        if (folder && folder instanceof TFolder) {
            for (const child of folder.children) {
                if (child instanceof TFile && child.extension === 'md') {
                    const dateStr = child.basename;
                    const fileDate = moment(dateStr, 'YYYY-MM-DD');
                    if (fileDate.isValid() &&
                        fileDate.isSameOrAfter(startDate, 'day') &&
                        fileDate.isSameOrBefore(endDate, 'day')) {
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
    async readSectionContent(filePath, sectionHeader) {
        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile))
                return null;
            const content = await this.app.vault.cachedRead(file);
            const lines = content.split('\n');
            let inSection = false;
            const sectionLines = [];
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
        }
        catch {
            return null;
        }
    }
    /**
     * Get patterns file content
     */
    async getPatternsContent() {
        try {
            const path = `${this.settings.archiveFolder}/patterns.md`;
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!file || !(file instanceof TFile))
                return null;
            return await this.app.vault.cachedRead(file);
        }
        catch {
            return null;
        }
    }
    /**
     * Ensure the insights directory exists
     */
    async ensureInsightsFolder() {
        await this.ensureFolder(`${this.settings.archiveFolder}/Insights`);
    }
    /**
     * Get unfinished tasks from recent daily notes (excluding today)
     */
    async getUnfinishedTasks(daysBack = 3) {
        const result = [];
        const today = this.getEffectiveDate();
        for (let i = 1; i <= daysBack; i++) {
            const d = moment(today).subtract(i, 'days');
            const dateStr = d.format('YYYY-MM-DD');
            const path = `${this.settings.dailyFolder}/${dateStr}.md`;
            const file = this.app.vault.getAbstractFileByPath(path);
            if (file && file instanceof TFile) {
                try {
                    const cache = this.app.metadataCache.getFileCache(file);
                    if (!cache?.listItems)
                        continue;
                    // Only read file if there are unchecked tasks
                    const unchecked = cache.listItems.filter(item => item.task === ' ');
                    if (unchecked.length === 0)
                        continue;
                    const content = await this.app.vault.cachedRead(file);
                    for (const item of unchecked) {
                        const line = content.substring(item.position.start.offset, item.position.end.offset);
                        const m = line.match(/^- \[ \] (.+)$/);
                        if (m) {
                            result.push({ text: m[1].trim(), date: dateStr, filePath: path });
                        }
                    }
                }
                catch { /* skip */ }
            }
        }
        return result;
    }
    /**
     * Add a task line to today's daily note under 计划
     */
    async addTaskToDaily(taskText, date) {
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
        }
        else {
            // Fallback: append
            lines.push(taskLine);
        }
        await this.app.vault.modify(file, lines.join('\n'));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmF1bHQtbWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZhdWx0LW1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0dBRUc7QUFFSCxPQUFPLEVBQXVCLEtBQUssRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRXZFLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFFNUIsTUFBTSxPQUFPLFlBQVk7SUFJckIsWUFBWSxHQUFRLEVBQUUsUUFBeUI7UUFDM0MsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztJQUM3QixDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsd0JBQXdCO1FBQzFCLE1BQU0sT0FBTyxHQUFHO1lBQ1osSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXO1lBQ3pCLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVTtZQUN4QixHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxTQUFTO1lBQ3BDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLFVBQVU7WUFDckMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhO1lBQzNCLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLFdBQVc7U0FDNUMsQ0FBQztRQUVGLEtBQUssTUFBTSxNQUFNLElBQUksT0FBTyxFQUFFLENBQUM7WUFDM0IsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3BDLENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsWUFBWSxDQUFDLFVBQWtCO1FBQ2pDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2hFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNWLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xELENBQUM7SUFDTCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsZ0JBQWdCLENBQUMsSUFBVztRQUN4QixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDM0MsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUM7UUFFbkQsSUFBSSxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsWUFBWSxFQUFFLENBQUM7WUFDNUIsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNsQyxDQUFDO1FBQ0QsT0FBTyxHQUFHLENBQUM7SUFDZixDQUFDO0lBRUQ7O09BRUc7SUFDSCxnQkFBZ0IsQ0FBQyxJQUFXO1FBQ3hCLG1GQUFtRjtRQUNuRiwwRUFBMEU7UUFDMUUsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQ3hELE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDeEMsT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxJQUFJLFFBQVEsS0FBSyxDQUFDO0lBQ3pELENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxJQUFXO1FBQ2xDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QyxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUV0RCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDUixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDeEQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hELElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDdEQsQ0FBQztRQUVELElBQUksQ0FBQyxDQUFDLElBQUksWUFBWSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzNCLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLElBQUksRUFBRSxDQUFDLENBQUM7UUFDdkQsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUFFRDs7T0FFRztJQUNLLHVCQUF1QixDQUFDLElBQW1CO1FBQy9DLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDMUMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNwQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFeEMsT0FBTzs7UUFFUCxPQUFPO1dBQ0osT0FBTzs7Ozs7OztpQkFPRCxPQUFPO2tCQUNOLFFBQVE7OztFQUd4QixDQUFDLENBQUMsc0JBQXNCLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQzs7S0FFeEMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDOztFQUV6QixDQUFDLENBQUMsbUJBQW1CLENBQUM7O0tBRW5CLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQzs7RUFFM0IsQ0FBQyxDQUFDLHFCQUFxQixDQUFDOztDQUV6QixDQUFDO0lBQ0UsQ0FBQztJQUVEOztPQUVHO0lBQ0gsVUFBVSxDQUFDLElBQW9CO1FBQzNCLE1BQU0sQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUMxQyxPQUFPLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7SUFDcEQsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLG1CQUFtQixDQUNyQixRQUFnQixFQUNoQixNQUErQjtRQUUvQixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1RCxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxJQUFJLFlBQVksS0FBSyxDQUFDO1lBQUUsT0FBTztRQUU5QyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ3ZELEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ2hELEVBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7WUFDcEIsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVEOztPQUVHO0lBQ0gsY0FBYyxDQUFDLElBQVc7UUFDdEIsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsV0FBVyxDQUFDO0lBQ2xFLENBQUM7SUFFRDs7T0FFRztJQUNILFlBQVksQ0FBQyxJQUFXO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFRDs7T0FFRztJQUNILGlCQUFpQixDQUFDLElBQVc7UUFDekIsK0VBQStFO1FBQy9FLDBFQUEwRTtRQUMxRSxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDeEQsTUFBTSxJQUFJLEdBQUcsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQzdCLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2xELE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsV0FBVyxJQUFJLEtBQUssSUFBSSxLQUFLLENBQUM7SUFDcEUsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLG9CQUFvQixDQUFDLElBQVc7UUFDbEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzFDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXhELElBQUksSUFBSSxJQUFJLElBQUksWUFBWSxLQUFLLEVBQUUsQ0FBQztZQUNoQyxPQUFPLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNoQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxrQkFBa0IsQ0FBQyxJQUFXO1FBQzFCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUN4RCxNQUFNLFNBQVMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3RDLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsWUFBWSxTQUFTLEtBQUssQ0FBQztJQUNqRSxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMscUJBQXFCLENBQUMsSUFBVyxFQUFFLFFBQWlCO1FBQ3RELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxQyxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUV0RCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDUix1QkFBdUI7WUFDdkIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3hELElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUNoRCxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM5QyxDQUFDO1lBRUQsTUFBTSxPQUFPLEdBQUcsUUFBUSxJQUFJLDJCQUEyQixDQUFDO1lBQ3hELElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDdEQsQ0FBQztRQUVELElBQUksQ0FBQyxDQUFDLElBQUksWUFBWSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzNCLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLElBQUksRUFBRSxDQUFDLENBQUM7UUFDdkQsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxJQUFXLEVBQUUsUUFBaUI7UUFDdkQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzNDLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXRELElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNSLHVCQUF1QjtZQUN2QixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDeEQsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ2hELE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzlDLENBQUM7WUFFRCxNQUFNLE9BQU8sR0FBRyxRQUFRLElBQUksNEJBQTRCLENBQUM7WUFDekQsSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN0RCxDQUFDO1FBRUQsSUFBSSxDQUFDLENBQUMsSUFBSSxZQUFZLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDM0IsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN2RCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLHFCQUFxQjtRQUN2QixNQUFNLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxrQkFBa0IsQ0FBQztRQUM5RCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUV4RCxJQUFJLElBQUksSUFBSSxJQUFJLFlBQVksS0FBSyxFQUFFLENBQUM7WUFDaEMsT0FBTyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLG9CQUFvQjtRQUN0QixNQUFNLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxnQkFBZ0IsQ0FBQztRQUM1RCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUV4RCxJQUFJLElBQUksSUFBSSxJQUFJLFlBQVksS0FBSyxFQUFFLENBQUM7WUFDaEMsT0FBTyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFlBQVksQ0FBQyxRQUFnQixFQUFFLE9BQWU7UUFDaEQsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFMUQsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1Isc0NBQXNDO1lBQ3RDLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDMUQsQ0FBQzthQUFNLElBQUksSUFBSSxZQUFZLEtBQUssRUFBRSxDQUFDO1lBQy9CLE1BQU0sZUFBZSxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3hELE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxlQUFlLEdBQUcsT0FBTyxDQUFDLENBQUM7UUFDakUsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxlQUFlLENBQ2pCLFFBQWdCLEVBQ2hCLGFBQXFCLEVBQ3JCLE9BQWU7UUFFZixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUU1RCxJQUFJLElBQUksSUFBSSxJQUFJLFlBQVksS0FBSyxFQUFFLENBQUM7WUFDaEMsTUFBTSxlQUFlLEdBQUcsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDeEQsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMxQyxJQUFJLFlBQVksR0FBRyxDQUFDLENBQUMsQ0FBQztZQUV0QiwwQkFBMEI7WUFDMUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDcEMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLE1BQU0sYUFBYSxFQUFFLENBQUMsRUFBRSxDQUFDO29CQUNwRCxZQUFZLEdBQUcsQ0FBQyxDQUFDO29CQUNqQixNQUFNO2dCQUNWLENBQUM7WUFDTCxDQUFDO1lBRUQsSUFBSSxZQUFZLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDdEIsK0NBQStDO2dCQUMvQyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FDdkIsSUFBSSxFQUNKLGVBQWUsR0FBRyxRQUFRLGFBQWEsT0FBTyxPQUFPLElBQUksQ0FDNUQsQ0FBQztZQUNOLENBQUM7aUJBQU0sQ0FBQztnQkFDSix1Q0FBdUM7Z0JBQ3ZDLElBQUksV0FBVyxHQUFHLFlBQVksR0FBRyxDQUFDLENBQUM7Z0JBQ25DLE9BQU8sV0FBVyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDaEMsSUFBSSxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7d0JBQ3ZDLE1BQU07b0JBQ1YsQ0FBQztvQkFDRCxXQUFXLEVBQUUsQ0FBQztnQkFDbEIsQ0FBQztnQkFFRCxxQ0FBcUM7Z0JBQ3JDLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDdEMsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUN4RCxDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxxQkFBcUIsQ0FDdkIsUUFBZ0IsRUFDaEIsYUFBcUIsRUFDckIsVUFBa0I7UUFFbEIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFNUQsSUFBSSxJQUFJLElBQUksSUFBSSxZQUFZLEtBQUssRUFBRSxDQUFDO1lBQ2hDLE1BQU0sZUFBZSxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3hELE1BQU0sS0FBSyxHQUFHLGVBQWUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDMUMsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFFdEIsMEJBQTBCO1lBQzFCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ3BDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxNQUFNLGFBQWEsRUFBRSxDQUFDLEVBQUUsQ0FBQztvQkFDcEQsWUFBWSxHQUFHLENBQUMsQ0FBQztvQkFDakIsTUFBTTtnQkFDVixDQUFDO1lBQ0wsQ0FBQztZQUVELElBQUksWUFBWSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RCLCtDQUErQztnQkFDL0MsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQ3ZCLElBQUksRUFDSixlQUFlLEdBQUcsUUFBUSxhQUFhLE9BQU8sVUFBVSxJQUFJLENBQy9ELENBQUM7WUFDTixDQUFDO2lCQUFNLENBQUM7Z0JBQ0osdUNBQXVDO2dCQUN2QyxJQUFJLGdCQUFnQixHQUFHLFlBQVksR0FBRyxDQUFDLENBQUM7Z0JBQ3hDLE9BQU8sZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUNyQyxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO3dCQUM1QyxNQUFNO29CQUNWLENBQUM7b0JBQ0QsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDdkIsQ0FBQztnQkFFRCw2REFBNkQ7Z0JBQzdELE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLFlBQVksR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDaEQsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUM1QyxNQUFNLE1BQU0sR0FBRyxDQUFDLEdBQUcsTUFBTSxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUM7Z0JBQ3pELE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDekQsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsWUFBWSxDQUFDLFNBQWlCLEVBQUUsUUFBaUI7UUFDbkQsUUFBUSxHQUFHLFFBQVEsSUFBSSxDQUFDLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUNwRCxNQUFNLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxnQkFBZ0IsQ0FBQztRQUM1RCxNQUFNLElBQUksR0FBRyxNQUFNLEVBQUUsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDM0MsTUFBTSxLQUFLLEdBQUcsT0FBTyxTQUFTLE1BQU0sSUFBSSxJQUFJLENBQUM7UUFFN0MsTUFBTSxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFVBQVUsQ0FBQyxPQUFlLEVBQUUsUUFBaUI7UUFDL0MsUUFBUSxHQUFHLFFBQVEsSUFBSSxDQUFDLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUNsRCxNQUFNLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxjQUFjLENBQUM7UUFDMUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzNDLE1BQU0sS0FBSyxHQUFHLE9BQU8sT0FBTyxNQUFNLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDO1FBRTNFLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFRDs7T0FFRztJQUNILG9CQUFvQixDQUNoQixTQUF3QixFQUN4QixPQUFzQjtRQUV0QixNQUFNLEtBQUssR0FBWSxFQUFFLENBQUM7UUFDMUIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUUvRSxJQUFJLE1BQU0sSUFBSSxNQUFNLFlBQVksT0FBTyxFQUFFLENBQUM7WUFDdEMsS0FBSyxNQUFNLEtBQUssSUFBSSxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ2xDLElBQUksS0FBSyxZQUFZLEtBQUssSUFBSSxLQUFLLENBQUMsU0FBUyxLQUFLLElBQUksRUFBRSxDQUFDO29CQUNyRCxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO29CQUMvQixNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxDQUFDO29CQUUvQyxJQUNJLFFBQVEsQ0FBQyxPQUFPLEVBQUU7d0JBQ2xCLFFBQVEsQ0FBQyxhQUFhLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQzt3QkFDeEMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLEVBQ3pDLENBQUM7d0JBQ0MsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDdEIsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQztRQUNMLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsa0JBQWtCLENBQUMsUUFBZ0IsRUFBRSxhQUFxQjtRQUM1RCxJQUFJLENBQUM7WUFDRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUM1RCxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxJQUFJLFlBQVksS0FBSyxDQUFDO2dCQUFFLE9BQU8sSUFBSSxDQUFDO1lBRW5ELE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3RELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEMsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDO1lBQ3RCLE1BQU0sWUFBWSxHQUFhLEVBQUUsQ0FBQztZQUVsQyxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUN2QixJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsTUFBTSxhQUFhLEVBQUUsQ0FBQyxFQUFFLENBQUM7b0JBQ2hELFNBQVMsR0FBRyxJQUFJLENBQUM7b0JBQ2pCLFNBQVM7Z0JBQ2IsQ0FBQztnQkFDRCxJQUFJLFNBQVMsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ3RDLE1BQU07Z0JBQ1YsQ0FBQztnQkFDRCxJQUFJLFNBQVMsRUFBRSxDQUFDO29CQUNaLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzVCLENBQUM7WUFDTCxDQUFDO1lBRUQsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUM5QyxPQUFPLE1BQU0sSUFBSSxJQUFJLENBQUM7UUFDMUIsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNMLE9BQU8sSUFBSSxDQUFDO1FBQ2hCLENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsa0JBQWtCO1FBQ3BCLElBQUksQ0FBQztZQUNELE1BQU0sSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLGNBQWMsQ0FBQztZQUMxRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN4RCxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxJQUFJLFlBQVksS0FBSyxDQUFDO2dCQUFFLE9BQU8sSUFBSSxDQUFDO1lBQ25ELE9BQU8sTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakQsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNMLE9BQU8sSUFBSSxDQUFDO1FBQ2hCLENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsb0JBQW9CO1FBQ3RCLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxXQUFXLENBQUMsQ0FBQztJQUN2RSxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsa0JBQWtCLENBQUMsV0FBbUIsQ0FBQztRQUN6QyxNQUFNLE1BQU0sR0FBdUQsRUFBRSxDQUFDO1FBQ3RFLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBRXRDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxRQUFRLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNqQyxNQUFNLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUM1QyxNQUFNLE9BQU8sR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ3ZDLE1BQU0sSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLElBQUksT0FBTyxLQUFLLENBQUM7WUFDMUQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFeEQsSUFBSSxJQUFJLElBQUksSUFBSSxZQUFZLEtBQUssRUFBRSxDQUFDO2dCQUNoQyxJQUFJLENBQUM7b0JBQ0QsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUN4RCxJQUFJLENBQUMsS0FBSyxFQUFFLFNBQVM7d0JBQUUsU0FBUztvQkFFaEMsOENBQThDO29CQUM5QyxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7b0JBQ3BFLElBQUksU0FBUyxDQUFDLE1BQU0sS0FBSyxDQUFDO3dCQUFFLFNBQVM7b0JBRXJDLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUN0RCxLQUFLLE1BQU0sSUFBSSxJQUFJLFNBQVMsRUFBRSxDQUFDO3dCQUMzQixNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsU0FBUyxDQUMxQixJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQzFCLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FDM0IsQ0FBQzt3QkFDRixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7d0JBQ3ZDLElBQUksQ0FBQyxFQUFFLENBQUM7NEJBQ0osTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQzt3QkFDdEUsQ0FBQztvQkFDTCxDQUFDO2dCQUNMLENBQUM7Z0JBQUMsTUFBTSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDMUIsQ0FBQztRQUNMLENBQUM7UUFFRCxPQUFPLE1BQU0sQ0FBQztJQUNsQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsY0FBYyxDQUFDLFFBQWdCLEVBQUUsSUFBVztRQUM5QyxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNuRCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN0RCxNQUFNLFFBQVEsR0FBRyxTQUFTLFFBQVEsRUFBRSxDQUFDO1FBRXJDLHNDQUFzQztRQUN0QyxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUM7UUFDckQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNsQyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNuQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3BDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztnQkFDNUgsU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ2xCLG1GQUFtRjtnQkFDbkYsT0FBTyxTQUFTLEdBQUcsS0FBSyxDQUFDLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQzVHLFNBQVMsRUFBRSxDQUFDO2dCQUNoQixDQUFDO2dCQUNELE1BQU07WUFDVixDQUFDO1FBQ0wsQ0FBQztRQUVELElBQUksU0FBUyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2pCLEtBQUssQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN6QyxDQUFDO2FBQU0sQ0FBQztZQUNKLG1CQUFtQjtZQUNuQixLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3pCLENBQUM7UUFFRCxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3hELENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogVmF1bHQgTWFuYWdlciAtIEhhbmRsZXMgZmlsZSBhbmQgZm9sZGVyIG9wZXJhdGlvbnNcbiAqL1xuXG5pbXBvcnQgeyBBcHAsIENhY2hlZE1ldGFkYXRhLCBURmlsZSwgVEZvbGRlciwgbW9tZW50IH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHsgVGlkZUxvZ1NldHRpbmdzIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgdCB9IGZyb20gJy4uL2kxOG4nO1xuXG5leHBvcnQgY2xhc3MgVmF1bHRNYW5hZ2VyIHtcbiAgICBwcml2YXRlIGFwcDogQXBwO1xuICAgIHByaXZhdGUgc2V0dGluZ3M6IFRpZGVMb2dTZXR0aW5ncztcblxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBzZXR0aW5nczogVGlkZUxvZ1NldHRpbmdzKSB7XG4gICAgICAgIHRoaXMuYXBwID0gYXBwO1xuICAgICAgICB0aGlzLnNldHRpbmdzID0gc2V0dGluZ3M7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW5zdXJlIHRoZSByZXF1aXJlZCBkaXJlY3Rvcnkgc3RydWN0dXJlIGV4aXN0c1xuICAgICAqL1xuICAgIGFzeW5jIGVuc3VyZURpcmVjdG9yeVN0cnVjdHVyZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgZm9sZGVycyA9IFtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuZGFpbHlGb2xkZXIsXG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzLnBsYW5Gb2xkZXIsXG4gICAgICAgICAgICBgJHt0aGlzLnNldHRpbmdzLnBsYW5Gb2xkZXJ9L1dlZWtseWAsXG4gICAgICAgICAgICBgJHt0aGlzLnNldHRpbmdzLnBsYW5Gb2xkZXJ9L01vbnRobHlgLFxuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5hcmNoaXZlRm9sZGVyLFxuICAgICAgICAgICAgYCR7dGhpcy5zZXR0aW5ncy5hcmNoaXZlRm9sZGVyfS9JbnNpZ2h0c2AsXG4gICAgICAgIF07XG5cbiAgICAgICAgZm9yIChjb25zdCBmb2xkZXIgb2YgZm9sZGVycykge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5lbnN1cmVGb2xkZXIoZm9sZGVyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIGZvbGRlciBpZiBpdCBkb2Vzbid0IGV4aXN0XG4gICAgICovXG4gICAgYXN5bmMgZW5zdXJlRm9sZGVyKGZvbGRlclBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBmb2xkZXIgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZm9sZGVyUGF0aCk7XG4gICAgICAgIGlmICghZm9sZGVyKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIoZm9sZGVyUGF0aCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgdGhlIGVmZmVjdGl2ZSBkYXRlIGNvbnNpZGVyaW5nIHRoZSBkYXkgYm91bmRhcnkgaG91clxuICAgICAqIEJlZm9yZSA2OjAwIEFNIChvciBjb25maWd1cmVkIGhvdXIpIGNvdW50cyBhcyBwcmV2aW91cyBkYXlcbiAgICAgKi9cbiAgICBnZXRFZmZlY3RpdmVEYXRlKGRhdGU/OiBEYXRlKTogbW9tZW50Lk1vbWVudCB7XG4gICAgICAgIGNvbnN0IG5vdyA9IGRhdGUgPyBtb21lbnQoZGF0ZSkgOiBtb21lbnQoKTtcbiAgICAgICAgY29uc3QgYm91bmRhcnlIb3VyID0gdGhpcy5zZXR0aW5ncy5kYXlCb3VuZGFyeUhvdXI7XG5cbiAgICAgICAgaWYgKG5vdy5ob3VyKCkgPCBib3VuZGFyeUhvdXIpIHtcbiAgICAgICAgICAgIHJldHVybiBub3cuc3VidHJhY3QoMSwgJ2RheScpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBub3c7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHRoZSBkYWlseSBub3RlIHBhdGggZm9yIGEgZGF0ZVxuICAgICAqL1xuICAgIGdldERhaWx5Tm90ZVBhdGgoZGF0ZT86IERhdGUpOiBzdHJpbmcge1xuICAgICAgICAvLyBXaGVuIGFuIGV4cGxpY2l0IGRhdGUgaXMgcHJvdmlkZWQgKGUuZy4gZnJvbSBjYWxlbmRhciBzZWxlY3RvciksIHVzZSBpdCBkaXJlY3RseVxuICAgICAgICAvLyB3aXRob3V0IGRheSBib3VuZGFyeSBvZmZzZXQg4oCUIHRoZSBib3VuZGFyeSBpcyBvbmx5IHJlbGV2YW50IGZvciBcInRvZGF5XCJcbiAgICAgICAgY29uc3QgZCA9IGRhdGUgPyBtb21lbnQoZGF0ZSkgOiB0aGlzLmdldEVmZmVjdGl2ZURhdGUoKTtcbiAgICAgICAgY29uc3QgZmlsZW5hbWUgPSBkLmZvcm1hdCgnWVlZWS1NTS1ERCcpO1xuICAgICAgICByZXR1cm4gYCR7dGhpcy5zZXR0aW5ncy5kYWlseUZvbGRlcn0vJHtmaWxlbmFtZX0ubWRgO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCBvciBjcmVhdGUgdG9kYXkncyBkYWlseSBub3RlXG4gICAgICovXG4gICAgYXN5bmMgZ2V0T3JDcmVhdGVEYWlseU5vdGUoZGF0ZT86IERhdGUpOiBQcm9taXNlPFRGaWxlPiB7XG4gICAgICAgIGNvbnN0IHBhdGggPSB0aGlzLmdldERhaWx5Tm90ZVBhdGgoZGF0ZSk7XG4gICAgICAgIGxldCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhdGgpO1xuXG4gICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgICAgY29uc3QgZCA9IGRhdGUgPyBtb21lbnQoZGF0ZSkgOiB0aGlzLmdldEVmZmVjdGl2ZURhdGUoKTtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSB0aGlzLmNyZWF0ZURhaWx5Tm90ZVRlbXBsYXRlKGQpO1xuICAgICAgICAgICAgZmlsZSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShwYXRoLCBjb250ZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhwZWN0ZWQgVEZpbGUgYXQgcGF0aDogJHtwYXRofWApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmaWxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBkYWlseSBub3RlIHRlbXBsYXRlIGNvbnRlbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIGNyZWF0ZURhaWx5Tm90ZVRlbXBsYXRlKGRhdGU6IG1vbWVudC5Nb21lbnQpOiBzdHJpbmcge1xuICAgICAgICBjb25zdCBkYXRlU3RyID0gZGF0ZS5mb3JtYXQoJ1lZWVktTU0tREQnKTtcbiAgICAgICAgY29uc3Qgd2Vla2RheSA9IGRhdGUuZm9ybWF0KCdkZGRkJyk7XG4gICAgICAgIGNvbnN0IHdlZWtSZWYgPSB0aGlzLmdldFdlZWtSZWYoZGF0ZSk7XG4gICAgICAgIGNvbnN0IG1vbnRoUmVmID0gZGF0ZS5mb3JtYXQoJ1lZWVktTU0nKTtcblxuICAgICAgICByZXR1cm4gYC0tLVxudHlwZTogZGFpbHlcbmRhdGU6ICR7ZGF0ZVN0cn1cbndlZWtkYXk6ICR7d2Vla2RheX1cbnRhZ3M6XG4gIC0gZGFpbHlcbmVtb3Rpb25fc2NvcmU6XG5zdGF0dXM6IHRvZG9cbnRhc2tzX3RvdGFsOiAwXG50YXNrc19kb25lOiAwXG53ZWVrbHlfcmVmOiBcIltbJHt3ZWVrUmVmfV1dXCJcbm1vbnRobHlfcmVmOiBcIltbJHttb250aFJlZn1dXVwiXG4tLS1cblxuJHt0KCd2YXVsdC5kYWlseU5vdGVUaXRsZScsIGRhdGVTdHIsIHdlZWtkYXkpfVxuXG4jIyAke3QoJ3ZhdWx0LnNlY3Rpb25QbGFuJyl9XG5cbiR7dCgndmF1bHQucGxhbkNvbW1lbnQnKX1cblxuIyMgJHt0KCd2YXVsdC5zZWN0aW9uUmV2aWV3Jyl9XG5cbiR7dCgndmF1bHQucmV2aWV3Q29tbWVudCcpfVxuXG5gO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgd2VlayByZWZlcmVuY2Ugc3RyaW5nIChlLmcuLCBcIjIwMjYtVzA2XCIpXG4gICAgICovXG4gICAgZ2V0V2Vla1JlZihkYXRlPzogbW9tZW50Lk1vbWVudCk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IGQgPSBkYXRlIHx8IHRoaXMuZ2V0RWZmZWN0aXZlRGF0ZSgpO1xuICAgICAgICByZXR1cm4gYCR7ZC5mb3JtYXQoJ1lZWVknKX0tVyR7ZC5mb3JtYXQoJ3d3Jyl9YDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGUgWUFNTCBmcm9udG1hdHRlciBmaWVsZHMgdXNpbmcgT2JzaWRpYW4ncyBwcm9jZXNzRnJvbnRNYXR0ZXIgQVBJXG4gICAgICovXG4gICAgYXN5bmMgdXBkYXRlRGFpbHlOb3RlWUFNTChcbiAgICAgICAgZmlsZVBhdGg6IHN0cmluZyxcbiAgICAgICAgZmllbGRzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxuICAgICk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZpbGVQYXRoKTtcbiAgICAgICAgaWYgKCFmaWxlIHx8ICEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkgcmV0dXJuO1xuXG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcihmaWxlLCAoZm0pID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGZpZWxkcykpIHtcbiAgICAgICAgICAgICAgICBmbVtrZXldID0gdmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCBwYXJzZWQgZnJvbnRtYXR0ZXIgZnJvbSBtZXRhZGF0YUNhY2hlICh6ZXJvIEkvTylcbiAgICAgKi9cbiAgICBnZXRGcm9udG1hdHRlcihmaWxlOiBURmlsZSk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgZnVsbCBmaWxlIGNhY2hlIGZyb20gbWV0YWRhdGFDYWNoZSAoemVybyBJL08pXG4gICAgICovXG4gICAgZ2V0RmlsZUNhY2hlKGZpbGU6IFRGaWxlKTogQ2FjaGVkTWV0YWRhdGEgfCBudWxsIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgd2Vla2x5IHBsYW4gcGF0aFxuICAgICAqL1xuICAgIGdldFdlZWtseVBsYW5QYXRoKGRhdGU/OiBEYXRlKTogc3RyaW5nIHtcbiAgICAgICAgLy8gV2hlbiBhbiBleHBsaWNpdCBkYXRlIGlzIHByb3ZpZGVkIChlLmcuIGZyb20gd2VlayBzZWxlY3RvciksIHVzZSBpdCBkaXJlY3RseVxuICAgICAgICAvLyB3aXRob3V0IGRheSBib3VuZGFyeSBvZmZzZXQg4oCUIHRoZSBib3VuZGFyeSBpcyBvbmx5IHJlbGV2YW50IGZvciBcInRvZGF5XCJcbiAgICAgICAgY29uc3QgZCA9IGRhdGUgPyBtb21lbnQoZGF0ZSkgOiB0aGlzLmdldEVmZmVjdGl2ZURhdGUoKTtcbiAgICAgICAgY29uc3QgeWVhciA9IGQuaXNvV2Vla1llYXIoKTtcbiAgICAgICAgY29uc3Qgd2VlayA9IFN0cmluZyhkLmlzb1dlZWsoKSkucGFkU3RhcnQoMiwgJzAnKTtcbiAgICAgICAgcmV0dXJuIGAke3RoaXMuc2V0dGluZ3MucGxhbkZvbGRlcn0vV2Vla2x5LyR7eWVhcn0tVyR7d2Vla30ubWRgO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgd2Vla2x5IHBsYW4gY29udGVudFxuICAgICAqL1xuICAgIGFzeW5jIGdldFdlZWtseVBsYW5Db250ZW50KGRhdGU/OiBEYXRlKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgICAgIGNvbnN0IHBhdGggPSB0aGlzLmdldFdlZWtseVBsYW5QYXRoKGRhdGUpO1xuICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhdGgpO1xuXG4gICAgICAgIGlmIChmaWxlICYmIGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNhY2hlZFJlYWQoZmlsZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgdGhlIG1vbnRobHkgcGxhbiBwYXRoXG4gICAgICovXG4gICAgZ2V0TW9udGhseVBsYW5QYXRoKGRhdGU/OiBEYXRlKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgZCA9IGRhdGUgPyBtb21lbnQoZGF0ZSkgOiB0aGlzLmdldEVmZmVjdGl2ZURhdGUoKTtcbiAgICAgICAgY29uc3QgeWVhck1vbnRoID0gZC5mb3JtYXQoJ1lZWVktTU0nKTtcbiAgICAgICAgcmV0dXJuIGAke3RoaXMuc2V0dGluZ3MucGxhbkZvbGRlcn0vTW9udGhseS8ke3llYXJNb250aH0ubWRgO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCBvciBjcmVhdGUgdGhlIHdlZWtseSBwbGFuIGZpbGVcbiAgICAgKi9cbiAgICBhc3luYyBnZXRPckNyZWF0ZVdlZWtseVBsYW4oZGF0ZT86IERhdGUsIHRlbXBsYXRlPzogc3RyaW5nKTogUHJvbWlzZTxURmlsZT4ge1xuICAgICAgICBjb25zdCBwYXRoID0gdGhpcy5nZXRXZWVrbHlQbGFuUGF0aChkYXRlKTtcbiAgICAgICAgbGV0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocGF0aCk7XG5cbiAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgICAvLyBFbnN1cmUgZm9sZGVyIGV4aXN0c1xuICAgICAgICAgICAgY29uc3QgZm9sZGVyID0gcGF0aC5zdWJzdHJpbmcoMCwgcGF0aC5sYXN0SW5kZXhPZignLycpKTtcbiAgICAgICAgICAgIGlmICghdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZvbGRlcikpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIoZm9sZGVyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IHRlbXBsYXRlIHx8IGAjIFdlZWtseSBQbGFuXFxuXFxuLSBbIF0gXFxuYDtcbiAgICAgICAgICAgIGZpbGUgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUocGF0aCwgY29udGVudCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIFRGaWxlIGF0IHBhdGg6ICR7cGF0aH1gKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmlsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgb3IgY3JlYXRlIHRoZSBtb250aGx5IHBsYW4gZmlsZVxuICAgICAqL1xuICAgIGFzeW5jIGdldE9yQ3JlYXRlTW9udGhseVBsYW4oZGF0ZT86IERhdGUsIHRlbXBsYXRlPzogc3RyaW5nKTogUHJvbWlzZTxURmlsZT4ge1xuICAgICAgICBjb25zdCBwYXRoID0gdGhpcy5nZXRNb250aGx5UGxhblBhdGgoZGF0ZSk7XG4gICAgICAgIGxldCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhdGgpO1xuXG4gICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgICAgLy8gRW5zdXJlIGZvbGRlciBleGlzdHNcbiAgICAgICAgICAgIGNvbnN0IGZvbGRlciA9IHBhdGguc3Vic3RyaW5nKDAsIHBhdGgubGFzdEluZGV4T2YoJy8nKSk7XG4gICAgICAgICAgICBpZiAoIXRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmb2xkZXIpKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlRm9sZGVyKGZvbGRlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSB0ZW1wbGF0ZSB8fCBgIyBNb250aGx5IFBsYW5cXG5cXG4tIFsgXSBcXG5gO1xuICAgICAgICAgICAgZmlsZSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShwYXRoLCBjb250ZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhwZWN0ZWQgVEZpbGUgYXQgcGF0aDogJHtwYXRofWApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmaWxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB1c2VyIHByb2ZpbGUgY29udGVudFxuICAgICAqL1xuICAgIGFzeW5jIGdldFVzZXJQcm9maWxlQ29udGVudCgpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgICAgICAgY29uc3QgcGF0aCA9IGAke3RoaXMuc2V0dGluZ3MuYXJjaGl2ZUZvbGRlcn0vdXNlcl9wcm9maWxlLm1kYDtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcblxuICAgICAgICBpZiAoZmlsZSAmJiBmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmFwcC52YXVsdC5jYWNoZWRSZWFkKGZpbGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHByaW5jaXBsZXMgY29udGVudFxuICAgICAqL1xuICAgIGFzeW5jIGdldFByaW5jaXBsZXNDb250ZW50KCk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgICAgICBjb25zdCBwYXRoID0gYCR7dGhpcy5zZXR0aW5ncy5hcmNoaXZlRm9sZGVyfS9wcmluY2lwbGVzLm1kYDtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcblxuICAgICAgICBpZiAoZmlsZSAmJiBmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmFwcC52YXVsdC5jYWNoZWRSZWFkKGZpbGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXBwZW5kIGNvbnRlbnQgdG8gYSBmaWxlXG4gICAgICovXG4gICAgYXN5bmMgYXBwZW5kVG9GaWxlKGZpbGVQYXRoOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBsZXQgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmaWxlUGF0aCk7XG5cbiAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgICAvLyBDcmVhdGUgdGhlIGZpbGUgaWYgaXQgZG9lc24ndCBleGlzdFxuICAgICAgICAgICAgZmlsZSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShmaWxlUGF0aCwgY29udGVudCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgICAgICBjb25zdCBleGlzdGluZ0NvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIGV4aXN0aW5nQ29udGVudCArIGNvbnRlbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXBwZW5kIGNvbnRlbnQgdG8gYSBzcGVjaWZpYyBzZWN0aW9uIGluIGEgZmlsZVxuICAgICAqL1xuICAgIGFzeW5jIGFwcGVuZFRvU2VjdGlvbihcbiAgICAgICAgZmlsZVBhdGg6IHN0cmluZyxcbiAgICAgICAgc2VjdGlvbkhlYWRlcjogc3RyaW5nLFxuICAgICAgICBjb250ZW50OiBzdHJpbmdcbiAgICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmaWxlUGF0aCk7XG5cbiAgICAgICAgaWYgKGZpbGUgJiYgZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgICAgICBjb25zdCBleGlzdGluZ0NvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICAgICAgY29uc3QgbGluZXMgPSBleGlzdGluZ0NvbnRlbnQuc3BsaXQoJ1xcbicpO1xuICAgICAgICAgICAgbGV0IHNlY3Rpb25JbmRleCA9IC0xO1xuXG4gICAgICAgICAgICAvLyBGaW5kIHRoZSBzZWN0aW9uIGhlYWRlclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChsaW5lc1tpXS50cmltKCkuc3RhcnRzV2l0aChgIyMgJHtzZWN0aW9uSGVhZGVyfWApKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlY3Rpb25JbmRleCA9IGk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHNlY3Rpb25JbmRleCA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAvLyBTZWN0aW9uIG5vdCBmb3VuZCwgYXBwZW5kIGF0IGVuZCB3aXRoIGhlYWRlclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShcbiAgICAgICAgICAgICAgICAgICAgZmlsZSxcbiAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdDb250ZW50ICsgYFxcbiMjICR7c2VjdGlvbkhlYWRlcn1cXG5cXG4ke2NvbnRlbnR9XFxuYFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEZpbmQgdGhlIG5leHQgc2VjdGlvbiBvciBlbmQgb2YgZmlsZVxuICAgICAgICAgICAgICAgIGxldCBpbnNlcnRJbmRleCA9IHNlY3Rpb25JbmRleCArIDE7XG4gICAgICAgICAgICAgICAgd2hpbGUgKGluc2VydEluZGV4IDwgbGluZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChsaW5lc1tpbnNlcnRJbmRleF0uc3RhcnRzV2l0aCgnIyMgJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGluc2VydEluZGV4Kys7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gSW5zZXJ0IGNvbnRlbnQgYmVmb3JlIG5leHQgc2VjdGlvblxuICAgICAgICAgICAgICAgIGxpbmVzLnNwbGljZShpbnNlcnRJbmRleCwgMCwgY29udGVudCk7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIGxpbmVzLmpvaW4oJ1xcbicpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlcGxhY2UgYWxsIGNvbnRlbnQgd2l0aGluIGEgc2VjdGlvbiAoYmV0d2VlbiBoZWFkZXIgYW5kIG5leHQgaGVhZGVyKVxuICAgICAqL1xuICAgIGFzeW5jIHJlcGxhY2VTZWN0aW9uQ29udGVudChcbiAgICAgICAgZmlsZVBhdGg6IHN0cmluZyxcbiAgICAgICAgc2VjdGlvbkhlYWRlcjogc3RyaW5nLFxuICAgICAgICBuZXdDb250ZW50OiBzdHJpbmdcbiAgICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmaWxlUGF0aCk7XG5cbiAgICAgICAgaWYgKGZpbGUgJiYgZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgICAgICBjb25zdCBleGlzdGluZ0NvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICAgICAgY29uc3QgbGluZXMgPSBleGlzdGluZ0NvbnRlbnQuc3BsaXQoJ1xcbicpO1xuICAgICAgICAgICAgbGV0IHNlY3Rpb25JbmRleCA9IC0xO1xuXG4gICAgICAgICAgICAvLyBGaW5kIHRoZSBzZWN0aW9uIGhlYWRlclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChsaW5lc1tpXS50cmltKCkuc3RhcnRzV2l0aChgIyMgJHtzZWN0aW9uSGVhZGVyfWApKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlY3Rpb25JbmRleCA9IGk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHNlY3Rpb25JbmRleCA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAvLyBTZWN0aW9uIG5vdCBmb3VuZCwgYXBwZW5kIGF0IGVuZCB3aXRoIGhlYWRlclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShcbiAgICAgICAgICAgICAgICAgICAgZmlsZSxcbiAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdDb250ZW50ICsgYFxcbiMjICR7c2VjdGlvbkhlYWRlcn1cXG5cXG4ke25ld0NvbnRlbnR9XFxuYFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEZpbmQgdGhlIG5leHQgc2VjdGlvbiBvciBlbmQgb2YgZmlsZVxuICAgICAgICAgICAgICAgIGxldCBuZXh0U2VjdGlvbkluZGV4ID0gc2VjdGlvbkluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICB3aGlsZSAobmV4dFNlY3Rpb25JbmRleCA8IGxpbmVzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAobGluZXNbbmV4dFNlY3Rpb25JbmRleF0uc3RhcnRzV2l0aCgnIyMgJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIG5leHRTZWN0aW9uSW5kZXgrKztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBSZXBsYWNlIGV2ZXJ5dGhpbmcgYmV0d2VlbiBzZWN0aW9uIGhlYWRlciBhbmQgbmV4dCBzZWN0aW9uXG4gICAgICAgICAgICAgICAgY29uc3QgYmVmb3JlID0gbGluZXMuc2xpY2UoMCwgc2VjdGlvbkluZGV4ICsgMSk7XG4gICAgICAgICAgICAgICAgY29uc3QgYWZ0ZXIgPSBsaW5lcy5zbGljZShuZXh0U2VjdGlvbkluZGV4KTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBbLi4uYmVmb3JlLCAnJywgbmV3Q29udGVudCwgJycsIC4uLmFmdGVyXTtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgcmVzdWx0LmpvaW4oJ1xcbicpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZCBhIHByaW5jaXBsZSB0byB0aGUgcHJpbmNpcGxlcyBmaWxlXG4gICAgICovXG4gICAgYXN5bmMgYWRkUHJpbmNpcGxlKHByaW5jaXBsZTogc3RyaW5nLCBjYXRlZ29yeT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjYXRlZ29yeSA9IGNhdGVnb3J5IHx8IHQoJ3ZhdWx0LnByaW5jaXBsZUNhdGVnb3J5Jyk7XG4gICAgICAgIGNvbnN0IHBhdGggPSBgJHt0aGlzLnNldHRpbmdzLmFyY2hpdmVGb2xkZXJ9L3ByaW5jaXBsZXMubWRgO1xuICAgICAgICBjb25zdCBkYXRlID0gbW9tZW50KCkuZm9ybWF0KCdZWVlZLU1NLUREJyk7XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gYFxcbi0gJHtwcmluY2lwbGV9IF8oJHtkYXRlfSlfYDtcblxuICAgICAgICBhd2FpdCB0aGlzLmFwcGVuZFRvU2VjdGlvbihwYXRoLCBjYXRlZ29yeSwgZW50cnkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZCBhIHBhdHRlcm4gdG8gdGhlIHBhdHRlcm5zIGZpbGVcbiAgICAgKi9cbiAgICBhc3luYyBhZGRQYXR0ZXJuKHBhdHRlcm46IHN0cmluZywgY2F0ZWdvcnk/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY2F0ZWdvcnkgPSBjYXRlZ29yeSB8fCB0KCd2YXVsdC5wYXR0ZXJuQ2F0ZWdvcnknKTtcbiAgICAgICAgY29uc3QgcGF0aCA9IGAke3RoaXMuc2V0dGluZ3MuYXJjaGl2ZUZvbGRlcn0vcGF0dGVybnMubWRgO1xuICAgICAgICBjb25zdCBkYXRlID0gbW9tZW50KCkuZm9ybWF0KCdZWVlZLU1NLUREJyk7XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gYFxcbi0gJHtwYXR0ZXJufSBfKCR7dCgndmF1bHQucGF0dGVybkRhdGVQcmVmaXgnKX0gJHtkYXRlfSlfYDtcblxuICAgICAgICBhd2FpdCB0aGlzLmFwcGVuZFRvU2VjdGlvbihwYXRoLCBjYXRlZ29yeSwgZW50cnkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCBhbGwgZGFpbHkgbm90ZXMgaW4gYSBkYXRlIHJhbmdlXG4gICAgICovXG4gICAgZ2V0RGFpbHlOb3Rlc0luUmFuZ2UoXG4gICAgICAgIHN0YXJ0RGF0ZTogbW9tZW50Lk1vbWVudCxcbiAgICAgICAgZW5kRGF0ZTogbW9tZW50Lk1vbWVudFxuICAgICk6IFRGaWxlW10ge1xuICAgICAgICBjb25zdCBmaWxlczogVEZpbGVbXSA9IFtdO1xuICAgICAgICBjb25zdCBmb2xkZXIgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgodGhpcy5zZXR0aW5ncy5kYWlseUZvbGRlcik7XG5cbiAgICAgICAgaWYgKGZvbGRlciAmJiBmb2xkZXIgaW5zdGFuY2VvZiBURm9sZGVyKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGZvbGRlci5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgIGlmIChjaGlsZCBpbnN0YW5jZW9mIFRGaWxlICYmIGNoaWxkLmV4dGVuc2lvbiA9PT0gJ21kJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkYXRlU3RyID0gY2hpbGQuYmFzZW5hbWU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVEYXRlID0gbW9tZW50KGRhdGVTdHIsICdZWVlZLU1NLUREJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgICAgICAgZmlsZURhdGUuaXNWYWxpZCgpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWxlRGF0ZS5pc1NhbWVPckFmdGVyKHN0YXJ0RGF0ZSwgJ2RheScpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWxlRGF0ZS5pc1NhbWVPckJlZm9yZShlbmREYXRlLCAnZGF5JylcbiAgICAgICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmaWxlcy5wdXNoKGNoaWxkKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmaWxlcy5zb3J0KChhLCBiKSA9PiBhLmJhc2VuYW1lLmxvY2FsZUNvbXBhcmUoYi5iYXNlbmFtZSkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlYWQgY29udGVudCBvZiBhIHNwZWNpZmljIHNlY3Rpb24gZnJvbSBhIGZpbGVcbiAgICAgKi9cbiAgICBhc3luYyByZWFkU2VjdGlvbkNvbnRlbnQoZmlsZVBhdGg6IHN0cmluZywgc2VjdGlvbkhlYWRlcjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZpbGVQYXRoKTtcbiAgICAgICAgICAgIGlmICghZmlsZSB8fCAhKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHJldHVybiBudWxsO1xuXG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY2FjaGVkUmVhZChmaWxlKTtcbiAgICAgICAgICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XG4gICAgICAgICAgICBsZXQgaW5TZWN0aW9uID0gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCBzZWN0aW9uTGluZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgICAgICAgICAgIGlmIChsaW5lLnRyaW0oKS5zdGFydHNXaXRoKGAjIyAke3NlY3Rpb25IZWFkZXJ9YCkpIHtcbiAgICAgICAgICAgICAgICAgICAgaW5TZWN0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChpblNlY3Rpb24gJiYgbGluZS5zdGFydHNXaXRoKCcjIyAnKSkge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGluU2VjdGlvbikge1xuICAgICAgICAgICAgICAgICAgICBzZWN0aW9uTGluZXMucHVzaChsaW5lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHNlY3Rpb25MaW5lcy5qb2luKCdcXG4nKS50cmltKCk7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0IHx8IG51bGw7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgcGF0dGVybnMgZmlsZSBjb250ZW50XG4gICAgICovXG4gICAgYXN5bmMgZ2V0UGF0dGVybnNDb250ZW50KCk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcGF0aCA9IGAke3RoaXMuc2V0dGluZ3MuYXJjaGl2ZUZvbGRlcn0vcGF0dGVybnMubWRgO1xuICAgICAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcbiAgICAgICAgICAgIGlmICghZmlsZSB8fCAhKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHJldHVybiBudWxsO1xuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNhY2hlZFJlYWQoZmlsZSk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbnN1cmUgdGhlIGluc2lnaHRzIGRpcmVjdG9yeSBleGlzdHNcbiAgICAgKi9cbiAgICBhc3luYyBlbnN1cmVJbnNpZ2h0c0ZvbGRlcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgYXdhaXQgdGhpcy5lbnN1cmVGb2xkZXIoYCR7dGhpcy5zZXR0aW5ncy5hcmNoaXZlRm9sZGVyfS9JbnNpZ2h0c2ApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB1bmZpbmlzaGVkIHRhc2tzIGZyb20gcmVjZW50IGRhaWx5IG5vdGVzIChleGNsdWRpbmcgdG9kYXkpXG4gICAgICovXG4gICAgYXN5bmMgZ2V0VW5maW5pc2hlZFRhc2tzKGRheXNCYWNrOiBudW1iZXIgPSAzKTogUHJvbWlzZTx7IHRleHQ6IHN0cmluZzsgZGF0ZTogc3RyaW5nOyBmaWxlUGF0aDogc3RyaW5nIH1bXT4ge1xuICAgICAgICBjb25zdCByZXN1bHQ6IHsgdGV4dDogc3RyaW5nOyBkYXRlOiBzdHJpbmc7IGZpbGVQYXRoOiBzdHJpbmcgfVtdID0gW107XG4gICAgICAgIGNvbnN0IHRvZGF5ID0gdGhpcy5nZXRFZmZlY3RpdmVEYXRlKCk7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gZGF5c0JhY2s7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZCA9IG1vbWVudCh0b2RheSkuc3VidHJhY3QoaSwgJ2RheXMnKTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGVTdHIgPSBkLmZvcm1hdCgnWVlZWS1NTS1ERCcpO1xuICAgICAgICAgICAgY29uc3QgcGF0aCA9IGAke3RoaXMuc2V0dGluZ3MuZGFpbHlGb2xkZXJ9LyR7ZGF0ZVN0cn0ubWRgO1xuICAgICAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcblxuICAgICAgICAgICAgaWYgKGZpbGUgJiYgZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2FjaGUgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmaWxlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjYWNoZT8ubGlzdEl0ZW1zKSBjb250aW51ZTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBPbmx5IHJlYWQgZmlsZSBpZiB0aGVyZSBhcmUgdW5jaGVja2VkIHRhc2tzXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHVuY2hlY2tlZCA9IGNhY2hlLmxpc3RJdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLnRhc2sgPT09ICcgJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh1bmNoZWNrZWQubGVuZ3RoID09PSAwKSBjb250aW51ZTtcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY2FjaGVkUmVhZChmaWxlKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIHVuY2hlY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGluZSA9IGNvbnRlbnQuc3Vic3RyaW5nKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW0ucG9zaXRpb24uc3RhcnQub2Zmc2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW0ucG9zaXRpb24uZW5kLm9mZnNldFxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG0gPSBsaW5lLm1hdGNoKC9eLSBcXFsgXFxdICguKykkLyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKHsgdGV4dDogbVsxXS50cmltKCksIGRhdGU6IGRhdGVTdHIsIGZpbGVQYXRoOiBwYXRoIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIHNraXAgKi8gfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGQgYSB0YXNrIGxpbmUgdG8gdG9kYXkncyBkYWlseSBub3RlIHVuZGVyIOiuoeWIklxuICAgICAqL1xuICAgIGFzeW5jIGFkZFRhc2tUb0RhaWx5KHRhc2tUZXh0OiBzdHJpbmcsIGRhdGU/OiBEYXRlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IGZpbGUgPSBhd2FpdCB0aGlzLmdldE9yQ3JlYXRlRGFpbHlOb3RlKGRhdGUpO1xuICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY2FjaGVkUmVhZChmaWxlKTtcbiAgICAgICAgY29uc3QgdGFza0xpbmUgPSBgLSBbIF0gJHt0YXNrVGV4dH1gO1xuXG4gICAgICAgIC8vIFRyeSB0byBpbnNlcnQgdW5kZXIgIyMgUGxhbiAvICMjIOiuoeWIklxuICAgICAgICBjb25zdCBzZWN0aW9uSGVhZGVyID0gYCMjICR7dCgndmF1bHQuc2VjdGlvblBsYW4nKX1gO1xuICAgICAgICBjb25zdCBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpO1xuICAgICAgICBsZXQgaW5zZXJ0SWR4ID0gLTE7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChsaW5lc1tpXS50cmltKCkuc3RhcnRzV2l0aChzZWN0aW9uSGVhZGVyKSB8fCBsaW5lc1tpXS50cmltKCkuc3RhcnRzV2l0aCgnIyMg6K6h5YiSJykgfHwgbGluZXNbaV0udHJpbSgpLnN0YXJ0c1dpdGgoJyMjIFBsYW4nKSkge1xuICAgICAgICAgICAgICAgIGluc2VydElkeCA9IGkgKyAxO1xuICAgICAgICAgICAgICAgIC8vIFNraXAgcGFzdCBhbnkgc3ViLWhlYWRlcnMsIGJsYW5rIGxpbmVzLCBvciBleGlzdGluZyBjb250ZW50IHVudGlsIG5leHQgIyMgb3IgLS0tXG4gICAgICAgICAgICAgICAgd2hpbGUgKGluc2VydElkeCA8IGxpbmVzLmxlbmd0aCAmJiAhbGluZXNbaW5zZXJ0SWR4XS5zdGFydHNXaXRoKCcjIyAnKSAmJiAhbGluZXNbaW5zZXJ0SWR4XS5zdGFydHNXaXRoKCctLS0nKSkge1xuICAgICAgICAgICAgICAgICAgICBpbnNlcnRJZHgrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaW5zZXJ0SWR4ID49IDApIHtcbiAgICAgICAgICAgIGxpbmVzLnNwbGljZShpbnNlcnRJZHgsIDAsIHRhc2tMaW5lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBhcHBlbmRcbiAgICAgICAgICAgIGxpbmVzLnB1c2godGFza0xpbmUpO1xuICAgICAgICB9XG5cbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIGxpbmVzLmpvaW4oJ1xcbicpKTtcbiAgICB9XG59XG4iXX0=