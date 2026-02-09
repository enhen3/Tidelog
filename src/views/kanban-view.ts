/**
 * Kanban View - Built-in kanban board view (no external plugin dependency)
 * Renders weekly task board with draggable columns and task cards.
 */

import {
    ItemView,
    WorkspaceLeaf,
    TFile,
    moment,
} from 'obsidian';

import AIFlowManagerPlugin from '../main';

export const KANBAN_VIEW_TYPE = 'ai-flow-kanban-view';

const DAY_COLUMNS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS: Record<string, string> = {
    Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四',
    Fri: '周五', Sat: '周六', Sun: '周日',
};

interface KanbanTask {
    text: string;
    done: boolean;
}

interface KanbanColumn {
    id: string;
    label: string;
    tasks: KanbanTask[];
}

export class KanbanView extends ItemView {
    private plugin: AIFlowManagerPlugin;
    private containerEl_: HTMLElement | null = null;
    private currentWeekOffset = 0;

    constructor(leaf: WorkspaceLeaf, plugin: AIFlowManagerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return KANBAN_VIEW_TYPE; }
    getDisplayText(): string { return '看板'; }
    getIcon(): string { return 'kanban'; }

    async onOpen(): Promise<void> {
        const container = this.contentEl;
        container.empty();
        container.addClass('af-kanban-container');

        // Design tokens
        container.style.setProperty('--af-radius-sm', '8px');
        container.style.setProperty('--af-radius-md', '12px');
        container.style.setProperty('--af-ease', 'cubic-bezier(0.25, 0.46, 0.45, 0.94)');

        this.containerEl_ = container;
        await this.render();
    }

    async onClose(): Promise<void> {
        this.containerEl_ = null;
    }

    // =========================================================================
    // Render
    // =========================================================================

    private async render(): Promise<void> {
        if (!this.containerEl_) return;
        this.containerEl_.empty();

        const targetDate = moment().add(this.currentWeekOffset, 'weeks');
        const weekStart = moment(targetDate).startOf('isoWeek');
        const weekEnd = moment(targetDate).endOf('isoWeek');
        const weekLabel = `${weekStart.format('MM/DD')} – ${weekEnd.format('MM/DD')}`;
        const weekRef = `${targetDate.format('YYYY')}-W${targetDate.format('ww')}`;

        // Header
        const header = this.containerEl_.createDiv('af-kanban-header');

        const prevBtn = header.createEl('button', { cls: 'af-kanban-nav-btn', text: '‹' });
        prevBtn.addEventListener('click', () => { this.currentWeekOffset--; this.render(); });

        const title = header.createEl('span', { cls: 'af-kanban-title', text: `${weekRef}  ${weekLabel}` });

        const nextBtn = header.createEl('button', { cls: 'af-kanban-nav-btn', text: '›' });
        nextBtn.addEventListener('click', () => { this.currentWeekOffset++; this.render(); });

        if (this.currentWeekOffset !== 0) {
            const todayBtn = header.createEl('button', { cls: 'af-kanban-today-btn', text: '今天' });
            todayBtn.addEventListener('click', () => { this.currentWeekOffset = 0; this.render(); });
        }

        // Parse board data
        const columns = await this.parseBoard(targetDate.toDate());

        // Board grid
        const grid = this.containerEl_.createDiv('af-kanban-grid');

        for (const col of columns) {
            const colEl = grid.createDiv('af-kanban-column');

            const colHeader = colEl.createDiv('af-kanban-col-header');
            const headerTitle = colHeader.createEl('span', { text: col.label });
            const badge = colHeader.createEl('span', {
                cls: 'af-kanban-badge',
                text: `${col.tasks.length}`,
            });

            const taskList = colEl.createDiv('af-kanban-task-list');

            if (col.tasks.length === 0) {
                taskList.createDiv({ cls: 'af-kanban-empty', text: '暂无任务' });
            }

            for (const task of col.tasks) {
                const card = taskList.createDiv({
                    cls: `af-kanban-card ${task.done ? 'af-kanban-card-done' : ''}`,
                });

                const checkbox = card.createEl('input', { type: 'checkbox' });
                checkbox.checked = task.done;
                checkbox.addEventListener('change', async () => {
                    await this.toggleTask(col.id, task.text, !task.done, targetDate.toDate());
                    await this.render();
                });

                const label = card.createEl('span', {
                    cls: 'af-kanban-card-text',
                    text: task.text,
                });
                if (task.done) {
                    label.style.textDecoration = 'line-through';
                    label.style.opacity = '0.5';
                }
            }
        }
    }

    // =========================================================================
    // Data layer — reads/writes the kanban board .md file directly
    // =========================================================================

    private getBoardPath(date?: Date): string {
        return this.plugin.kanbanService.getWeeklyBoardPath(date);
    }

    private async parseBoard(date?: Date): Promise<KanbanColumn[]> {
        const path = this.getBoardPath(date);
        const file = this.app.vault.getAbstractFileByPath(path);

        const columns: KanbanColumn[] = [
            { id: 'backlog', label: '📋 Backlog', tasks: [] },
        ];
        for (const day of DAY_COLUMNS) {
            columns.push({ id: day, label: `${DAY_LABELS[day]} (${day})`, tasks: [] });
        }
        columns.push({ id: 'completed', label: '✅ Completed', tasks: [] });

        if (!file || !(file instanceof TFile)) return columns;

        const content = await this.app.vault.read(file);
        const lines = content.split('\n');

        let currentCol: KanbanColumn | null = null;

        for (const line of lines) {
            // Match column headers
            if (line.startsWith('## ')) {
                const headerText = line.substring(3).trim();
                if (headerText.includes('Backlog')) {
                    currentCol = columns[0];
                } else if (headerText.includes('Completed') || headerText.includes('✅')) {
                    currentCol = columns[columns.length - 1];
                } else {
                    // Try to match day columns
                    for (const day of DAY_COLUMNS) {
                        if (headerText.includes(day) || headerText.includes(DAY_LABELS[day])) {
                            currentCol = columns.find(c => c.id === day) || null;
                            break;
                        }
                    }
                }
                continue;
            }

            // Match tasks
            const taskMatch = line.match(/^- \[([ x])\] (.+)$/);
            if (taskMatch && currentCol) {
                currentCol.tasks.push({
                    done: taskMatch[1] === 'x',
                    text: taskMatch[2].trim(),
                });
            }
        }

        return columns;
    }

    private async toggleTask(
        columnId: string,
        taskText: string,
        newDone: boolean,
        date?: Date,
    ): Promise<void> {
        const path = this.getBoardPath(date);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) return;

        let content = await this.app.vault.read(file);

        const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const oldCheck = newDone ? '[ ]' : '[x]';
        const newCheck = newDone ? '[x]' : '[ ]';
        const pattern = new RegExp(`^- \\[${oldCheck === '[ ]' ? ' ' : 'x'}\\] ${escaped}$`, 'm');

        content = content.replace(pattern, `- ${newCheck} ${taskText}`);
        await this.app.vault.modify(file, content);
    }
}
