/**
 * Task Input Manager - Handles multi-task input UI and submission
 * Extracted from chat-view.ts for maintainability.
 */
import { TFile, setIcon } from 'obsidian';
import { t } from '../i18n';
export class TaskInputManager {
    constructor(host) {
        this.host = host;
    }
    /**
     * Show the multi-task input UI, replacing the normal textarea
     */
    showTaskInput(prefillTasks) {
        const h = this.host;
        if (h.isTaskInputMode)
            return;
        h.isTaskInputMode = true;
        h.taskData = [];
        // Hide normal input
        h.inputContainer.addClass('tl-hidden');
        // Create task input container after messages
        h.taskInputContainer = h.containerEl.children[1].createDiv('tl-task-input-container');
        // Header
        const header = h.taskInputContainer.createDiv('tl-task-input-header');
        header.createSpan({ text: t('task.header') });
        // Task rows container
        const rowsContainer = h.taskInputContainer.createDiv('tl-task-rows');
        // Add rows: pre-filled or 3 empty
        if (prefillTasks && prefillTasks.length > 0) {
            for (const task of prefillTasks) {
                this.addTaskRow(rowsContainer, task.text, task.subtasks);
            }
            this.addTaskRow(rowsContainer);
        }
        else {
            for (let i = 0; i < 3; i++) {
                this.addTaskRow(rowsContainer);
            }
        }
        // Add task button
        const addBtn = h.taskInputContainer.createEl('button', {
            cls: 'tl-task-add-btn',
            text: t('task.addTask'),
        });
        addBtn.addEventListener('click', () => {
            this.addTaskRow(rowsContainer);
            const lastData = h.taskData[h.taskData.length - 1];
            if (lastData)
                lastData.field.focus();
        });
        // Submit button
        const submitBtn = h.taskInputContainer.createEl('button', {
            cls: 'tl-task-submit-btn',
            text: t('task.submit'),
        });
        submitBtn.addEventListener('click', () => void this.submitTasks());
        // Focus first empty input
        const firstEmpty = h.taskData.find((d) => !d.field.value);
        if (firstEmpty) {
            firstEmpty.field.focus();
        }
        else if (h.taskData[0]) {
            h.taskData[0].field.focus();
        }
        h.scrollToBottom();
    }
    /**
     * Add a single task input row with optional sub-task toggle
     */
    addTaskRow(container, prefillValue, prefillSubtasks) {
        const h = this.host;
        const row = container.createDiv('tl-task-row');
        const index = h.taskData.length + 1;
        row.createSpan({ cls: 'tl-task-label', text: `${index}.` });
        const input = row.createEl('input', {
            cls: 'tl-task-field',
            attr: {
                type: 'text',
                placeholder: t('task.placeholder', String(index)),
            },
        });
        if (prefillValue) {
            input.value = prefillValue;
        }
        // Action buttons container
        const actions = row.createDiv('tl-task-actions');
        // Sub-task toggle button
        const subtaskBtn = actions.createEl('button', {
            cls: 'tl-task-subtask-btn',
            attr: { 'aria-label': t('task.subtask') },
        });
        setIcon(subtaskBtn, 'list-tree');
        // Remove button
        const removeBtn = actions.createEl('button', {
            cls: 'tl-task-remove-btn',
            attr: { 'aria-label': t('task.delete') },
        });
        setIcon(removeBtn, 'x');
        // Data for this task
        const taskEntry = {
            field: input,
            subtaskFields: [],
            subtaskContainer: null,
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
            }
            else {
                // Expand sub-tasks
                subtaskBtn.addClass('is-expanded');
                const subContainer = container.createDiv('tl-subtask-container');
                taskEntry.subtaskContainer = subContainer;
                // Insert after this row
                row.after(subContainer);
                const subRows = subContainer.createDiv('tl-subtask-rows');
                this.addSubtaskRow(taskEntry, subRows);
                const addSubBtn = subContainer.createEl('button', {
                    cls: 'tl-subtask-add-btn',
                });
                setIcon(addSubBtn, 'plus');
                addSubBtn.createSpan({ text: t('task.addSubtask') });
                addSubBtn.addEventListener('click', () => {
                    this.addSubtaskRow(taskEntry, subRows);
                    const lastSub = taskEntry.subtaskFields[taskEntry.subtaskFields.length - 1];
                    if (lastSub)
                        lastSub.focus();
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
                }
                else {
                    h.taskData[idx + 1].field.focus();
                }
            }
        });
        // Remove button logic
        removeBtn.addEventListener('click', () => {
            if (h.taskData.length <= 1)
                return;
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
            const subRows = taskEntry.subtaskContainer?.querySelector('.tl-subtask-rows');
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
    addSubtaskRow(taskEntry, container, prefillValue) {
        const subRow = container.createDiv('tl-subtask-row');
        subRow.createSpan({ cls: 'tl-subtask-bullet', text: '◦' });
        const subInput = subRow.createEl('input', {
            cls: 'tl-subtask-field',
            attr: {
                type: 'text',
                placeholder: t('task.subtaskPlaceholder'),
            },
        });
        if (prefillValue) {
            subInput.value = prefillValue;
        }
        const subRemoveBtn = subRow.createEl('button', {
            cls: 'tl-subtask-remove-btn',
            attr: { 'aria-label': t('task.deleteSubtask') },
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
                if (lastSub)
                    lastSub.focus();
            }
        });
        taskEntry.subtaskFields.push(subInput);
    }
    /**
     * Update task row labels after add/remove
     */
    updateTaskLabels() {
        this.host.taskData.forEach((entry, i) => {
            const row = entry.field.parentElement;
            if (row) {
                const label = row.querySelector('.tl-task-label');
                if (label)
                    label.textContent = `${i + 1}.`;
                entry.field.placeholder = t('task.placeholder', String(i + 1));
            }
        });
    }
    /**
     * Submit tasks from the multi-task input
     */
    async submitTasks() {
        const h = this.host;
        // Collect task data with sub-tasks
        const taskItems = [];
        for (const entry of h.taskData) {
            const text = entry.field.value.trim();
            if (!text)
                continue;
            const subtasks = entry.subtaskFields
                .map((f) => f.value.trim())
                .filter((s) => s.length > 0);
            taskItems.push({ text, subtasks });
        }
        if (taskItems.length === 0)
            return;
        // Format display text
        const displayLines = [];
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
            const lines = [];
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
                const content = `**${t('task.energyLabel')}**: ${energyLevel}/10\n\n${formattedTasks}\n\n---`;
                await h.plugin.vaultManager.replaceSectionContent(dailyNote.path, t('vault.sectionPlan'), content);
                h.streamAIMessage(t('task.planSaved'));
            }
            else {
                // Quick update: read existing energy level, then replace entire section
                let energyLine = '';
                try {
                    const noteFile = h.app.vault.getAbstractFileByPath(dailyNote.path);
                    if (noteFile instanceof TFile) {
                        const noteContent = await h.app.vault.read(noteFile);
                        const match = noteContent.match(/\*\*(?:精力状态|Energy level)\*\*: .+/);
                        if (match) {
                            energyLine = match[0] + '\n\n';
                        }
                    }
                }
                catch { /* ignore */ }
                const content = energyLine + formattedTasks + '\n\n---';
                await h.plugin.vaultManager.replaceSectionContent(dailyNote.path, t('vault.sectionPlan'), content);
                h.streamAIMessage(t('task.planUpdated'));
            }
        }
        catch (error) {
            h.addAIMessage(t('task.writeFailed', String(error)));
        }
        // Sync to kanban board
        try {
            if (h.plugin.kanbanService) {
                await h.plugin.kanbanService.syncFromDailyNote();
            }
        }
        catch (e) {
            console.error('[ChatView] Failed to sync kanban:', e);
        }
        // Reset state
        h.quickUpdateMode = false;
        h.sopContext = { type: 'none', currentStep: 0, responses: {} };
    }
    /**
     * Hide the multi-task input and restore normal input
     */
    hideTaskInput() {
        const h = this.host;
        if (h.taskInputContainer) {
            h.taskInputContainer.remove();
            h.taskInputContainer = null;
        }
        h.taskData = [];
        h.isTaskInputMode = false;
        h.inputContainer.removeClass('tl-hidden');
    }
    /**
     * Start a quick plan update (skip energy question, go straight to task input)
     */
    async startQuickPlanUpdate() {
        const h = this.host;
        // Read existing tasks from today's daily note
        const existingTasks = await this.getExistingTasks();
        if (existingTasks.length > 0) {
            h.addAIMessage(t('task.modifyTasks'));
        }
        else {
            h.addAIMessage(t('task.enterTasks'));
        }
        h.quickUpdateMode = true;
        this.showTaskInput(existingTasks.length > 0 ? existingTasks : undefined);
    }
    /**
     * Read existing tasks from today's daily note
     */
    async getExistingTasks() {
        const h = this.host;
        try {
            const dailyNotePath = h.plugin.vaultManager.getDailyNotePath();
            const file = h.app.vault.getAbstractFileByPath(dailyNotePath);
            if (!(file instanceof TFile))
                return [];
            const content = await h.app.vault.read(file);
            const tasks = [];
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
        }
        catch {
            return [];
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFzay1pbnB1dC1tYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidGFzay1pbnB1dC1tYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7R0FHRztBQUVILE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBSTFDLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFvQjVCLE1BQU0sT0FBTyxnQkFBZ0I7SUFDekIsWUFBb0IsSUFBbUI7UUFBbkIsU0FBSSxHQUFKLElBQUksQ0FBZTtJQUFJLENBQUM7SUFFNUM7O09BRUc7SUFDSCxhQUFhLENBQUMsWUFBcUQ7UUFDL0QsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztRQUNwQixJQUFJLENBQUMsQ0FBQyxlQUFlO1lBQUUsT0FBTztRQUU5QixDQUFDLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztRQUN6QixDQUFDLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztRQUVoQixvQkFBb0I7UUFDcEIsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFdkMsNkNBQTZDO1FBQzdDLENBQUMsQ0FBQyxrQkFBa0IsR0FBRyxDQUFDLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUV0RixTQUFTO1FBQ1QsTUFBTSxNQUFNLEdBQUcsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sQ0FBQyxVQUFVLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUU5QyxzQkFBc0I7UUFDdEIsTUFBTSxhQUFhLEdBQUcsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUVy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UztnQkFDYixDQUFDO2dCQUNELGtDQUFrQztnQkFDbEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO2dCQUNwRCxJQUFJLFFBQVEsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUMvQixLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUM5RCxDQUFDO1lBQ0wsQ0FBQztZQUNELE9BQU8sS0FBSyxDQUFDO1FBQ2pCLENBQUM7UUFBQyxNQUFNLENBQUM7WUFDTCxPQUFPLEVBQUUsQ0FBQztRQUNkLENBQUM7SUFDTCxDQUFDO0NBQ0oiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFRhc2sgSW5wdXQgTWFuYWdlciAtIEhhbmRsZXMgbXVsdGktdGFzayBpbnB1dCBVSSBhbmQgc3VibWlzc2lvblxuICogRXh0cmFjdGVkIGZyb20gY2hhdC12aWV3LnRzIGZvciBtYWludGFpbmFiaWxpdHkuXG4gKi9cblxuaW1wb3J0IHsgVEZpbGUsIHNldEljb24gfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgdHlwZSBUaWRlTG9nUGx1Z2luIGZyb20gJy4uL21haW4nO1xuaW1wb3J0IHR5cGUgeyBBcHAgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgdHlwZSB7IFNPUENvbnRleHQgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB0IH0gZnJvbSAnLi4vaTE4bic7XG5cbi8qKiBNaW5pbWFsIGludGVyZmFjZSBmb3IgdGhlIGhvc3QgdmlldyB0aGF0IG93bnMgdGhpcyBtYW5hZ2VyLiAqL1xuZXhwb3J0IGludGVyZmFjZSBUYXNrSW5wdXRIb3N0IHtcbiAgICBwbHVnaW46IFRpZGVMb2dQbHVnaW47XG4gICAgYXBwOiBBcHA7XG4gICAgY29udGFpbmVyRWw6IEhUTUxFbGVtZW50O1xuICAgIHNvcENvbnRleHQ6IFNPUENvbnRleHQ7XG4gICAgcXVpY2tVcGRhdGVNb2RlOiBib29sZWFuO1xuICAgIGlucHV0Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcbiAgICBpc1Rhc2tJbnB1dE1vZGU6IGJvb2xlYW47XG4gICAgdGFza0lucHV0Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgdGFza0RhdGE6IHsgZmllbGQ6IEhUTUxJbnB1dEVsZW1lbnQ7IHN1YnRhc2tGaWVsZHM6IEhUTUxJbnB1dEVsZW1lbnRbXTsgc3VidGFza0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsIH1bXTtcblxuICAgIGFkZFVzZXJNZXNzYWdlKGNvbnRlbnQ6IHN0cmluZyk6IHZvaWQ7XG4gICAgYWRkQUlNZXNzYWdlKGNvbnRlbnQ6IHN0cmluZyk6IHZvaWQ7XG4gICAgc3RyZWFtQUlNZXNzYWdlKGNvbnRlbnQ6IHN0cmluZyk6IHZvaWQ7XG4gICAgc2Nyb2xsVG9Cb3R0b20oKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIFRhc2tJbnB1dE1hbmFnZXIge1xuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgaG9zdDogVGFza0lucHV0SG9zdCkgeyB9XG5cbiAgICAvKipcbiAgICAgKiBTaG93IHRoZSBtdWx0aS10YXNrIGlucHV0IFVJLCByZXBsYWNpbmcgdGhlIG5vcm1hbCB0ZXh0YXJlYVxuICAgICAqL1xuICAgIHNob3dUYXNrSW5wdXQocHJlZmlsbFRhc2tzPzogeyB0ZXh0OiBzdHJpbmc7IHN1YnRhc2tzOiBzdHJpbmdbXSB9W10pOiB2b2lkIHtcbiAgICAgICAgY29uc3QgaCA9IHRoaXMuaG9zdDtcbiAgICAgICAgaWYgKGguaXNUYXNrSW5wdXRNb2RlKSByZXR1cm47XG5cbiAgICAgICAgaC5pc1Rhc2tJbnB1dE1vZGUgPSB0cnVlO1xuICAgICAgICBoLnRhc2tEYXRhID0gW107XG5cbiAgICAgICAgLy8gSGlkZSBub3JtYWwgaW5wdXRcbiAgICAgICAgaC5pbnB1dENvbnRhaW5lci5hZGRDbGFzcygndGwtaGlkZGVuJyk7XG5cbiAgICAgICAgLy8gQ3JlYXRlIHRhc2sgaW5wdXQgY29udGFpbmVyIGFmdGVyIG1lc3NhZ2VzXG4gICAgICAgIGgudGFza0lucHV0Q29udGFpbmVyID0gaC5jb250YWluZXJFbC5jaGlsZHJlblsxXS5jcmVhdGVEaXYoJ3RsLXRhc2staW5wdXQtY29udGFpbmVyJyk7XG5cbiAgICAgICAgLy8gSGVhZGVyXG4gICAgICAgIGNvbnN0IGhlYWRlciA9IGgudGFza0lucHV0Q29udGFpbmVyLmNyZWF0ZURpdigndGwtdGFzay1pbnB1dC1oZWFkZXInKTtcbiAgICAgICAgaGVhZGVyLmNyZWF0ZVNwYW4oeyB0ZXh0OiB0KCd0YXNrLmhlYWRlcicpIH0pO1xuXG4gICAgICAgIC8vIFRhc2sgcm93cyBjb250YWluZXJcbiAgICAgICAgY29uc3Qgcm93c0NvbnRhaW5lciA9IGgudGFza0lucHV0Q29udGFpbmVyLmNyZWF0ZURpdigndGwtdGFzay1yb3dzJyk7XG5cbiAgICAgICAgLy8gQWRkIHJvd3M6IHByZS1maWxsZWQgb3IgMyBlbXB0eVxuICAgICAgICBpZiAocHJlZmlsbFRhc2tzICYmIHByZWZpbGxUYXNrcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHRhc2sgb2YgcHJlZmlsbFRhc2tzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRUYXNrUm93KHJvd3NDb250YWluZXIsIHRhc2sudGV4dCwgdGFzay5zdWJ0YXNrcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFkZFRhc2tSb3cocm93c0NvbnRhaW5lcik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDM7IGkrKykge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkVGFza1Jvdyhyb3dzQ29udGFpbmVyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEFkZCB0YXNrIGJ1dHRvblxuICAgICAgICBjb25zdCBhZGRCdG4gPSBoLnRhc2tJbnB1dENvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywge1xuICAgICAgICAgICAgY2xzOiAndGwtdGFzay1hZGQtYnRuJyxcbiAgICAgICAgICAgIHRleHQ6IHQoJ3Rhc2suYWRkVGFzaycpLFxuICAgICAgICB9KTtcbiAgICAgICAgYWRkQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5hZGRUYXNrUm93KHJvd3NDb250YWluZXIpO1xuICAgICAgICAgICAgY29uc3QgbGFzdERhdGEgPSBoLnRhc2tEYXRhW2gudGFza0RhdGEubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICBpZiAobGFzdERhdGEpIGxhc3REYXRhLmZpZWxkLmZvY3VzKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFN1Ym1pdCBidXR0b25cbiAgICAgICAgY29uc3Qgc3VibWl0QnRuID0gaC50YXNrSW5wdXRDb250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHtcbiAgICAgICAgICAgIGNsczogJ3RsLXRhc2stc3VibWl0LWJ0bicsXG4gICAgICAgICAgICB0ZXh0OiB0KCd0YXNrLnN1Ym1pdCcpLFxuICAgICAgICB9KTtcbiAgICAgICAgc3VibWl0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdm9pZCB0aGlzLnN1Ym1pdFRhc2tzKCkpO1xuXG4gICAgICAgIC8vIEZvY3VzIGZpcnN0IGVtcHR5IGlucHV0XG4gICAgICAgIGNvbnN0IGZpcnN0RW1wdHkgPSBoLnRhc2tEYXRhLmZpbmQoKGQpID0+ICFkLmZpZWxkLnZhbHVlKTtcbiAgICAgICAgaWYgKGZpcnN0RW1wdHkpIHtcbiAgICAgICAgICAgIGZpcnN0RW1wdHkuZmllbGQuZm9jdXMoKTtcbiAgICAgICAgfSBlbHNlIGlmIChoLnRhc2tEYXRhWzBdKSB7XG4gICAgICAgICAgICBoLnRhc2tEYXRhWzBdLmZpZWxkLmZvY3VzKCk7XG4gICAgICAgIH1cblxuICAgICAgICBoLnNjcm9sbFRvQm90dG9tKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkIGEgc2luZ2xlIHRhc2sgaW5wdXQgcm93IHdpdGggb3B0aW9uYWwgc3ViLXRhc2sgdG9nZ2xlXG4gICAgICovXG4gICAgcHJpdmF0ZSBhZGRUYXNrUm93KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHByZWZpbGxWYWx1ZT86IHN0cmluZywgcHJlZmlsbFN1YnRhc2tzPzogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgY29uc3QgaCA9IHRoaXMuaG9zdDtcbiAgICAgICAgY29uc3Qgcm93ID0gY29udGFpbmVyLmNyZWF0ZURpdigndGwtdGFzay1yb3cnKTtcblxuICAgICAgICBjb25zdCBpbmRleCA9IGgudGFza0RhdGEubGVuZ3RoICsgMTtcbiAgICAgICAgcm93LmNyZWF0ZVNwYW4oeyBjbHM6ICd0bC10YXNrLWxhYmVsJywgdGV4dDogYCR7aW5kZXh9LmAgfSk7XG5cbiAgICAgICAgY29uc3QgaW5wdXQgPSByb3cuY3JlYXRlRWwoJ2lucHV0Jywge1xuICAgICAgICAgICAgY2xzOiAndGwtdGFzay1maWVsZCcsXG4gICAgICAgICAgICBhdHRyOiB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3RleHQnLFxuICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyOiB0KCd0YXNrLnBsYWNlaG9sZGVyJywgU3RyaW5nKGluZGV4KSksXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAocHJlZmlsbFZhbHVlKSB7XG4gICAgICAgICAgICBpbnB1dC52YWx1ZSA9IHByZWZpbGxWYWx1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEFjdGlvbiBidXR0b25zIGNvbnRhaW5lclxuICAgICAgICBjb25zdCBhY3Rpb25zID0gcm93LmNyZWF0ZURpdigndGwtdGFzay1hY3Rpb25zJyk7XG5cbiAgICAgICAgLy8gU3ViLXRhc2sgdG9nZ2xlIGJ1dHRvblxuICAgICAgICBjb25zdCBzdWJ0YXNrQnRuID0gYWN0aW9ucy5jcmVhdGVFbCgnYnV0dG9uJywge1xuICAgICAgICAgICAgY2xzOiAndGwtdGFzay1zdWJ0YXNrLWJ0bicsXG4gICAgICAgICAgICBhdHRyOiB7ICdhcmlhLWxhYmVsJzogdCgndGFzay5zdWJ0YXNrJykgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIHNldEljb24oc3VidGFza0J0biwgJ2xpc3QtdHJlZScpO1xuXG4gICAgICAgIC8vIFJlbW92ZSBidXR0b25cbiAgICAgICAgY29uc3QgcmVtb3ZlQnRuID0gYWN0aW9ucy5jcmVhdGVFbCgnYnV0dG9uJywge1xuICAgICAgICAgICAgY2xzOiAndGwtdGFzay1yZW1vdmUtYnRuJyxcbiAgICAgICAgICAgIGF0dHI6IHsgJ2FyaWEtbGFiZWwnOiB0KCd0YXNrLmRlbGV0ZScpIH0sXG4gICAgICAgIH0pO1xuICAgICAgICBzZXRJY29uKHJlbW92ZUJ0biwgJ3gnKTtcblxuICAgICAgICAvLyBEYXRhIGZvciB0aGlzIHRhc2tcbiAgICAgICAgY29uc3QgdGFza0VudHJ5ID0ge1xuICAgICAgICAgICAgZmllbGQ6IGlucHV0LFxuICAgICAgICAgICAgc3VidGFza0ZpZWxkczogW10gYXMgSFRNTElucHV0RWxlbWVudFtdLFxuICAgICAgICAgICAgc3VidGFza0NvbnRhaW5lcjogbnVsbCBhcyBIVE1MRWxlbWVudCB8IG51bGwsXG4gICAgICAgIH07XG4gICAgICAgIGgudGFza0RhdGEucHVzaCh0YXNrRW50cnkpO1xuXG4gICAgICAgIC8vIFN1Yi10YXNrIHRvZ2dsZSBsb2dpY1xuICAgICAgICBzdWJ0YXNrQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHRhc2tFbnRyeS5zdWJ0YXNrQ29udGFpbmVyKSB7XG4gICAgICAgICAgICAgICAgLy8gQ29sbGFwc2Ugc3ViLXRhc2tzXG4gICAgICAgICAgICAgICAgdGFza0VudHJ5LnN1YnRhc2tDb250YWluZXIucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgdGFza0VudHJ5LnN1YnRhc2tDb250YWluZXIgPSBudWxsO1xuICAgICAgICAgICAgICAgIHRhc2tFbnRyeS5zdWJ0YXNrRmllbGRzID0gW107XG4gICAgICAgICAgICAgICAgc3VidGFza0J0bi5yZW1vdmVDbGFzcygnaXMtZXhwYW5kZWQnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gRXhwYW5kIHN1Yi10YXNrc1xuICAgICAgICAgICAgICAgIHN1YnRhc2tCdG4uYWRkQ2xhc3MoJ2lzLWV4cGFuZGVkJyk7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3ViQ29udGFpbmVyID0gY29udGFpbmVyLmNyZWF0ZURpdigndGwtc3VidGFzay1jb250YWluZXInKTtcbiAgICAgICAgICAgICAgICB0YXNrRW50cnkuc3VidGFza0NvbnRhaW5lciA9IHN1YkNvbnRhaW5lcjtcblxuICAgICAgICAgICAgICAgIC8vIEluc2VydCBhZnRlciB0aGlzIHJvd1xuICAgICAgICAgICAgICAgIHJvdy5hZnRlcihzdWJDb250YWluZXIpO1xuXG4gICAgICAgICAgICAgICAgY29uc3Qgc3ViUm93cyA9IHN1YkNvbnRhaW5lci5jcmVhdGVEaXYoJ3RsLXN1YnRhc2stcm93cycpO1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkU3VidGFza1Jvdyh0YXNrRW50cnksIHN1YlJvd3MpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgYWRkU3ViQnRuID0gc3ViQ29udGFpbmVyLmNyZWF0ZUVsKCdidXR0b24nLCB7XG4gICAgICAgICAgICAgICAgICAgIGNsczogJ3RsLXN1YnRhc2stYWRkLWJ0bicsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc2V0SWNvbihhZGRTdWJCdG4sICdwbHVzJyk7XG4gICAgICAgICAgICAgICAgYWRkU3ViQnRuLmNyZWF0ZVNwYW4oeyB0ZXh0OiB0KCd0YXNrLmFkZFN1YnRhc2snKSB9KTtcbiAgICAgICAgICAgICAgICBhZGRTdWJCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkU3VidGFza1Jvdyh0YXNrRW50cnksIHN1YlJvd3MpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXN0U3ViID0gdGFza0VudHJ5LnN1YnRhc2tGaWVsZHNbdGFza0VudHJ5LnN1YnRhc2tGaWVsZHMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChsYXN0U3ViKSBsYXN0U3ViLmZvY3VzKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEVudGVyIGtleTogYWRkIG5ldyByb3cgaWYgdGhpcyBpcyB0aGUgbGFzdCBvbmVcbiAgICAgICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG4gICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFbnRlcicpIHtcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgY29uc3QgaWR4ID0gaC50YXNrRGF0YS5pbmRleE9mKHRhc2tFbnRyeSk7XG4gICAgICAgICAgICAgICAgaWYgKGlkeCA9PT0gaC50YXNrRGF0YS5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkVGFza1Jvdyhjb250YWluZXIpO1xuICAgICAgICAgICAgICAgICAgICBoLnRhc2tEYXRhW2gudGFza0RhdGEubGVuZ3RoIC0gMV0uZmllbGQuZm9jdXMoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVUYXNrTGFiZWxzKCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaC50YXNrRGF0YVtpZHggKyAxXS5maWVsZC5mb2N1cygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gUmVtb3ZlIGJ1dHRvbiBsb2dpY1xuICAgICAgICByZW1vdmVCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoaC50YXNrRGF0YS5sZW5ndGggPD0gMSkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgaWR4ID0gaC50YXNrRGF0YS5pbmRleE9mKHRhc2tFbnRyeSk7XG4gICAgICAgICAgICAvLyBBbHNvIHJlbW92ZSBzdWItdGFzayBjb250YWluZXJcbiAgICAgICAgICAgIGlmICh0YXNrRW50cnkuc3VidGFza0NvbnRhaW5lcikge1xuICAgICAgICAgICAgICAgIHRhc2tFbnRyeS5zdWJ0YXNrQ29udGFpbmVyLnJlbW92ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaC50YXNrRGF0YS5zcGxpY2UoaWR4LCAxKTtcbiAgICAgICAgICAgIHJvdy5yZW1vdmUoKTtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlVGFza0xhYmVscygpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBBdXRvLWV4cGFuZCBzdWItdGFza3MgaWYgdGhlcmUgYXJlIHByZS1maWxsZWQgc3VidGFza3NcbiAgICAgICAgaWYgKHByZWZpbGxTdWJ0YXNrcyAmJiBwcmVmaWxsU3VidGFza3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgc3VidGFza0J0bi5jbGljaygpO1xuICAgICAgICAgICAgLy8gRmlsbCBpbiB0aGUgZmlyc3Qgcm93IHRoYXQgd2FzIGF1dG8tY3JlYXRlZFxuICAgICAgICAgICAgaWYgKHRhc2tFbnRyeS5zdWJ0YXNrRmllbGRzWzBdICYmIHByZWZpbGxTdWJ0YXNrc1swXSkge1xuICAgICAgICAgICAgICAgIHRhc2tFbnRyeS5zdWJ0YXNrRmllbGRzWzBdLnZhbHVlID0gcHJlZmlsbFN1YnRhc2tzWzBdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gQWRkIHJlbWFpbmluZyBzdWJ0YXNrIHJvd3NcbiAgICAgICAgICAgIGNvbnN0IHN1YlJvd3MgPSB0YXNrRW50cnkuc3VidGFza0NvbnRhaW5lcj8ucXVlcnlTZWxlY3RvcignLnRsLXN1YnRhc2stcm93cycpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgICAgaWYgKHN1YlJvd3MpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IHByZWZpbGxTdWJ0YXNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZFN1YnRhc2tSb3codGFza0VudHJ5LCBzdWJSb3dzLCBwcmVmaWxsU3VidGFza3NbaV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZCBhIHN1Yi10YXNrIHJvd1xuICAgICAqL1xuICAgIHByaXZhdGUgYWRkU3VidGFza1JvdyhcbiAgICAgICAgdGFza0VudHJ5OiB7IHN1YnRhc2tGaWVsZHM6IEhUTUxJbnB1dEVsZW1lbnRbXSB9LFxuICAgICAgICBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuICAgICAgICBwcmVmaWxsVmFsdWU/OiBzdHJpbmdcbiAgICApOiB2b2lkIHtcbiAgICAgICAgY29uc3Qgc3ViUm93ID0gY29udGFpbmVyLmNyZWF0ZURpdigndGwtc3VidGFzay1yb3cnKTtcbiAgICAgICAgc3ViUm93LmNyZWF0ZVNwYW4oeyBjbHM6ICd0bC1zdWJ0YXNrLWJ1bGxldCcsIHRleHQ6ICfil6YnIH0pO1xuXG4gICAgICAgIGNvbnN0IHN1YklucHV0ID0gc3ViUm93LmNyZWF0ZUVsKCdpbnB1dCcsIHtcbiAgICAgICAgICAgIGNsczogJ3RsLXN1YnRhc2stZmllbGQnLFxuICAgICAgICAgICAgYXR0cjoge1xuICAgICAgICAgICAgICAgIHR5cGU6ICd0ZXh0JyxcbiAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcjogdCgndGFzay5zdWJ0YXNrUGxhY2Vob2xkZXInKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChwcmVmaWxsVmFsdWUpIHtcbiAgICAgICAgICAgIHN1YklucHV0LnZhbHVlID0gcHJlZmlsbFZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgc3ViUmVtb3ZlQnRuID0gc3ViUm93LmNyZWF0ZUVsKCdidXR0b24nLCB7XG4gICAgICAgICAgICBjbHM6ICd0bC1zdWJ0YXNrLXJlbW92ZS1idG4nLFxuICAgICAgICAgICAgYXR0cjogeyAnYXJpYS1sYWJlbCc6IHQoJ3Rhc2suZGVsZXRlU3VidGFzaycpIH0sXG4gICAgICAgIH0pO1xuICAgICAgICBzZXRJY29uKHN1YlJlbW92ZUJ0biwgJ3gnKTtcbiAgICAgICAgc3ViUmVtb3ZlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaWR4ID0gdGFza0VudHJ5LnN1YnRhc2tGaWVsZHMuaW5kZXhPZihzdWJJbnB1dCk7XG4gICAgICAgICAgICB0YXNrRW50cnkuc3VidGFza0ZpZWxkcy5zcGxpY2UoaWR4LCAxKTtcbiAgICAgICAgICAgIHN1YlJvdy5yZW1vdmUoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gRW50ZXIga2V5OiBhZGQgbmV3IHN1Yi10YXNrIHJvd1xuICAgICAgICBzdWJJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcbiAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJykge1xuICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZFN1YnRhc2tSb3codGFza0VudHJ5LCBjb250YWluZXIpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGxhc3RTdWIgPSB0YXNrRW50cnkuc3VidGFza0ZpZWxkc1t0YXNrRW50cnkuc3VidGFza0ZpZWxkcy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICBpZiAobGFzdFN1YikgbGFzdFN1Yi5mb2N1cygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0YXNrRW50cnkuc3VidGFza0ZpZWxkcy5wdXNoKHN1YklucHV0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGUgdGFzayByb3cgbGFiZWxzIGFmdGVyIGFkZC9yZW1vdmVcbiAgICAgKi9cbiAgICBwcml2YXRlIHVwZGF0ZVRhc2tMYWJlbHMoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuaG9zdC50YXNrRGF0YS5mb3JFYWNoKChlbnRyeSwgaSkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgcm93ID0gZW50cnkuZmllbGQucGFyZW50RWxlbWVudDtcbiAgICAgICAgICAgIGlmIChyb3cpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsYWJlbCA9IHJvdy5xdWVyeVNlbGVjdG9yKCcudGwtdGFzay1sYWJlbCcpO1xuICAgICAgICAgICAgICAgIGlmIChsYWJlbCkgbGFiZWwudGV4dENvbnRlbnQgPSBgJHtpICsgMX0uYDtcbiAgICAgICAgICAgICAgICBlbnRyeS5maWVsZC5wbGFjZWhvbGRlciA9IHQoJ3Rhc2sucGxhY2Vob2xkZXInLCBTdHJpbmcoaSArIDEpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3VibWl0IHRhc2tzIGZyb20gdGhlIG11bHRpLXRhc2sgaW5wdXRcbiAgICAgKi9cbiAgICBhc3luYyBzdWJtaXRUYXNrcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgaCA9IHRoaXMuaG9zdDtcbiAgICAgICAgLy8gQ29sbGVjdCB0YXNrIGRhdGEgd2l0aCBzdWItdGFza3NcbiAgICAgICAgY29uc3QgdGFza0l0ZW1zOiB7IHRleHQ6IHN0cmluZzsgc3VidGFza3M6IHN0cmluZ1tdIH1bXSA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGgudGFza0RhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBlbnRyeS5maWVsZC52YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBpZiAoIXRleHQpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3Qgc3VidGFza3MgPSBlbnRyeS5zdWJ0YXNrRmllbGRzXG4gICAgICAgICAgICAgICAgLm1hcCgoZikgPT4gZi52YWx1ZS50cmltKCkpXG4gICAgICAgICAgICAgICAgLmZpbHRlcigocykgPT4gcy5sZW5ndGggPiAwKTtcbiAgICAgICAgICAgIHRhc2tJdGVtcy5wdXNoKHsgdGV4dCwgc3VidGFza3MgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGFza0l0ZW1zLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gICAgICAgIC8vIEZvcm1hdCBkaXNwbGF5IHRleHRcbiAgICAgICAgY29uc3QgZGlzcGxheUxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICB0YXNrSXRlbXMuZm9yRWFjaCgoaXRlbSwgaSkgPT4ge1xuICAgICAgICAgICAgZGlzcGxheUxpbmVzLnB1c2goYCR7aSArIDF9LiAke2l0ZW0udGV4dH1gKTtcbiAgICAgICAgICAgIGl0ZW0uc3VidGFza3MuZm9yRWFjaCgoc3ViKSA9PiB7XG4gICAgICAgICAgICAgICAgZGlzcGxheUxpbmVzLnB1c2goYCAgIOKXpiAke3N1Yn1gKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgaC5hZGRVc2VyTWVzc2FnZShkaXNwbGF5TGluZXMuam9pbignXFxuJykpO1xuXG4gICAgICAgIC8vIEhpZGUgdGFzayBpbnB1dFxuICAgICAgICB0aGlzLmhpZGVUYXNrSW5wdXQoKTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gRm9ybWF0IGZvciBkYWlseSBub3RlXG4gICAgICAgICAgICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiB0YXNrSXRlbXMpIHtcbiAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKGAtIFsgXSAke2l0ZW0udGV4dH1gKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHN1YiBvZiBpdGVtLnN1YnRhc2tzKSB7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goYCAgLSBbIF0gJHtzdWJ9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGVkVGFza3MgPSBsaW5lcy5qb2luKCdcXG4nKTtcbiAgICAgICAgICAgIGNvbnN0IGRhaWx5Tm90ZSA9IGF3YWl0IGgucGx1Z2luLnZhdWx0TWFuYWdlci5nZXRPckNyZWF0ZURhaWx5Tm90ZSgpO1xuXG4gICAgICAgICAgICBpZiAoaC5zb3BDb250ZXh0LnR5cGUgPT09ICdtb3JuaW5nJyAmJiAhaC5xdWlja1VwZGF0ZU1vZGUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmVyZ3lMZXZlbCA9IGguc29wQ29udGV4dC5yZXNwb25zZXNbJ2VuZXJneV9sZXZlbCddIHx8ICc/JztcbiAgICAgICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYCoqJHt0KCd0YXNrLmVuZXJneUxhYmVsJyl9Kio6ICR7ZW5lcmd5TGV2ZWx9LzEwXFxuXFxuJHtmb3JtYXR0ZWRUYXNrc31cXG5cXG4tLS1gO1xuICAgICAgICAgICAgICAgIGF3YWl0IGgucGx1Z2luLnZhdWx0TWFuYWdlci5yZXBsYWNlU2VjdGlvbkNvbnRlbnQoXG4gICAgICAgICAgICAgICAgICAgIGRhaWx5Tm90ZS5wYXRoLFxuICAgICAgICAgICAgICAgICAgICB0KCd2YXVsdC5zZWN0aW9uUGxhbicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZW50XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBoLnN0cmVhbUFJTWVzc2FnZSh0KCd0YXNrLnBsYW5TYXZlZCcpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gUXVpY2sgdXBkYXRlOiByZWFkIGV4aXN0aW5nIGVuZXJneSBsZXZlbCwgdGhlbiByZXBsYWNlIGVudGlyZSBzZWN0aW9uXG4gICAgICAgICAgICAgICAgbGV0IGVuZXJneUxpbmUgPSAnJztcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBub3RlRmlsZSA9IGguYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChkYWlseU5vdGUucGF0aCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChub3RlRmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBub3RlQ29udGVudCA9IGF3YWl0IGguYXBwLnZhdWx0LnJlYWQobm90ZUZpbGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSBub3RlQ29udGVudC5tYXRjaCgvXFwqXFwqKD8657K+5Yqb54q25oCBfEVuZXJneSBsZXZlbClcXCpcXCo6IC4rLyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmVyZ3lMaW5lID0gbWF0Y2hbMF0gKyAnXFxuXFxuJztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGVuZXJneUxpbmUgKyBmb3JtYXR0ZWRUYXNrcyArICdcXG5cXG4tLS0nO1xuICAgICAgICAgICAgICAgIGF3YWl0IGgucGx1Z2luLnZhdWx0TWFuYWdlci5yZXBsYWNlU2VjdGlvbkNvbnRlbnQoXG4gICAgICAgICAgICAgICAgICAgIGRhaWx5Tm90ZS5wYXRoLFxuICAgICAgICAgICAgICAgICAgICB0KCd2YXVsdC5zZWN0aW9uUGxhbicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZW50XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBoLnN0cmVhbUFJTWVzc2FnZSh0KCd0YXNrLnBsYW5VcGRhdGVkJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgaC5hZGRBSU1lc3NhZ2UodCgndGFzay53cml0ZUZhaWxlZCcsIFN0cmluZyhlcnJvcikpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFN5bmMgdG8ga2FuYmFuIGJvYXJkXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAoaC5wbHVnaW4ua2FuYmFuU2VydmljZSkge1xuICAgICAgICAgICAgICAgIGF3YWl0IGgucGx1Z2luLmthbmJhblNlcnZpY2Uuc3luY0Zyb21EYWlseU5vdGUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW0NoYXRWaWV3XSBGYWlsZWQgdG8gc3luYyBrYW5iYW46JywgZSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXNldCBzdGF0ZVxuICAgICAgICBoLnF1aWNrVXBkYXRlTW9kZSA9IGZhbHNlO1xuICAgICAgICBoLnNvcENvbnRleHQgPSB7IHR5cGU6ICdub25lJywgY3VycmVudFN0ZXA6IDAsIHJlc3BvbnNlczoge30gfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBIaWRlIHRoZSBtdWx0aS10YXNrIGlucHV0IGFuZCByZXN0b3JlIG5vcm1hbCBpbnB1dFxuICAgICAqL1xuICAgIGhpZGVUYXNrSW5wdXQoKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGggPSB0aGlzLmhvc3Q7XG4gICAgICAgIGlmIChoLnRhc2tJbnB1dENvbnRhaW5lcikge1xuICAgICAgICAgICAgaC50YXNrSW5wdXRDb250YWluZXIucmVtb3ZlKCk7XG4gICAgICAgICAgICBoLnRhc2tJbnB1dENvbnRhaW5lciA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaC50YXNrRGF0YSA9IFtdO1xuICAgICAgICBoLmlzVGFza0lucHV0TW9kZSA9IGZhbHNlO1xuICAgICAgICBoLmlucHV0Q29udGFpbmVyLnJlbW92ZUNsYXNzKCd0bC1oaWRkZW4nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydCBhIHF1aWNrIHBsYW4gdXBkYXRlIChza2lwIGVuZXJneSBxdWVzdGlvbiwgZ28gc3RyYWlnaHQgdG8gdGFzayBpbnB1dClcbiAgICAgKi9cbiAgICBhc3luYyBzdGFydFF1aWNrUGxhblVwZGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgaCA9IHRoaXMuaG9zdDtcbiAgICAgICAgLy8gUmVhZCBleGlzdGluZyB0YXNrcyBmcm9tIHRvZGF5J3MgZGFpbHkgbm90ZVxuICAgICAgICBjb25zdCBleGlzdGluZ1Rhc2tzID0gYXdhaXQgdGhpcy5nZXRFeGlzdGluZ1Rhc2tzKCk7XG4gICAgICAgIGlmIChleGlzdGluZ1Rhc2tzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGguYWRkQUlNZXNzYWdlKHQoJ3Rhc2subW9kaWZ5VGFza3MnKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBoLmFkZEFJTWVzc2FnZSh0KCd0YXNrLmVudGVyVGFza3MnKSk7XG4gICAgICAgIH1cbiAgICAgICAgaC5xdWlja1VwZGF0ZU1vZGUgPSB0cnVlO1xuICAgICAgICB0aGlzLnNob3dUYXNrSW5wdXQoZXhpc3RpbmdUYXNrcy5sZW5ndGggPiAwID8gZXhpc3RpbmdUYXNrcyA6IHVuZGVmaW5lZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVhZCBleGlzdGluZyB0YXNrcyBmcm9tIHRvZGF5J3MgZGFpbHkgbm90ZVxuICAgICAqL1xuICAgIGFzeW5jIGdldEV4aXN0aW5nVGFza3MoKTogUHJvbWlzZTx7IHRleHQ6IHN0cmluZzsgc3VidGFza3M6IHN0cmluZ1tdIH1bXT4ge1xuICAgICAgICBjb25zdCBoID0gdGhpcy5ob3N0O1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZGFpbHlOb3RlUGF0aCA9IGgucGx1Z2luLnZhdWx0TWFuYWdlci5nZXREYWlseU5vdGVQYXRoKCk7XG4gICAgICAgICAgICBjb25zdCBmaWxlID0gaC5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGRhaWx5Tm90ZVBhdGgpO1xuICAgICAgICAgICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkgcmV0dXJuIFtdO1xuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IGguYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgICAgICBjb25zdCB0YXNrczogeyB0ZXh0OiBzdHJpbmc7IHN1YnRhc2tzOiBzdHJpbmdbXSB9W10gPSBbXTtcbiAgICAgICAgICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICAgICAgICAgICAgICAvLyBNYWluIHRhc2s6IC0gWyBdIHRleHRcbiAgICAgICAgICAgICAgICBjb25zdCBtYWluTWF0Y2ggPSBsaW5lLm1hdGNoKC9eLSBcXFsgXFxdICguKykkLyk7XG4gICAgICAgICAgICAgICAgaWYgKG1haW5NYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICB0YXNrcy5wdXNoKHsgdGV4dDogbWFpbk1hdGNoWzFdLnRyaW0oKSwgc3VidGFza3M6IFtdIH0pO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gU3ViLXRhc2s6ICgyKyBzcGFjZXMpLSBbIF0gdGV4dFxuICAgICAgICAgICAgICAgIGNvbnN0IHN1Yk1hdGNoID0gbGluZS5tYXRjaCgvXlxcc3syLH0tIFxcWyBcXF0gKC4rKSQvKTtcbiAgICAgICAgICAgICAgICBpZiAoc3ViTWF0Y2ggJiYgdGFza3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB0YXNrc1t0YXNrcy5sZW5ndGggLSAxXS5zdWJ0YXNrcy5wdXNoKHN1Yk1hdGNoWzFdLnRyaW0oKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRhc2tzO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiJdfQ==