/**
 * Kanban Service - Generates and syncs obsidian-kanban compatible board files
 *
 * Board format:
 *   ---
 *   kanban-plugin: basic
 *   ---
 *   ## Column Name
 *   - [ ] Task
 *   ...
 *   %% kanban:settings
 *   {"kanban-plugin":"basic"}
 *   %%
 */

import { App, TFile, moment } from 'obsidian';
import { AIFlowSettings } from '../types';
import { TaskRegistryService, TaskItem } from './task-registry';

const DAY_COLUMNS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS: Record<string, string> = {
    Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四',
    Fri: '周五', Sat: '周六', Sun: '周日',
};

export class KanbanService {
    private app: App;
    private settings: AIFlowSettings;
    private taskRegistry: TaskRegistryService;

    constructor(app: App, settings: AIFlowSettings, taskRegistry: TaskRegistryService) {
        this.app = app;
        this.settings = settings;
        this.taskRegistry = taskRegistry;
    }

    /**
     * Get the kanban board file path for a given week
     * (Shares the same file as the weekly plan — no "-Board" suffix)
     */
    getWeeklyBoardPath(date?: Date): string {
        const effectiveDate = this.getEffectiveDate(date);
        const year = effectiveDate.format('YYYY');
        const week = effectiveDate.format('ww');
        return `${this.settings.planFolder}/Weekly/${year}-W${week}.md`;
    }

    /**
     * Ensure the weekly kanban board exists; create if missing.
     * If the file already exists (e.g. created by vault-manager) but lacks
     * kanban day-columns, append them so both systems can share one file.
     */
    async ensureWeeklyBoard(date?: Date): Promise<TFile> {
        const path = this.getWeeklyBoardPath(date);
        let file = this.app.vault.getAbstractFileByPath(path);

        if (!file) {
            const content = this.generateBoardTemplate(date);
            // Ensure the folder exists
            const folder = path.substring(0, path.lastIndexOf('/'));
            const folderExists = this.app.vault.getAbstractFileByPath(folder);
            if (!folderExists) {
                await this.app.vault.createFolder(folder);
            }
            file = await this.app.vault.create(path, content);
        } else if (file instanceof TFile) {
            // File exists — check if kanban columns are present
            const content = await this.app.vault.read(file);
            if (!content.includes('## Backlog') && !content.includes('## ✅ Completed')) {
                // Append kanban columns to the existing weekly plan
                const kanbanSections = this.generateKanbanColumns(date);
                await this.app.vault.modify(file, content.trimEnd() + '\n\n' + kanbanSections);
            }
        }

        return file as TFile;
    }

    /**
     * Generate a blank kanban board template with day columns
     */
    private generateBoardTemplate(date?: Date): string {
        const effectiveDate = this.getEffectiveDate(date);
        const weekRef = `${effectiveDate.format('YYYY')}-W${effectiveDate.format('ww')}`;

        const lines: string[] = [
            '---',
            'kanban-plugin: basic',
            '---',
            '',
            `## Backlog (${weekRef} 重点)`,
            '',
        ];

        for (const day of DAY_COLUMNS) {
            lines.push(`## ${DAY_LABELS[day]} (${day})`);
            lines.push('');
        }

        lines.push('## ✅ Completed');
        lines.push('');
        lines.push('');
        lines.push('%% kanban:settings');
        lines.push('{"kanban-plugin":"basic"}');
        lines.push('%%');

        return lines.join('\n');
    }

    /**
     * Generate only the kanban day-column sections (for appending to existing files)
     */
    private generateKanbanColumns(date?: Date): string {
        const effectiveDate = this.getEffectiveDate(date);
        const weekRef = `${effectiveDate.format('YYYY')}-W${effectiveDate.format('ww')}`;

        const lines: string[] = [
            `## Backlog (${weekRef} 重点)`,
            '',
        ];

        for (const day of DAY_COLUMNS) {
            lines.push(`## ${DAY_LABELS[day]} (${day})`);
            lines.push('');
        }

        lines.push('## ✅ Completed');
        lines.push('');

        return lines.join('\n');
    }

    /**
     * Add a task to a specific day column on the board
     */
    async addTaskToDay(
        taskText: string,
        dayOfWeek: string,
        date?: Date
    ): Promise<void> {
        const boardFile = await this.ensureWeeklyBoard(date);
        const content = await this.app.vault.read(boardFile);
        const dayLabel = DAY_LABELS[dayOfWeek] || dayOfWeek;

        // Find the day column header
        const columnHeader = `## ${dayLabel} (${dayOfWeek})`;
        const headerIdx = content.indexOf(columnHeader);
        if (headerIdx === -1) return;

        // Find insertion point (after the header line)
        const afterHeader = content.indexOf('\n', headerIdx);
        if (afterHeader === -1) return;

        // Insert the task after the header
        const taskLine = `- [ ] ${taskText}\n`;
        const newContent = content.substring(0, afterHeader + 1) +
            taskLine +
            content.substring(afterHeader + 1);

        await this.app.vault.modify(boardFile, newContent);
    }

    /**
     * Move a task to the Completed column
     */
    async moveTaskToCompleted(taskText: string, date?: Date): Promise<void> {
        const boardFile = await this.ensureWeeklyBoard(date);
        const content = await this.app.vault.read(boardFile);

        // Find and remove the task from its current column
        const escapedText = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const taskPattern = new RegExp(`^- \\[ \\] ${escapedText}\\n?`, 'm');
        const match = content.match(taskPattern);
        if (!match) return;

        let newContent = content.replace(taskPattern, '');

        // Add to Completed column
        const completedHeader = '## ✅ Completed';
        const completedIdx = newContent.indexOf(completedHeader);
        if (completedIdx === -1) return;

        const afterCompleted = newContent.indexOf('\n', completedIdx);
        if (afterCompleted === -1) return;

        const completedLine = `- [x] ${taskText}\n`;
        newContent = newContent.substring(0, afterCompleted + 1) +
            completedLine +
            newContent.substring(afterCompleted + 1);

        await this.app.vault.modify(boardFile, newContent);
    }

    /**
     * Sync tasks from a daily note to the kanban board's day column
     */
    async syncFromDailyNote(date?: Date): Promise<void> {
        const effectiveDate = this.getEffectiveDate(date);
        const dayOfWeek = effectiveDate.format('ddd');

        // Read tasks from daily note
        const tasks = await this.taskRegistry.getTasksForDate(
            date || effectiveDate.toDate()
        );

        if (tasks.length === 0) return;

        // Ensure board exists
        const boardFile = await this.ensureWeeklyBoard(date);
        const content = await this.app.vault.read(boardFile);
        const dayLabel = DAY_LABELS[dayOfWeek] || dayOfWeek;
        const columnHeader = `## ${dayLabel} (${dayOfWeek})`;

        // Find the day column
        const headerIdx = content.indexOf(columnHeader);
        if (headerIdx === -1) return;

        // Find what's already in that column
        const afterHeader = content.indexOf('\n', headerIdx);
        if (afterHeader === -1) return;

        // Find the next column header
        const nextHeaderIdx = content.indexOf('\n## ', afterHeader);
        const columnEnd = nextHeaderIdx === -1 ? content.length : nextHeaderIdx;
        const existingColumnContent = content.substring(afterHeader + 1, columnEnd);

        // Parse existing board tasks for this column
        const existingTexts = new Set<string>();
        for (const line of existingColumnContent.split('\n')) {
            const m = line.match(/^- \[[ x]\] (.+)$/);
            if (m) existingTexts.add(m[1].trim());
        }

        // Build new column content: keep existing, add new from daily note
        const newLines: string[] = [];
        const completedTexts: string[] = [];

        // Add existing lines (preserve order)
        for (const line of existingColumnContent.split('\n')) {
            if (line.trim()) newLines.push(line);
        }

        for (const task of tasks) {
            if (!existingTexts.has(task.text)) {
                const checkbox = task.done ? '[x]' : '[ ]';
                newLines.push(`- ${checkbox} ${task.text}`);
            }

            // If task is done and exists as unchecked, mark it completed on board
            if (task.done && existingTexts.has(task.text)) {
                completedTexts.push(task.text);
            }
        }

        // Replace the column content
        const beforeColumn = content.substring(0, afterHeader + 1);
        const afterColumn = content.substring(columnEnd);
        let newContent = beforeColumn +
            newLines.join('\n') + '\n' +
            afterColumn;

        // Move completed tasks
        for (const completedText of completedTexts) {
            // Remove unchecked version
            newContent = newContent.replace(
                new RegExp(`^- \\[ \\] ${completedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'),
                `- [x] ${completedText}`
            );
        }

        await this.app.vault.modify(boardFile, newContent);
    }

    /**
     * Read tasks from the kanban board for a specific day
     */
    async readBoardTasksForDay(dayOfWeek: string, date?: Date): Promise<TaskItem[]> {
        const path = this.getWeeklyBoardPath(date);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) return [];

        const content = await this.app.vault.read(file);
        const dayLabel = DAY_LABELS[dayOfWeek] || dayOfWeek;
        const columnHeader = `## ${dayLabel} (${dayOfWeek})`;

        const headerIdx = content.indexOf(columnHeader);
        if (headerIdx === -1) return [];

        const afterHeader = content.indexOf('\n', headerIdx);
        if (afterHeader === -1) return [];

        const nextHeaderIdx = content.indexOf('\n## ', afterHeader);
        const columnEnd = nextHeaderIdx === -1 ? content.length : nextHeaderIdx;
        const columnContent = content.substring(afterHeader + 1, columnEnd);

        const tasks: TaskItem[] = [];
        for (const line of columnContent.split('\n')) {
            const m = line.match(/^- \[([ x])\] (.+)$/);
            if (m) {
                tasks.push({
                    text: m[2].trim(),
                    subtasks: [],
                    done: m[1] === 'x',
                    source: 'manual',
                });
            }
        }

        return tasks;
    }

    /**
     * Get effective date (inherits day boundary logic)
     */
    private getEffectiveDate(date?: Date): moment.Moment {
        const now = date ? moment(date) : moment();
        if (now.hour() < this.settings.dayBoundaryHour) {
            return now.subtract(1, 'day');
        }
        return now;
    }
}
