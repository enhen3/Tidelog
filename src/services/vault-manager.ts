/**
 * Vault Manager - Handles file and folder operations
 */

import { App, CachedMetadata, TFile, TFolder, moment, Plugin } from 'obsidian';
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
        // When an explicit date is provided (e.g. from calendar selector), use it directly
        // without day boundary offset — the boundary is only relevant for "today"
        const d = date ? moment(date) : this.getEffectiveDate();
        const filename = d.format('YYYY-MM-DD');
        return `${this.settings.dailyFolder}/${filename}.md`;
    }

    /**
     * Get or create today's daily note.
     * Respects templates from Daily Notes core plugin, Periodic Notes, or Templater.
     * Falls back to TideLog's built-in template only when no user template is configured.
     */
    async getOrCreateDailyNote(date?: Date): Promise<TFile> {
        const path = this.getDailyNotePath(date);
        let file = this.app.vault.getAbstractFileByPath(path);

        if (!file) {
            const d = date ? moment(date) : this.getEffectiveDate();

            // Try to use the user's configured daily note template
            const userTemplate = await this.getUserDailyNoteTemplate(d);

            if (userTemplate !== null) {
                // User has a template — use it, then ensure TideLog sections exist
                file = await this.app.vault.create(path, userTemplate);

                if (file instanceof TFile) {
                    // Attempt Templater processing if available
                    await this.triggerTemplaterIfAvailable(file);

                    // Ensure TideLog YAML fields & sections exist
                    await this.ensureTideLogFields(file, d);
                }
            } else {
                // No user template — use TideLog's built-in default
                const content = this.createDefaultDailyNoteTemplate(d);
                file = await this.app.vault.create(path, content);
            }
        }

        if (!(file instanceof TFile)) {
            throw new Error(`Expected TFile at path: ${path}`);
        }
        return file;
    }

    /**
     * Read the user's daily note template from known sources.
     * Checks: Daily Notes core plugin → Periodic Notes → returns null if none found.
     */
    private async getUserDailyNoteTemplate(date: moment.Moment): Promise<string | null> {
        let templatePath: string | null = null;

        // 1) Daily Notes core plugin
        try {
            const internalPlugins = (this.app as unknown as Record<string, unknown>).internalPlugins as
                { getPluginById(id: string): { enabled: boolean; instance?: { options?: { template?: string } } } | null } | undefined;
            if (internalPlugins) {
                const dailyNotes = internalPlugins.getPluginById('daily-notes');
                if (dailyNotes?.enabled && dailyNotes.instance?.options?.template) {
                    templatePath = dailyNotes.instance.options.template;
                }
            }
        } catch { /* ignore */ }

        // 2) Periodic Notes community plugin (overrides core if configured)
        if (!templatePath) {
            try {
                const plugins = (this.app as unknown as Record<string, unknown>).plugins as
                    { getPlugin(id: string): Plugin & { settings?: { daily?: { template?: string } } } | null } | undefined;
                if (plugins) {
                    const periodicNotes = plugins.getPlugin('periodic-notes');
                    if (periodicNotes) {
                        const pnSettings = (periodicNotes as Plugin & { settings?: { daily?: { template?: string } } }).settings;
                        if (pnSettings?.daily?.template) {
                            templatePath = pnSettings.daily.template;
                        }
                    }
                }
            } catch { /* ignore */ }
        }

        if (!templatePath) return null;

        // Normalize path: add .md if missing
        if (!templatePath.endsWith('.md')) {
            templatePath += '.md';
        }

        // Read the template file
        const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
        if (!templateFile || !(templateFile instanceof TFile)) return null;

        let content = await this.app.vault.cachedRead(templateFile);

        // Process basic Obsidian-style variables: {{date}}, {{title}}, {{time}}
        const dateStr = date.format('YYYY-MM-DD');
        content = content
            .replace(/\{\{\s*date\s*\}\}/gi, dateStr)
            .replace(/\{\{\s*title\s*\}\}/gi, dateStr)
            .replace(/\{\{\s*time\s*\}\}/gi, date.format('HH:mm'));

        // Process {{date:FORMAT}} patterns
        content = content.replace(/\{\{\s*date:([^}]+)\}\}/gi, (_match, fmt: string) => {
            return date.format(fmt.trim());
        });

        return content;
    }

    /**
     * If the Templater plugin is available, trigger its processing on the file.
     * Templater syntax like <% tp.date.now() %> requires Templater's own engine.
     */
    private async triggerTemplaterIfAvailable(file: TFile): Promise<void> {
        try {
            const plugins = (this.app as unknown as Record<string, unknown>).plugins as
                { getPlugin(id: string): Plugin | null } | undefined;
            if (!plugins) return;

            const templater = plugins.getPlugin('templater-obsidian');
            if (!templater) return;

            // Templater exposes overwite_file_commands or a templater object
            const tp = templater as Plugin & { templater?: { overwrite_file_commands?: (file: TFile) => Promise<void> } };
            if (tp.templater?.overwrite_file_commands) {
                await tp.templater.overwrite_file_commands(file);
            }
        } catch (e) {
            console.warn('[TideLog] Templater processing skipped:', e);
        }
    }

    /**
     * Ensure TideLog's required YAML frontmatter fields and sections exist
     * in a daily note that was created from the user's own template.
     * Does NOT overwrite existing content — only adds what's missing.
     */
    private async ensureTideLogFields(file: TFile, date: moment.Moment): Promise<void> {
        // 1) Ensure required YAML frontmatter fields
        const weekRef = this.getWeekRef(date);
        const monthRef = date.format('YYYY-MM');

        await this.app.fileManager.processFrontMatter(file, (fm) => {
            if (fm.type === undefined) fm.type = 'daily';
            if (fm.date === undefined) fm.date = date.format('YYYY-MM-DD');
            if (fm.emotion_score === undefined) fm.emotion_score = null;
            if (fm.status === undefined) fm.status = 'todo';
            if (fm.tasks_total === undefined) fm.tasks_total = 0;
            if (fm.tasks_done === undefined) fm.tasks_done = 0;
            if (fm.weekly_ref === undefined) fm.weekly_ref = `[[${weekRef}]]`;
            if (fm.monthly_ref === undefined) fm.monthly_ref = `[[${monthRef}]]`;
        });

        // 2) Ensure Plan and Review sections exist
        const content = await this.app.vault.read(file);
        const planHeader = `## ${t('vault.sectionPlan')}`;
        const reviewHeader = `## ${t('vault.sectionReview')}`;

        // Check both localized and hardcoded variants
        const hasPlan = content.includes('## 计划') || content.includes('## Plan') || content.includes(planHeader);
        const hasReview = content.includes('## 复盘') || content.includes('## Review') || content.includes(reviewHeader);

        if (!hasPlan || !hasReview) {
            let appendContent = '';
            if (!hasPlan) {
                appendContent += `\n${planHeader}\n\n${t('vault.planComment')}\n`;
            }
            if (!hasReview) {
                appendContent += `\n${reviewHeader}\n\n${t('vault.reviewComment')}\n`;
            }
            await this.app.vault.modify(file, content + appendContent);
        }
    }

    /**
     * TideLog's built-in default daily note template.
     * Used only when no user template is configured.
     */
    private createDefaultDailyNoteTemplate(date: moment.Moment): string {
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

    // ──────────────────────────────────────────────────────
    // Quick Capture (灵感收集)
    // ──────────────────────────────────────────────────────

    /**
     * Get the quick capture file path
     */
    getQuickCapturePath(): string {
        return `${this.settings.archiveFolder}/quick_capture.md`;
    }

    /**
     * Read all quick capture items as an array of strings
     */
    async getQuickCaptureItems(): Promise<string[]> {
        const path = this.getQuickCapturePath();
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) return [];

        try {
            const content = await this.app.vault.cachedRead(file);
            return content
                .split('\n')
                .filter(line => line.startsWith('- '))
                .map(line => line.substring(2).trim())
                .filter(text => text.length > 0);
        } catch {
            return [];
        }
    }

    /**
     * Add a quick capture item
     */
    async addQuickCaptureItem(text: string): Promise<void> {
        const path = this.getQuickCapturePath();
        const line = `- ${text}`;
        let file = this.app.vault.getAbstractFileByPath(path);

        if (!file) {
            // Ensure folder exists
            await this.ensureFolder(this.settings.archiveFolder);
            await this.app.vault.create(path, line + '\n');
        } else if (file instanceof TFile) {
            const content = await this.app.vault.read(file);
            // Prepend new item so latest appears first
            await this.app.vault.modify(file, line + '\n' + content);
        }
    }

    /**
     * Remove a quick capture item by its text
     */
    async removeQuickCaptureItem(text: string): Promise<void> {
        const path = this.getQuickCapturePath();
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) return;

        const content = await this.app.vault.read(file);
        const lines = content.split('\n');
        const target = `- ${text}`;
        const idx = lines.findIndex(l => l.trim() === target.trim());
        if (idx >= 0) {
            lines.splice(idx, 1);
            await this.app.vault.modify(file, lines.join('\n'));
        }
    }

    /**
     * Edit a quick capture item
     */
    async editQuickCaptureItem(oldText: string, newText: string): Promise<void> {
        const path = this.getQuickCapturePath();
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) return;

        const content = await this.app.vault.read(file);
        const oldLine = `- ${oldText}`;
        const newLine = `- ${newText}`;
        const updated = content.replace(oldLine, newLine);
        if (updated !== content) {
            await this.app.vault.modify(file, updated);
        }
    }
}
