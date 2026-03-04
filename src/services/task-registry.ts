/**
 * Task Registry Service - Central task read/write with structured metadata
 */

import { App, TFile } from 'obsidian';
import { TideLogSettings } from '../types';

// =============================================================================
// Types
// =============================================================================

export interface SubTaskItem {
    text: string;
    done: boolean;
}

export interface TaskItem {
    text: string;
    subtasks: SubTaskItem[];
    done: boolean;
    source: 'morning' | 'evening' | 'manual';
}

// =============================================================================
// Service
// =============================================================================

export class TaskRegistryService {
    private app: App;
    private settings: TideLogSettings;

    constructor(app: App, settings: TideLogSettings) {
        this.app = app;
        this.settings = settings;
    }

    /**
     * Parse tasks from a markdown file (reads `- [ ]` / `- [x]` items)
     */
    async readTasks(filePath: string, section?: string): Promise<TaskItem[]> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file || !(file instanceof TFile)) return [];

        const content = await this.app.vault.read(file);
        const lines = section
            ? this.extractSectionLines(content, section)
            : content.split('\n');

        return this.parseTaskLines(lines);
    }

    /**
     * Parse task checkbox lines into TaskItem[]
     */
    private parseTaskLines(lines: string[]): TaskItem[] {
        const tasks: TaskItem[] = [];

        for (const line of lines) {
            // Main task: - [ ] text  or  - [x] text
            const mainMatch = line.match(/^- \[([ x])\] (.+)$/);
            if (mainMatch) {
                tasks.push({
                    text: mainMatch[2].trim(),
                    subtasks: [],
                    done: mainMatch[1] === 'x',
                    source: 'manual',
                });
                continue;
            }

            // Sub-task: (2+ spaces)- [ ] text
            const subMatch = line.match(/^\s{2,}- \[([ x])\] (.+)$/);
            if (subMatch && tasks.length > 0) {
                tasks[tasks.length - 1].subtasks.push({
                    text: subMatch[2].trim(),
                    done: subMatch[1] === 'x',
                });
            }
        }

        return tasks;
    }

    /**
     * Write tasks as checkbox markdown to a section of a file
     */
    formatTasksAsMarkdown(tasks: TaskItem[]): string {
        const lines: string[] = [];
        for (const task of tasks) {
            const checkbox = task.done ? '[x]' : '[ ]';
            lines.push(`- ${checkbox} ${task.text}`);
            for (const sub of task.subtasks) {
                const subCheckbox = sub.done ? '[x]' : '[ ]';
                lines.push(`  - ${subCheckbox} ${sub.text}`);
            }
        }
        return lines.join('\n');
    }

    /**
     * Update a specific task's done status in a file
     */
    async updateTaskStatus(
        filePath: string,
        taskText: string,
        done: boolean
    ): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file || !(file instanceof TFile)) return false;

        const content = await this.app.vault.read(file);
        const fromCheckbox = done ? '[ ]' : '[x]';
        const toCheckbox = done ? '[x]' : '[ ]';

        // Find and replace exact task line
        const escapedText = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(
            `^(\\s*- )\\[${fromCheckbox === '[ ]' ? ' ' : 'x'}\\]( ${escapedText})$`,
            'm'
        );

        const match = content.match(pattern);
        if (!match) return false;

        const updated = content.replace(
            pattern,
            `$1${toCheckbox}$2`
        );

        await this.app.vault.modify(file, updated);
        return true;
    }

    /**
     * Get all tasks from a daily note (from the 晨间计划 section)
     */
    async getTasksForDate(date?: Date): Promise<TaskItem[]> {
        const { moment } = window;
        const effectiveDate = date ? moment(date) : moment();
        const boundaryHour = this.settings.dayBoundaryHour;

        if (effectiveDate.hour() < boundaryHour) {
            effectiveDate.subtract(1, 'day');
        }

        const filename = effectiveDate.format('YYYY-MM-DD');
        const path = `${this.settings.dailyFolder}/${filename}.md`;

        return this.readTasks(path, '晨间计划');
    }

    /**
     * Extract lines belonging to a specific markdown section
     */
    private extractSectionLines(content: string, sectionHeader: string): string[] {
        const lines = content.split('\n');
        const result: string[] = [];
        let inSection = false;

        for (const line of lines) {
            if (line.startsWith('## ')) {
                if (inSection) break; // Hit next section
                if (line.includes(sectionHeader)) {
                    inSection = true;
                    continue;
                }
            }
            if (inSection) {
                result.push(line);
            }
        }

        return result;
    }
}
