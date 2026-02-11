/**
 * Task Input Manager - Handles multi-task input UI and submission
 * Extracted from chat-view.ts for maintainability.
 */

import { TFile, setIcon } from 'obsidian';
import type AIFlowManagerPlugin from '../main';
import type { App } from 'obsidian';
import type { SOPContext } from '../types';

/** Minimal interface for the host view that owns this manager. */
export interface TaskInputHost {
    plugin: AIFlowManagerPlugin;
    app: App;
    containerEl: HTMLElement;
    sopContext: SOPContext;
    quickUpdateMode: boolean;
    inputContainer: HTMLElement;
    isTaskInputMode: boolean;
    taskInputContainer: HTMLElement | null;
    taskData: { field: HTMLInputElement; subtaskFields: HTMLInputElement[]; subtaskContainer: HTMLElement | null }[];

    addUserMessage(content: string): void;
    addAIMessage(content: string): void;
    streamAIMessage(content: string): void;
    scrollToBottom(): void;
}

export class TaskInputManager {
    constructor(private host: TaskInputHost) { }

    /**
     * Show the multi-task input UI, replacing the normal textarea
     */
    showTaskInput(prefillTasks?: { text: string; subtasks: string[] }[]): void {
        const h = this.host;
        if (h.isTaskInputMode) return;

        h.isTaskInputMode = true;
        h.taskData = [];

        // Hide normal input
        h.inputContainer.style.display = 'none';

        // Create task input container after messages
        h.taskInputContainer = h.containerEl.children[1].createDiv('ai-flow-task-input-container');

        // Header
        const header = h.taskInputContainer.createDiv('ai-flow-task-input-header');
        header.createSpan({ text: '📋 输入今日任务' });

        // Task rows container
        const rowsContainer = h.taskInputContainer.createDiv('ai-flow-task-rows');

        // Add rows: pre-filled or 3 empty
        if (prefillTasks && prefillTasks.length > 0) {
            for (const task of prefillTasks) {
                this.addTaskRow(rowsContainer, task.text, task.subtasks);
            }
            this.addTaskRow(rowsContainer);
        } else {
            for (let i = 0; i < 3; i++) {
                this.addTaskRow(rowsContainer);
            }
        }

        // Add task button
        const addBtn = h.taskInputContainer.createEl('button', {
            cls: 'ai-flow-task-add-btn',
            text: '＋ 添加任务',
        });
        addBtn.addEventListener('click', () => {
            this.addTaskRow(rowsContainer);
            const lastData = h.taskData[h.taskData.length - 1];
            if (lastData) lastData.field.focus();
        });

        // Submit button
        const submitBtn = h.taskInputContainer.createEl('button', {
            cls: 'ai-flow-task-submit-btn',
            text: '✅ 确认提交',
        });
        submitBtn.addEventListener('click', () => this.submitTasks());

        // Focus first empty input
        const firstEmpty = h.taskData.find((d) => !d.field.value);
        if (firstEmpty) {
            firstEmpty.field.focus();
        } else if (h.taskData[0]) {
            h.taskData[0].field.focus();
        }

        h.scrollToBottom();
    }

    /**
     * Add a single task input row with optional sub-task toggle
     */
    private addTaskRow(container: HTMLElement, prefillValue?: string, prefillSubtasks?: string[]): void {
        const h = this.host;
        const row = container.createDiv('ai-flow-task-row');

        const index = h.taskData.length + 1;
        row.createSpan({ cls: 'ai-flow-task-label', text: `${index}.` });

        const input = row.createEl('input', {
            cls: 'ai-flow-task-field',
            attr: {
                type: 'text',
                placeholder: `任务 ${index}...`,
            },
        });

        if (prefillValue) {
            input.value = prefillValue;
        }

        // Action buttons container
        const actions = row.createDiv('ai-flow-task-actions');

        // Sub-task toggle button
        const subtaskBtn = actions.createEl('button', {
            cls: 'ai-flow-task-subtask-btn',
            attr: { 'aria-label': '子任务' },
        });
        setIcon(subtaskBtn, 'list-tree');

        // Remove button
        const removeBtn = actions.createEl('button', {
            cls: 'ai-flow-task-remove-btn',
            attr: { 'aria-label': '删除' },
        });
        setIcon(removeBtn, 'x');

        // Data for this task
        const taskEntry = {
            field: input,
            subtaskFields: [] as HTMLInputElement[],
            subtaskContainer: null as HTMLElement | null,
        };
        h.taskData.push(taskEntry);

        // Sub-task toggle logic
        subtaskBtn.addEventListener('click', () => {
            if (taskEntry.subtaskContainer) {
                // Collapse sub-tasks
                taskEntry.subtaskContainer.remove();
                taskEntry.subtaskContainer = null;
                taskEntry.subtaskFields = [];
                subtaskBtn.removeClass('is-expanded');
            } else {
                // Expand sub-tasks
                subtaskBtn.addClass('is-expanded');
                const subContainer = container.createDiv('ai-flow-subtask-container');
                taskEntry.subtaskContainer = subContainer;

                // Insert after this row
                row.after(subContainer);

                const subRows = subContainer.createDiv('ai-flow-subtask-rows');
                this.addSubtaskRow(taskEntry, subRows);

                const addSubBtn = subContainer.createEl('button', {
                    cls: 'ai-flow-subtask-add-btn',
                });
                setIcon(addSubBtn, 'plus');
                addSubBtn.createSpan({ text: '添加子任务' });
                addSubBtn.addEventListener('click', () => {
                    this.addSubtaskRow(taskEntry, subRows);
                    const lastSub = taskEntry.subtaskFields[taskEntry.subtaskFields.length - 1];
                    if (lastSub) lastSub.focus();
                });
            }
        });

        // Enter key: add new row if this is the last one
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const idx = h.taskData.indexOf(taskEntry);
                if (idx === h.taskData.length - 1) {
                    this.addTaskRow(container);
                    h.taskData[h.taskData.length - 1].field.focus();
                    this.updateTaskLabels();
                } else {
                    h.taskData[idx + 1].field.focus();
                }
            }
        });

        // Remove button logic
        removeBtn.addEventListener('click', () => {
            if (h.taskData.length <= 1) return;
            const idx = h.taskData.indexOf(taskEntry);
            // Also remove sub-task container
            if (taskEntry.subtaskContainer) {
                taskEntry.subtaskContainer.remove();
            }
            h.taskData.splice(idx, 1);
            row.remove();
            this.updateTaskLabels();
        });

        // Auto-expand sub-tasks if there are pre-filled subtasks
        if (prefillSubtasks && prefillSubtasks.length > 0) {
            subtaskBtn.click();
            // Fill in the first row that was auto-created
            if (taskEntry.subtaskFields[0] && prefillSubtasks[0]) {
                taskEntry.subtaskFields[0].value = prefillSubtasks[0];
            }
            // Add remaining subtask rows
            const subRows = taskEntry.subtaskContainer?.querySelector('.ai-flow-subtask-rows') as HTMLElement;
            if (subRows) {
                for (let i = 1; i < prefillSubtasks.length; i++) {
                    this.addSubtaskRow(taskEntry, subRows, prefillSubtasks[i]);
                }
            }
        }
    }

    /**
     * Add a sub-task row
     */
    private addSubtaskRow(
        taskEntry: { subtaskFields: HTMLInputElement[] },
        container: HTMLElement,
        prefillValue?: string
    ): void {
        const subRow = container.createDiv('ai-flow-subtask-row');
        subRow.createSpan({ cls: 'ai-flow-subtask-bullet', text: '◦' });

        const subInput = subRow.createEl('input', {
            cls: 'ai-flow-subtask-field',
            attr: {
                type: 'text',
                placeholder: '子任务...',
            },
        });

        if (prefillValue) {
            subInput.value = prefillValue;
        }

        const subRemoveBtn = subRow.createEl('button', {
            cls: 'ai-flow-subtask-remove-btn',
            attr: { 'aria-label': '删除子任务' },
        });
        setIcon(subRemoveBtn, 'x');
        subRemoveBtn.addEventListener('click', () => {
            const idx = taskEntry.subtaskFields.indexOf(subInput);
            taskEntry.subtaskFields.splice(idx, 1);
            subRow.remove();
        });

        // Enter key: add new sub-task row
        subInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addSubtaskRow(taskEntry, container);
                const lastSub = taskEntry.subtaskFields[taskEntry.subtaskFields.length - 1];
                if (lastSub) lastSub.focus();
            }
        });

        taskEntry.subtaskFields.push(subInput);
    }

    /**
     * Update task row labels after add/remove
     */
    private updateTaskLabels(): void {
        this.host.taskData.forEach((entry, i) => {
            const row = entry.field.parentElement;
            if (row) {
                const label = row.querySelector('.ai-flow-task-label');
                if (label) label.textContent = `${i + 1}.`;
                entry.field.placeholder = `任务 ${i + 1}...`;
            }
        });
    }

    /**
     * Submit tasks from the multi-task input
     */
    async submitTasks(): Promise<void> {
        const h = this.host;
        // Collect task data with sub-tasks
        const taskItems: { text: string; subtasks: string[] }[] = [];
        for (const entry of h.taskData) {
            const text = entry.field.value.trim();
            if (!text) continue;
            const subtasks = entry.subtaskFields
                .map((f) => f.value.trim())
                .filter((s) => s.length > 0);
            taskItems.push({ text, subtasks });
        }

        if (taskItems.length === 0) return;

        // Format display text
        const displayLines: string[] = [];
        taskItems.forEach((item, i) => {
            displayLines.push(`${i + 1}. ${item.text}`);
            item.subtasks.forEach((sub) => {
                displayLines.push(`   ◦ ${sub}`);
            });
        });
        h.addUserMessage(displayLines.join('\n'));

        // Hide task input
        this.hideTaskInput();

        try {
            // Format for daily note
            const lines: string[] = [];
            for (const item of taskItems) {
                lines.push(`- [ ] ${item.text}`);
                for (const sub of item.subtasks) {
                    lines.push(`  - [ ] ${sub}`);
                }
            }
            const formattedTasks = lines.join('\n');
            const dailyNote = await h.plugin.vaultManager.getOrCreateDailyNote();

            if (h.sopContext.type === 'morning' && !h.quickUpdateMode) {
                const energyLevel = h.sopContext.responses['energy_level'] || '?';
                const content = `**精力状态**: ${energyLevel}/10\n\n${formattedTasks}\n\n---`;
                await h.plugin.vaultManager.replaceSectionContent(
                    dailyNote.path,
                    '晨间计划',
                    content
                );
                h.streamAIMessage(`✅ 完美！今日计划已写入到你的日记中。\n\n祝你度过高效的一天！🌟`);
            } else {
                // Quick update: read existing energy level, then replace entire section
                let energyLine = '';
                try {
                    const noteFile = h.app.vault.getAbstractFileByPath(dailyNote.path);
                    if (noteFile) {
                        const noteContent = await h.app.vault.read(noteFile as any);
                        const match = noteContent.match(/\*\*精力状态\*\*: .+/);
                        if (match) {
                            energyLine = match[0] + '\n\n';
                        }
                    }
                } catch { /* ignore */ }

                const content = energyLine + formattedTasks + '\n\n---';
                await h.plugin.vaultManager.replaceSectionContent(
                    dailyNote.path,
                    '晨间计划',
                    content
                );
                h.streamAIMessage('✅ 任务已更新到今日计划中！');
            }
        } catch (error) {
            h.addAIMessage(`❌ 写入失败：${error}`);
        }

        // Sync to kanban board
        try {
            if (h.plugin.kanbanService) {
                await h.plugin.kanbanService.syncFromDailyNote();
            }
        } catch (e) {
            console.error('[ChatView] Failed to sync kanban:', e);
        }

        // Reset state
        h.quickUpdateMode = false;
        h.sopContext = { type: 'none', currentStep: 0, responses: {} };
    }

    /**
     * Hide the multi-task input and restore normal input
     */
    hideTaskInput(): void {
        const h = this.host;
        if (h.taskInputContainer) {
            h.taskInputContainer.remove();
            h.taskInputContainer = null;
        }
        h.taskData = [];
        h.isTaskInputMode = false;
        h.inputContainer.style.display = '';
    }

    /**
     * Start a quick plan update (skip energy question, go straight to task input)
     */
    async startQuickPlanUpdate(): Promise<void> {
        const h = this.host;
        // Read existing tasks from today's daily note
        const existingTasks = await this.getExistingTasks();
        if (existingTasks.length > 0) {
            h.addAIMessage('你可以修改或添加任务：');
        } else {
            h.addAIMessage('请输入要添加的任务：');
        }
        h.quickUpdateMode = true;
        this.showTaskInput(existingTasks.length > 0 ? existingTasks : undefined);
    }

    /**
     * Read existing tasks from today's daily note
     */
    async getExistingTasks(): Promise<{ text: string; subtasks: string[] }[]> {
        const h = this.host;
        try {
            const dailyNotePath = h.plugin.vaultManager.getDailyNotePath();
            const file = h.app.vault.getAbstractFileByPath(dailyNotePath);
            if (!file) return [];
            const content = await h.app.vault.read(file as any);
            const tasks: { text: string; subtasks: string[] }[] = [];
            const lines = content.split('\n');
            for (const line of lines) {
                // Main task: - [ ] text
                const mainMatch = line.match(/^- \[ \] (.+)$/);
                if (mainMatch) {
                    tasks.push({ text: mainMatch[1].trim(), subtasks: [] });
                    continue;
                }
                // Sub-task: (2+ spaces)- [ ] text
                const subMatch = line.match(/^\s{2,}- \[ \] (.+)$/);
                if (subMatch && tasks.length > 0) {
                    tasks[tasks.length - 1].subtasks.push(subMatch[1].trim());
                }
            }
            return tasks;
        } catch {
            return [];
        }
    }
}
