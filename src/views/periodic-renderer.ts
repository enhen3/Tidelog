/**
 * Periodic Renderer - LifeOS-style periodic navigator
 * Replaces the old kanban-renderer with a day/week/month period selector + content preview.
 */

import { Menu, TFile, moment, setIcon, Platform } from 'obsidian';
import type TideLogPlugin from '../main';
import type { App } from 'obsidian';
import type { PlanSuggestionScope } from '../services/plan-suggestion-service';
import { t, getLanguage } from '../i18n';

export type PeriodicMode = 'day' | 'week' | 'month' | 'capture';

/** Host view interface */
export interface PeriodicHost {
    plugin: TideLogPlugin;
    app: App;
    periodicMode: PeriodicMode;
    periodicSelectedDate: moment.Moment;
    periodicMonthOffset: number;
    periodicSelectorOpen: boolean;
    parseMdTasks(content: string): { text: string; done: boolean; isTask: boolean; section: string; indent: number }[];
    toggleMdTask(file: TFile, taskText: string, wasDone: boolean): Promise<void>;
    addMdTask(file: TFile, taskText: string, indent?: number): Promise<void>;
    addSubTask(file: TFile, parentText: string, subTaskText: string, parentIndent?: number): Promise<void>;
    editMdTask(file: TFile, oldText: string, newText: string): Promise<void>;
    deleteMdTask(file: TFile, taskText: string): Promise<void>;
    setTaskIndent(file: TFile, taskText: string, newIndent: number): Promise<void>;
    reorderMdTasks(file: TFile, orderedTexts: string[]): Promise<void>;
    deferTaskToToday(sourceFile: TFile, taskText: string): Promise<void>;
    moveTaskToDate(sourceFile: TFile, taskText: string, targetDate: Date): Promise<void>;
    moveTaskToPlan(sourceFile: TFile, taskText: string, targetPlanPath: string): Promise<void>;
    invalidateTabCache(tab: string): void;
    switchTab(tab: string): void;
}

export class PeriodicRenderer {
    private periodPickerEl: HTMLElement | null = null;
    private periodPickerCleanup: (() => void) | null = null;

    constructor(private host: PeriodicHost) { }

    private createDetachedInput(): HTMLInputElement {
        const input = activeDocument.body.createEl('input');
        input.remove();
        return input;
    }

    private createDetachedDiv(): HTMLDivElement {
        const div = activeDocument.body.createDiv();
        div.remove();
        return div;
    }

    private createDetachedSpan(): HTMLSpanElement {
        const span = activeDocument.body.createSpan();
        span.remove();
        return span;
    }

    async render(panel: HTMLElement): Promise<void> {
        this.closePeriodPicker();
        panel.addClass('tl-periodic');
        if (Platform.isMobile) panel.addClass('is-mobile');

        // Period selector + content preview
        const body = panel.createDiv('tl-periodic-body');
        const mode = this.host.periodicMode;

        if (mode === 'day') {
            await this.renderDayMode(body);
        } else if (mode === 'week') {
            await this.renderWeekMode(body);
        } else if (mode === 'month') {
            await this.renderMonthMode(body);
        } else {
            await this.renderCaptureMode(body);
        }
    }

    private renderPeriodHeader(body: HTMLElement, title: string, subtitle?: string): void {
        const h = this.host;
        const header = body.createEl('button', {
            cls: `tl-periodic-period-header ${h.periodicSelectorOpen ? 'tl-periodic-period-header-open' : ''}`,
            attr: { type: 'button' },
        });
        const copy = header.createDiv('tl-periodic-period-copy');
        copy.createDiv({ cls: 'tl-periodic-period-title', text: title });
        if (subtitle) copy.createDiv({ cls: 'tl-periodic-period-subtitle', text: subtitle });
        const icon = header.createSpan({ cls: 'tl-periodic-period-chevron' });
        setIcon(icon, h.periodicSelectorOpen ? 'chevron-up' : 'chevron-down');
        header.addEventListener('click', () => {
            h.periodicSelectorOpen = !h.periodicSelectorOpen;
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        });
    }

    private getWeekOfMonth(date: moment.Moment): number {
        const firstDay = moment(date).startOf('month');
        const leadingDays = firstDay.isoWeekday() - 1;
        return Math.floor((date.date() + leadingDays - 1) / 7) + 1;
    }

    private async renderCaptureMode(body: HTMLElement): Promise<void> {
        const preview = body.createDiv('tl-periodic-preview tl-periodic-preview-plain tl-periodic-capture-preview');
        await this.renderQuickCapture(preview);
    }

    // ──────────────────────────────────────────────────────
    // Day Mode: mini calendar + daily note preview
    // ──────────────────────────────────────────────────────

    private async renderDayMode(body: HTMLElement): Promise<void> {
        const h = this.host;
        const sel = h.periodicSelectedDate;
        const calMonth = moment(sel).startOf('month').add(h.periodicMonthOffset, 'months');

        const title = getLanguage() === 'en' ? sel.format('MMM D') : sel.format('M月D日');
        const todayLabel = h.periodicSelectorOpen
            ? undefined
            : (sel.isSame(moment(), 'day') ? t('periodic.todayLabel') : sel.format('dddd'));
        this.renderPeriodHeader(body, title, todayLabel);

        if (h.periodicSelectorOpen) {
        // Calendar nav
        const calSection = body.createDiv('tl-periodic-selector');
        const calNav = calSection.createDiv('tl-periodic-cal-nav');
        const prevBtn = calNav.createEl('button', { cls: 'tl-periodic-nav-btn', text: '‹' });
        const compactMonthTitle = getLanguage() === 'en'
            ? (calMonth.year() === moment().year() ? calMonth.format('MMMM') : calMonth.format('MMMM YYYY'))
            : (calMonth.year() === moment().year() ? calMonth.format('M月') : calMonth.format('YYYY年M月'));
        calNav.createSpan({ cls: 'tl-periodic-cal-title', text: compactMonthTitle });
        const nextBtn = calNav.createEl('button', { cls: 'tl-periodic-nav-btn', text: '›' });
        prevBtn.addEventListener('click', () => { h.periodicMonthOffset--; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });
        nextBtn.addEventListener('click', () => { h.periodicMonthOffset++; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        // Mini calendar grid
        const grid = calSection.createDiv('tl-periodic-mini-cal');
        const weekdays = t('cal.weekdays').split(',');
        for (const wd of weekdays) {
            grid.createDiv({ cls: 'tl-periodic-cal-wd', text: wd });
        }

        const firstDay = moment(calMonth).startOf('month');
        const startPad = firstDay.isoWeekday() - 1;
        for (let i = 0; i < startPad; i++) grid.createDiv('tl-periodic-cal-cell tl-periodic-cal-cell-empty');

        const todayStr = moment().format('YYYY-MM-DD');
        const selStr = sel.format('YYYY-MM-DD');

        for (let d = 1; d <= calMonth.daysInMonth(); d++) {
            const dateStr = moment(calMonth).date(d).format('YYYY-MM-DD');
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selStr;
            const isPast = dateStr < todayStr;

            // Check if note exists AND has real content (tasks)
            const notePath = `${h.plugin.settings.dailyFolder}/${dateStr}.md`;
            const noteFile = h.app.vault.getAbstractFileByPath(notePath);
            const hasNote = noteFile instanceof TFile
                && (h.app.metadataCache.getFileCache(noteFile)?.listItems?.some(item => item.task !== undefined) ?? false);

            const cell = grid.createDiv(`tl-periodic-cal-cell ${isToday ? 'tl-periodic-cal-cell-today' : ''} ${isSelected ? 'tl-periodic-cal-cell-selected' : ''} ${hasNote ? 'tl-periodic-cal-cell-has-note' : ''}`);
            cell.setText(`${d}`);
            cell.addEventListener('click', () => {
                const picked = moment(calMonth).date(d);
                h.periodicSelectedDate = picked;
                h.periodicMonthOffset = 0;
                h.periodicSelectorOpen = !picked.isSame(moment(), 'day');
                h.invalidateTabCache('kanban');
                h.switchTab('kanban');
            });

            // Badge: show incomplete task count for past dates
            if (isPast && noteFile instanceof TFile && hasNote) {
                void (async () => {
                    try {
                        const content = await h.app.vault.cachedRead(noteFile);
                        const tasks = h.parseMdTasks(content).filter(t => t.isTask);
                        const incomplete = tasks.filter(t => !t.done).length;
                        if (incomplete > 0) {
                            cell.createSpan({
                                cls: 'tl-periodic-cal-badge',
                                text: String(incomplete),
                            });
                        }
                    } catch { /* skip */ }
                })();
            }
        }
        }

        // Preview area
        await this.renderDayPreview(body, sel);
    }

    private async renderDayPreview(body: HTMLElement, date: moment.Moment): Promise<void> {
        const h = this.host;
        const dateStr = date.format('YYYY-MM-DD');
        const path = `${h.plugin.settings.dailyFolder}/${dateStr}.md`;
        const file = h.app.vault.getAbstractFileByPath(path);

        const preview = body.createDiv('tl-periodic-preview tl-periodic-preview-plain');

        if (!file || !(file instanceof TFile)) {
            // Show task input even for future/empty dates — auto-create file
            const taskSection = preview.createDiv('tl-periodic-task-section');
            this.renderTaskInputForDate(taskSection, date);
            await this.renderGoalContext(preview, date);
            await this.renderPlanSuggestion(preview, 'day', date);
            return;
        }

        // Parse content (skip frontmatter for task extraction)
        const content = await h.app.vault.read(file);

        // Tasks
        const tasks = h.parseMdTasks(content).filter(t => t.isTask);
        const taskSection = preview.createDiv('tl-periodic-task-section');
        if (tasks.length > 0) {
            for (const task of tasks) {
                this.renderTask(taskSection, task, file, 'day', date);
            }
        }

        // Add task input
        if (file instanceof TFile) {
            this.renderTaskInput(taskSection, file);
        }

        await this.renderGoalContext(preview, date);
        await this.renderPlanSuggestion(preview, 'day', date);

    }

    private async renderGoalContext(container: HTMLElement, date: moment.Moment): Promise<void> {
        const h = this.host;
        const weekStart = moment(date).startOf('isoWeek');
        const weekLabel = `W${String(weekStart.isoWeek()).padStart(2, '0')}`;
        const weeklyPath = `${h.plugin.settings.planFolder}/Weekly/${weekStart.isoWeekYear()}-${weekLabel}.md`;
        const monthPath = `${h.plugin.settings.planFolder}/Monthly/${date.format('YYYY-MM')}.md`;

        const [weeklyGoals, monthlyGoals] = await Promise.all([
            this.extractWeeklyGoalLines(weeklyPath),
            this.extractMonthlyGoalLines(monthPath),
        ]);

        if (weeklyGoals.length === 0 && monthlyGoals.length === 0) return;

        const section = container.createDiv('tl-periodic-goal-context');
        const summary = section.createEl('button', {
            cls: 'tl-periodic-goal-summary',
            attr: { type: 'button' },
        });
        const chips = summary.createSpan({ cls: 'tl-periodic-goal-summary-chips' });
        this.renderGoalChip(chips, t('periodic.weekGoalChip'), weeklyGoals.length);
        this.renderGoalChip(chips, t('periodic.monthGoalChip'), monthlyGoals.length);
        const toggle = summary.createSpan({ cls: 'tl-periodic-goal-summary-toggle' });
        setIcon(toggle, 'chevron-down');
        const detail = section.createDiv('tl-periodic-goal-detail tl-periodic-collapsed');

        const renderGroup = (kind: 'week' | 'month', title: string, lines: string[]) => {
            const group = detail.createDiv(`tl-periodic-goal-group tl-periodic-goal-group-${kind}`);
            const header = group.createDiv('tl-periodic-goal-group-header');
            header.createSpan({ cls: 'tl-periodic-goal-group-title', text: title });
            if (lines.length === 0) {
                group.createDiv({ cls: 'tl-periodic-goal-empty', text: t('periodic.noGoals') });
            } else {
                const list = group.createDiv('tl-periodic-goal-list');
                for (const [index, line] of lines.entries()) {
                    const item = list.createDiv('tl-periodic-goal-item');
                    item.createSpan({ cls: 'tl-periodic-goal-index', text: String(index + 1) });
                    item.createSpan({ cls: 'tl-periodic-goal-text', text: line });
                }
            }
        };

        renderGroup('week', t('periodic.weekGoalChip'), weeklyGoals);
        renderGroup('month', t('periodic.monthGoalChip'), monthlyGoals);

        summary.addEventListener('click', () => {
            const collapsed = detail.hasClass('tl-periodic-collapsed');
            detail.toggleClass('tl-periodic-collapsed', !collapsed);
            toggle.empty();
            setIcon(toggle, collapsed ? 'chevron-up' : 'chevron-down');
        });
    }

    private renderGoalChip(container: HTMLElement, label: string, count: number): void {
        const chip = container.createSpan({ cls: 'tl-periodic-goal-chip' });
        chip.createSpan({ cls: 'tl-periodic-goal-chip-label', text: label });
        chip.createSpan({ cls: 'tl-periodic-goal-chip-count', text: String(count) });
    }

    private async readVaultFile(path: string): Promise<string | null> {
        const h = this.host;
        const file = h.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return null;
        try {
            return await h.app.vault.cachedRead(file);
        } catch {
            return null;
        }
    }

    private async extractWeeklyGoalLines(path: string): Promise<string[]> {
        const content = await this.readVaultFile(path);
        if (!content) return [];
        return this.host.parseMdTasks(content)
            .filter(item => item.isTask && !item.done)
            .map(item => item.text)
            .filter(Boolean)
            .slice(0, 8);
    }

    private async extractMonthlyGoalLines(path: string): Promise<string[]> {
        const content = await this.readVaultFile(path);
        if (!content) return [];
        const goalSections = [
            t('kanban.monthlyGoals'),
            t('kanban.milestones'),
            '月度目标',
            '关键里程碑',
            'Monthly goals',
            'Key milestones',
        ];
        return this.host.parseMdTasks(content)
            .filter(item => goalSections.some(section => item.section.includes(section)))
            .map(item => item.text)
            .filter(Boolean)
            .slice(0, 8);
    }

    private async renderPlanSuggestion(container: HTMLElement, scope: PlanSuggestionScope, date: moment.Moment): Promise<void> {
        const h = this.host;
        const service = h.plugin.planSuggestionService;
        if (!service) return;

        const cached = await service.getCachedSuggestions(scope, date);
        const hasSuggestions = !!cached && cached.length > 0;
        const section = container.createDiv(
            `tl-plan-suggestion tl-plan-suggestion-${scope} ${hasSuggestions ? '' : 'tl-plan-suggestion-pending'}`.trim(),
        );
        const header = section.createDiv('tl-plan-suggestion-header');
        const mark = header.createSpan({ cls: 'tl-plan-suggestion-mark' });
        setIcon(mark, hasSuggestions ? 'sparkles' : 'clock-3');
        const copy = header.createDiv('tl-plan-suggestion-copy');
        copy.createDiv({
            cls: 'tl-plan-suggestion-title',
            text: scope === 'day'
                ? t('periodic.aiSuggestionDay')
                : scope === 'week'
                    ? t('periodic.aiSuggestionWeek')
                    : t('periodic.aiSuggestionMonth'),
        });
        if (!hasSuggestions) {
            copy.createDiv({
                cls: 'tl-plan-suggestion-meta',
                text: t('periodic.suggestionPending'),
            });
        }

        if (!hasSuggestions) return;

        const linesWrap = section.createDiv('tl-plan-suggestion-lines');
        cached.forEach((line, index) => {
            const item = linesWrap.createDiv('tl-plan-suggestion-item');
            item.createSpan({ cls: 'tl-plan-suggestion-index', text: String(index + 1) });
            item.createDiv({ cls: 'tl-plan-suggestion-text', text: line.replace(/^💡\s*/, '').trim() });
        });
    }

    // ──────────────────────────────────────────────────────
    // Quick Capture (灵感收集)
    // ──────────────────────────────────────────────────────

    /**
     * Render the quick capture section — a persistent cross-day idea inbox.
     * Shows below the daily preview. Items are stored in a standalone file.
     */
    private async renderQuickCapture(container: HTMLElement): Promise<void> {
        const h = this.host;
        const items = await h.plugin.vaultManager.getQuickCaptureItems();

        const section = container.createDiv('tl-capture-section');

        const list = section.createDiv('tl-capture-list');

        if (items.length === 0) {
            list.createDiv({ cls: 'tl-capture-empty', text: t('capture.empty') });
        } else {
            for (const itemText of items) {
                this.renderCaptureItem(list, itemText);
            }
        }

        const inputRow = section.createDiv('tl-capture-input-row');
        const input = inputRow.createEl('input', {
            type: 'text',
            cls: 'tl-capture-input',
            attr: { placeholder: t('capture.placeholder') },
        });
        const addBtn = inputRow.createEl('button', {
            cls: 'tl-capture-add-btn',
            text: '+',
        });

        const doAdd = async () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            await h.plugin.vaultManager.addQuickCaptureItem(text);
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        };

        addBtn.addEventListener('click', () => void doAdd());
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); void doAdd(); }
        });
    }

    /**
     * Render a single quick capture item with edit, delete, and date-promote actions.
     */
    private renderCaptureItem(container: HTMLElement, text: string): void {
        const h = this.host;
        const row = container.createDiv('tl-capture-item');

        // Bullet
        row.createSpan({ cls: 'tl-capture-bullet', text: '·' });

        // Label — edit trigger: dblclick on desktop, single tap on mobile
        const label = row.createSpan({ cls: 'tl-capture-text', text });
        const startEdit = (target: HTMLElement) => {
            const input = this.createDetachedInput();
            input.type = 'text';
            input.value = text;
            input.className = 'tl-capture-edit-input';
            target.replaceWith(input);
            input.focus();
            input.select();
            const save = () => {
                void (async () => {
                    const newText = input.value.trim();
                    if (newText && newText !== text) {
                        await h.plugin.vaultManager.editQuickCaptureItem(text, newText);
                    }
                    h.invalidateTabCache('kanban');
                    h.switchTab('kanban');
                })();
            };
            input.addEventListener('blur', save);
            input.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                if (e.key === 'Escape') { input.value = text; input.blur(); }
            });
        };
        if (Platform.isMobile) {
            label.addEventListener('click', () => startEdit(label));
        } else {
            label.addEventListener('dblclick', () => startEdit(label));
        }

        const actions = row.createSpan({ cls: 'tl-capture-actions' });

        const schedBtn = actions.createEl('button', {
            cls: 'tl-task-action-btn tl-capture-schedule-btn',
            attr: { type: 'button', title: t('capture.addToDate') },
        });
        setIcon(schedBtn, 'calendar-clock');
        const openSchedulePopup = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            this.showCapturePromoteMenu(text, row, schedBtn);
        };
        schedBtn.addEventListener('click', openSchedulePopup);

        const delBtn = actions.createEl('button', {
            cls: 'tl-task-action-btn tl-capture-del-btn',
            attr: { type: 'button', title: t('task.delete') },
        });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            void (async () => {
                await h.plugin.vaultManager.removeQuickCaptureItem(text);
                row.remove();
                // Show empty state if no items left
                const remaining = container.querySelectorAll('.tl-capture-item');
                if (remaining.length === 0) {
                    container.createDiv({ cls: 'tl-capture-empty', text: t('capture.empty') });
                }
            })();
        });
    }

    private showCapturePromoteMenu(text: string, row: HTMLElement, anchorEl: HTMLElement): void {
        const menu = new Menu();
        menu.addItem((item) => {
            item.setTitle(t('capture.dayGoal'))
                .setIcon('sun')
                .onClick(() => {
                    this.openPeriodPicker('day', moment(), picked => {
                        void this.promoteCaptureToDay(text, picked, row);
                    }, anchorEl);
                });
        });
        menu.addItem((item) => {
            item.setTitle(t('capture.weekGoal'))
                .setIcon('calendar-range')
                .onClick(() => {
                    this.openPeriodPicker('week', moment(), picked => {
                        void this.promoteCaptureToWeek(text, picked, row);
                    }, anchorEl);
                });
        });
        menu.addItem((item) => {
            item.setTitle(t('capture.monthGoal'))
                .setIcon('calendar-days')
                .onClick(() => {
                    this.openPeriodPicker('month', moment(), picked => {
                        void this.promoteCaptureToMonth(text, picked, row);
                    }, anchorEl);
                });
        });
        const rect = anchorEl.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
    }

    private openPeriodPicker(
        kind: 'day' | 'week' | 'month',
        defaultDate: moment.Moment,
        onPick: (picked: moment.Moment) => void,
        anchorEl?: HTMLElement,
    ): void {
        this.closePeriodPicker();

        const popup = activeDocument.body.createDiv(`tl-period-picker-popup tl-period-picker-popup-${kind}`);
        this.periodPickerEl = popup;

        const finish = (picked: moment.Moment) => {
            this.closePeriodPicker();
            onPick(moment(picked));
        };

        if (kind === 'month') {
            this.renderMonthPeriodPicker(popup, defaultDate, finish);
        } else {
            this.renderDayWeekPeriodPicker(popup, kind, defaultDate, finish);
        }

        this.positionPeriodPicker(popup, anchorEl);

        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (popup.contains(target) || anchorEl?.contains(target)) return;
            this.closePeriodPicker();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') this.closePeriodPicker();
        };
        window.setTimeout(() => {
            activeDocument.addEventListener('pointerdown', onPointerDown);
            activeDocument.addEventListener('keydown', onKeyDown);
        }, 0);
        this.periodPickerCleanup = () => {
            activeDocument.removeEventListener('pointerdown', onPointerDown);
            activeDocument.removeEventListener('keydown', onKeyDown);
        };
    }

    private closePeriodPicker(): void {
        this.periodPickerCleanup?.();
        this.periodPickerCleanup = null;
        this.periodPickerEl?.remove();
        this.periodPickerEl = null;
    }

    private positionPeriodPicker(popup: HTMLElement, anchorEl?: HTMLElement): void {
        const width = popup.getBoundingClientRect().width || 312;
        const height = popup.getBoundingClientRect().height || 340;
        const pad = 12;
        const viewportWidth = window.innerWidth || 1024;
        const viewportHeight = window.innerHeight || 768;

        if (!anchorEl) {
            popup.style.left = `${Math.max(pad, (viewportWidth - width) / 2)}px`;
            popup.style.top = `${Math.max(pad, (viewportHeight - height) / 2)}px`;
            return;
        }

        const rect = anchorEl.getBoundingClientRect();
        let left = rect.left;
        let top = rect.bottom + 8;
        if (left + width > viewportWidth - pad) left = viewportWidth - width - pad;
        if (left < pad) left = pad;
        if (top + height > viewportHeight - pad) top = rect.top - height - 8;
        if (top < pad) top = pad;
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
    }

    private renderPickerHeader(container: HTMLElement, title: string, onPrev: () => void, onNext: () => void): void {
        const header = container.createDiv('tl-period-picker-header');
        const prev = header.createEl('button', { cls: 'tl-period-picker-nav-btn', attr: { type: 'button' } });
        setIcon(prev, 'chevron-left');
        header.createDiv({ cls: 'tl-period-picker-title', text: title });
        const next = header.createEl('button', { cls: 'tl-period-picker-nav-btn', attr: { type: 'button' } });
        setIcon(next, 'chevron-right');
        prev.addEventListener('click', onPrev);
        next.addEventListener('click', onNext);
    }

    private renderDayWeekPeriodPicker(
        root: HTMLElement,
        kind: 'day' | 'week',
        defaultDate: moment.Moment,
        onPick: (picked: moment.Moment) => void,
    ): void {
        const selected = moment(defaultDate);
        let viewMonth = moment(defaultDate).startOf('month');

        const render = () => {
            root.empty();
            root.createDiv({
                cls: 'tl-period-picker-kicker',
                text: kind === 'day' ? t('periodic.pickDay') : t('periodic.pickWeek'),
            });
            const title = getLanguage() === 'en'
                ? viewMonth.format(viewMonth.year() === moment().year() ? 'MMMM' : 'MMMM YYYY')
                : viewMonth.format(viewMonth.year() === moment().year() ? 'M月' : 'YYYY年M月');
            this.renderPickerHeader(root, title, () => {
                viewMonth = moment(viewMonth).subtract(1, 'month');
                render();
            }, () => {
                viewMonth = moment(viewMonth).add(1, 'month');
                render();
            });

            const selectedWeekStart = moment(selected).startOf('isoWeek').format('YYYY-MM-DD');

            if (kind === 'week') {
                const list = root.createDiv('tl-period-picker-week-list');
                const firstWeek = moment(viewMonth).startOf('month').startOf('isoWeek');
                const lastWeek = moment(viewMonth).endOf('month').startOf('isoWeek');
                for (let week = moment(firstWeek); week.isSameOrBefore(lastWeek, 'day'); week.add(1, 'week')) {
                    const weekStart = moment(week);
                    const weekEnd = moment(weekStart).add(6, 'days');
                    const isSelected = weekStart.format('YYYY-MM-DD') === selectedWeekStart;
                    const isCurrent = weekStart.isSame(moment().startOf('isoWeek'), 'day');
                    const option = list.createEl('button', {
                        cls: [
                            'tl-period-picker-week-option',
                            isSelected ? 'tl-period-picker-week-option-selected' : '',
                            isCurrent ? 'tl-period-picker-week-option-current' : '',
                        ].filter(Boolean).join(' '),
                        attr: { type: 'button' },
                    });
                    const weekLabel = getLanguage() === 'en'
                        ? `Week ${weekStart.isoWeek()}`
                        : `${weekStart.format('M月')}第${this.getWeekOfMonth(weekStart)}周`;
                    option.createSpan({ cls: 'tl-period-picker-week-option-title', text: weekLabel });
                    option.createSpan({
                        cls: 'tl-period-picker-week-option-range',
                        text: `${weekStart.format('M/D')} - ${weekEnd.format('M/D')}`,
                    });
                    option.addEventListener('click', () => onPick(weekStart));
                }
            } else {
                const grid = root.createDiv('tl-period-picker-calendar');
                for (const wd of t('cal.weekdays').split(',')) {
                    grid.createDiv({ cls: 'tl-period-picker-weekday', text: wd });
                }

                const cursor = moment(viewMonth).startOf('month').startOf('isoWeek');
                for (let i = 0; i < 42; i++) {
                    const day = moment(cursor).add(i, 'days');
                    const isOtherMonth = !day.isSame(viewMonth, 'month');
                    const isToday = day.isSame(moment(), 'day');
                    const isSelected = day.isSame(selected, 'day');
                    const cell = grid.createEl('button', {
                        cls: [
                            'tl-period-picker-cell',
                            isOtherMonth ? 'tl-period-picker-cell-muted' : '',
                            isToday ? 'tl-period-picker-cell-today' : '',
                            isSelected ? 'tl-period-picker-cell-selected' : '',
                        ].filter(Boolean).join(' '),
                        text: String(day.date()),
                        attr: { type: 'button' },
                    });
                    cell.addEventListener('click', () => {
                        onPick(moment(day).startOf('day'));
                    });
                }
            }

            const shortcut = root.createEl('button', {
                cls: 'tl-period-picker-shortcut',
                text: kind === 'day' ? t('periodic.todayLabel') : t('periodic.thisWeek'),
                attr: { type: 'button' },
            });
            shortcut.addEventListener('click', () => {
                onPick(kind === 'week' ? moment().startOf('isoWeek') : moment().startOf('day'));
            });
        };

        render();
    }

    private renderMonthPeriodPicker(
        root: HTMLElement,
        defaultDate: moment.Moment,
        onPick: (picked: moment.Moment) => void,
    ): void {
        const selected = moment(defaultDate).startOf('month');
        let viewYear = selected.year();

        const render = () => {
            root.empty();
            root.createDiv({ cls: 'tl-period-picker-kicker', text: t('periodic.pickMonth') });
            this.renderPickerHeader(root, getLanguage() === 'en' ? String(viewYear) : `${viewYear}年`, () => {
                viewYear -= 1;
                render();
            }, () => {
                viewYear += 1;
                render();
            });

            const grid = root.createDiv('tl-period-picker-month-grid');
            for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
                const picked = moment({ year: viewYear, month: monthIndex, date: 1 }).startOf('month');
                const isSelected = picked.isSame(selected, 'month');
                const isCurrent = picked.isSame(moment(), 'month');
                const cell = grid.createEl('button', {
                    cls: [
                        'tl-period-picker-month-cell',
                        isSelected ? 'tl-period-picker-month-cell-selected' : '',
                        isCurrent ? 'tl-period-picker-month-cell-current' : '',
                    ].filter(Boolean).join(' '),
                    text: getLanguage() === 'en' ? picked.format('MMM') : `${monthIndex + 1}月`,
                    attr: { type: 'button' },
                });
                cell.addEventListener('click', () => onPick(picked));
            }

            const shortcut = root.createEl('button', {
                cls: 'tl-period-picker-shortcut',
                text: t('periodic.thisMonth'),
                attr: { type: 'button' },
            });
            shortcut.addEventListener('click', () => onPick(moment().startOf('month')));
        };

        render();
    }

    private async moveRenderedTaskToDay(file: TFile, taskText: string, date: moment.Moment, row: HTMLElement): Promise<void> {
        const h = this.host;
        const target = await h.plugin.vaultManager.getOrCreateDailyNote(date.toDate());
        if (target.path === file.path) return;
        await h.moveTaskToDate(file, taskText, date.toDate());
        row.remove();
    }

    private async moveRenderedTaskToWeek(file: TFile, taskText: string, weekStart: moment.Moment, row: HTMLElement): Promise<void> {
        const h = this.host;
        const weekLabel = `W${String(weekStart.isoWeek()).padStart(2, '0')}`;
        const tmpl = h.plugin.templateManager.getWeeklyPlanTemplate(weekLabel, weekStart.format('YYYY-MM'));
        const target = await h.plugin.vaultManager.getOrCreateWeeklyPlan(weekStart.toDate(), tmpl);
        if (target.path === file.path) return;
        await h.moveTaskToPlan(file, taskText, target.path);
        row.remove();
    }

    private async moveRenderedTaskToMonth(file: TFile, taskText: string, month: moment.Moment, row: HTMLElement): Promise<void> {
        const h = this.host;
        const monthStart = moment(month).startOf('month');
        const monthStr = monthStart.format('YYYY-MM');
        const tmpl = h.plugin.templateManager.getMonthlyPlanTemplate(monthStr);
        const target = await h.plugin.vaultManager.getOrCreateMonthlyPlan(monthStart.toDate(), tmpl);
        if (target.path === file.path) return;
        await h.moveTaskToPlan(file, taskText, target.path);
        row.remove();
    }

    private async finishCapturePromotion(text: string, rowEl: HTMLElement): Promise<void> {
        const h = this.host;
        await h.plugin.vaultManager.removeQuickCaptureItem(text);
        rowEl.remove();
        h.invalidateTabCache('kanban');
        h.switchTab('kanban');
    }

    /**
     * Promote a quick capture item to a task on a specific day.
     * Removes from capture file and adds as - [ ] task to that day's daily note.
     */
    private async promoteCaptureToDay(text: string, date: moment.Moment, rowEl: HTMLElement): Promise<void> {
        const h = this.host;
        await h.plugin.vaultManager.addTaskToDaily(text, date.toDate());
        await this.finishCapturePromotion(text, rowEl);
    }

    /** Promote a quick capture item into the selected week's plan file. */
    private async promoteCaptureToWeek(text: string, date: moment.Moment, rowEl: HTMLElement): Promise<void> {
        const h = this.host;
        const weekStart = moment(date).startOf('isoWeek');
        const weekLabel = `W${String(weekStart.isoWeek()).padStart(2, '0')}`;
        const tmpl = h.plugin.templateManager.getWeeklyPlanTemplate(weekLabel, weekStart.format('YYYY-MM'));
        const file = await h.plugin.vaultManager.getOrCreateWeeklyPlan(weekStart.toDate(), tmpl);
        await h.addMdTask(file, text);
        await this.finishCapturePromotion(text, rowEl);
    }

    /** Promote a quick capture item into the selected month's plan file. */
    private async promoteCaptureToMonth(text: string, date: moment.Moment, rowEl: HTMLElement): Promise<void> {
        const h = this.host;
        const month = moment(date).startOf('month');
        const monthStr = month.format('YYYY-MM');
        const tmpl = h.plugin.templateManager.getMonthlyPlanTemplate(monthStr);
        const file = await h.plugin.vaultManager.getOrCreateMonthlyPlan(month.toDate(), tmpl);
        await h.addMdTask(file, text);
        await this.finishCapturePromotion(text, rowEl);
    }


    /** Extract and render 复盘 sections from daily note content */
    private renderReviewSection(preview: HTMLElement, content: string): void {
        // Find 复盘 section — handle optional blank lines
        let reviewIdx = content.indexOf('## 复盘');
        if (reviewIdx < 0) reviewIdx = content.indexOf('## Review');
        if (reviewIdx < 0) return;

        // Get everything after "## 复盘" until next --- or end
        const reviewLabel = content.indexOf('## 复盘') >= 0 ? '## 复盘' : '## Review';
        let reviewContent = content.substring(reviewIdx + reviewLabel.length);
        const endIdx = reviewContent.indexOf('\n---');
        if (endIdx > 0) reviewContent = reviewContent.substring(0, endIdx);

        if (!reviewContent.trim()) return;

        const section = preview.createDiv('tl-periodic-review-section');
        section.createDiv({ cls: 'tl-periodic-review-label', text: t('periodic.reviewLabel') });

        // Extract sub-sections — use indexOf-based approach for robustness
        const subSections: { icon: string; title: string; heading: string }[] = [
            { icon: '🎯', title: t('insight.sectionGoalAlign'), heading: '### ' + t('insight.sectionGoalAlign') },
            { icon: '🏆', title: t('insight.sectionSuccess'), heading: '### ' + t('insight.sectionSuccess') },
            { icon: '😟', title: t('insight.sectionAnxiety'), heading: '### ' + t('insight.sectionAnxiety') },
            { icon: '📌', title: t('insight.sectionTomorrow'), heading: '### ' + t('insight.sectionTomorrow') },
        ];

        for (const sub of subSections) {
            const idx = reviewContent.indexOf(sub.heading);
            if (idx < 0) continue;

            // Get text between this heading and next ### or end
            let subText = reviewContent.substring(idx + sub.heading.length);
            const nextH = subText.indexOf('\n###');
            if (nextH > 0) subText = subText.substring(0, nextH);

            const lines = subText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            if (lines.length === 0) continue;

            const item = section.createDiv('tl-periodic-review-item');
            item.createSpan({ cls: 'tl-periodic-review-icon', text: sub.icon });
            const textDiv = item.createDiv('tl-periodic-review-text');
            textDiv.createDiv({ cls: 'tl-periodic-review-title', text: sub.title });
            for (const line of lines.slice(0, 2)) {
                textDiv.createDiv({ cls: 'tl-periodic-review-line', text: line.replace(/^\d+\.\s*\*\*.*?\*\*[:：]\s*/, '').replace(/^[-*]\s*/, '') });
            }
        }
    }

    // ──────────────────────────────────────────────────────
    // Week Mode: week selector + weekly plan preview
    // ──────────────────────────────────────────────────────

    private async renderWeekMode(body: HTMLElement): Promise<void> {
        const h = this.host;
        const sel = h.periodicSelectedDate;
        const calMonth = moment(sel).startOf('month').add(h.periodicMonthOffset, 'months');
        const weekStart = moment(sel).startOf('isoWeek');
        const weekTitle = getLanguage() === 'en'
            ? `Week ${weekStart.isoWeek()}`
            : `${sel.format('M月')}第${this.getWeekOfMonth(sel)}周`;
        this.renderPeriodHeader(body, weekTitle);

        if (h.periodicSelectorOpen) {
        // Calendar nav
        const calSection = body.createDiv('tl-periodic-selector');
        const calNav = calSection.createDiv('tl-periodic-cal-nav');
        const prevBtn = calNav.createEl('button', { cls: 'tl-periodic-nav-btn', text: '‹' });
        const compactMonthTitle = getLanguage() === 'en'
            ? (calMonth.year() === moment().year() ? calMonth.format('MMMM') : calMonth.format('MMMM YYYY'))
            : (calMonth.year() === moment().year() ? calMonth.format('M月') : calMonth.format('YYYY年M月'));
        calNav.createSpan({ cls: 'tl-periodic-cal-title', text: compactMonthTitle });
        const nextBtn = calNav.createEl('button', { cls: 'tl-periodic-nav-btn', text: '›' });
        prevBtn.addEventListener('click', () => { h.periodicMonthOffset--; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });
        nextBtn.addEventListener('click', () => { h.periodicMonthOffset++; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        // Mini calendar with week highlights
        const grid = calSection.createDiv('tl-periodic-mini-cal');
        const weekdays = t('cal.weekdays').split(',');
        for (const wd of weekdays) {
            grid.createDiv({ cls: 'tl-periodic-cal-wd', text: wd });
        }

        const firstDay = moment(calMonth).startOf('month');
        const startPad = firstDay.isoWeekday() - 1;
        for (let i = 0; i < startPad; i++) grid.createDiv('tl-periodic-cal-cell tl-periodic-cal-cell-empty');

        const selWeekStart = moment(sel).startOf('isoWeek').format('YYYY-MM-DD');
        const todayStr = moment().format('YYYY-MM-DD');

        for (let d = 1; d <= calMonth.daysInMonth(); d++) {
            const dayMoment = moment(calMonth).date(d);
            const dateStr = dayMoment.format('YYYY-MM-DD');
            const weekStartStr = moment(dayMoment).startOf('isoWeek').format('YYYY-MM-DD');
            const isInSelectedWeek = weekStartStr === selWeekStart;
            const isToday = dateStr === todayStr;

            const cell = grid.createDiv(`tl-periodic-cal-cell ${isInSelectedWeek ? 'tl-periodic-cal-cell-selected tl-periodic-cal-cell-week-highlight' : ''} ${isToday ? 'tl-periodic-cal-cell-today' : ''}`);
            cell.setText(`${d}`);
            cell.addEventListener('click', () => {
                h.periodicSelectedDate = moment(dayMoment);
                h.periodicMonthOffset = 0;
                h.periodicSelectorOpen = !dayMoment.isSame(moment(), 'day');
                h.invalidateTabCache('kanban');
                h.switchTab('kanban');
            });
        }

        // Pad trailing days to complete the last week of the month
        const lastDay = moment(calMonth).endOf('month');
        const trailPad = 7 - lastDay.isoWeekday();
        for (let i = 1; i <= trailPad; i++) {
            const nextMonthDay = moment(lastDay).add(i, 'days');
            const weekStartStr = moment(nextMonthDay).startOf('isoWeek').format('YYYY-MM-DD');
            const isInSelectedWeek = weekStartStr === selWeekStart;

            const cell = grid.createDiv(`tl-periodic-cal-cell tl-periodic-cal-cell-other-month ${isInSelectedWeek ? 'tl-periodic-cal-cell-selected tl-periodic-cal-cell-week-highlight' : ''}`);
            cell.setText(`${nextMonthDay.date()}`);
            cell.addEventListener('click', () => {
                h.periodicSelectedDate = moment(nextMonthDay);
                h.periodicMonthOffset = 0;
                h.periodicSelectorOpen = !nextMonthDay.isSame(moment(), 'day');
                h.invalidateTabCache('kanban');
                h.switchTab('kanban');
            });
        }
        }

        // Preview area: Week plan
        await this.renderWeekPreview(body, weekStart);
    }

    private async renderWeekPreview(body: HTMLElement, weekStart: moment.Moment): Promise<void> {
        const h = this.host;
        const isoWeek = weekStart.isoWeek();
        const weekLabel = `W${String(isoWeek).padStart(2, '0')}`;

        const preview = body.createDiv('tl-periodic-preview tl-periodic-preview-plain');

        // Try load weekly plan file — use consistent path
        const weeklyPath = `${h.plugin.settings.planFolder}/Weekly/${weekStart.isoWeekYear()}-${weekLabel}.md`;
        const weekFile = h.app.vault.getAbstractFileByPath(weeklyPath);

        if (weekFile && weekFile instanceof TFile) {
            const content = await h.app.vault.read(weekFile);

            // Tasks from weekly plan
            const tasks = h.parseMdTasks(content).filter(t => t.isTask);
            const taskSection = preview.createDiv('tl-periodic-task-section');
            if (tasks.length > 0) {
                for (const task of tasks) {
                    this.renderTask(taskSection, task, weekFile, 'week');
                }
            }
            this.renderTaskInput(taskSection, weekFile);
            await this.renderPlanSuggestion(taskSection, 'week', weekStart);
        } else {
            // No weekly file — show task input that auto-creates file
            const taskSection = preview.createDiv('tl-periodic-task-section');
            this.renderTaskInputForWeek(taskSection, weekStart, weekLabel);
            await this.renderPlanSuggestion(taskSection, 'week', weekStart);
        }

        // AI Insight summary for this week
        await this.renderWeeklyInsight(preview, weekStart);

    }

    /** Load and render the AI weekly insight report summary */
    private async renderWeeklyInsight(preview: HTMLElement, weekStart: moment.Moment): Promise<void> {
        const h = this.host;
        const weekNum = weekStart.format('ww');
        const year = weekStart.format('YYYY');
        // Try various naming patterns
        const patterns = [
            `${h.plugin.settings.archiveFolder}/Insights/${t('insight.weeklyFileName', year, weekNum)}`,
            `${h.plugin.settings.archiveFolder}/Insights/${t('insight.weeklyFileName', year, String(parseInt(weekNum, 10)))}`,
        ];

        let insightContent: string | null = null;
        let insightFile: TFile | null = null;
        for (const p of patterns) {
            const f = h.app.vault.getAbstractFileByPath(p);
            if (f && f instanceof TFile) {
                insightContent = await h.app.vault.read(f);
                insightFile = f;
                break;
            }
        }

        if (!insightContent) return;

        const section = preview.createDiv('tl-periodic-insight-section');
        section.createDiv({ cls: 'tl-periodic-insight-label', text: t('periodic.aiWeeklySummary') });

        // Extract key sections from insight report
        const extracts: { icon: string; pattern: RegExp }[] = [
            { icon: '📊', pattern: /### \d+\.\s*(?:本周概览|Weekly Overview)\n([\s\S]*?)(?=###|$)/ },
            { icon: '🏆', pattern: /### \d+\.\s*(?:成功模式|Success Patterns)\n([\s\S]*?)(?=###|$)/ },
            { icon: '💡', pattern: /### \d+\.\s*(?:下周建议|Next Week Suggestions)\n([\s\S]*?)(?=###|$)/ },
        ];

        for (const ex of extracts) {
            const m = insightContent.match(ex.pattern);
            if (m && m[1].trim()) {
                const lines = m[1].trim().split('\n').filter(l => l.trim()).slice(0, 3);
                for (const line of lines) {
                    const itemDiv = section.createDiv('tl-periodic-insight-item');
                    itemDiv.setText(line.replace(/^[-*]\s*\*\*.*?\*\*[:：]?\s*/, '').replace(/^[-*]\s*/, '').replace(/^\d+\.\s*\*\*.*?\*\*[:：]?\s*/, ''));
                }
            }
        }

        // Link to full report
        if (insightFile) {
            const link = section.createDiv('tl-periodic-insight-link');
            link.setText(t('review.viewFullReport'));
            link.addEventListener('click', () => {
                void h.app.workspace.getLeaf().openFile(insightFile);
            });
        }
    }

    // ──────────────────────────────────────────────────────
    // Month Mode: month grid + monthly plan preview
    // ──────────────────────────────────────────────────────

    private async renderMonthMode(body: HTMLElement): Promise<void> {
        const h = this.host;
        const sel = h.periodicSelectedDate;
        const year = sel.year();
        const title = getLanguage() === 'en' ? sel.format('MMMM YYYY') : sel.format('YYYY年M月');
        this.renderPeriodHeader(body, title);

        if (h.periodicSelectorOpen) {
        // Year nav
        const calSection = body.createDiv('tl-periodic-selector');
        const calNav = calSection.createDiv('tl-periodic-cal-nav');
        const prevBtn = calNav.createEl('button', { cls: 'tl-periodic-nav-btn', text: '‹' });
        calNav.createSpan({ cls: 'tl-periodic-cal-title', text: getLanguage() === 'en' ? String(year) : `${year}年` });
        const nextBtn = calNav.createEl('button', { cls: 'tl-periodic-nav-btn', text: '›' });
        prevBtn.addEventListener('click', () => {
                h.periodicSelectedDate = moment(sel).subtract(1, 'year');
                h.periodicSelectorOpen = true;
                h.invalidateTabCache('kanban');
                h.switchTab('kanban');
            });
        nextBtn.addEventListener('click', () => {
                h.periodicSelectedDate = moment(sel).add(1, 'year');
                h.periodicSelectorOpen = true;
                h.invalidateTabCache('kanban');
                h.switchTab('kanban');
            });

        // 3×4 month grid
        const grid = calSection.createDiv('tl-periodic-month-grid');
        const selectedMonth = sel.format('YYYY-MM');
        const currentMonth = moment().format('YYYY-MM');

        for (let m = 1; m <= 12; m++) {
            const monthStr = `${year}-${String(m).padStart(2, '0')}`;
            const isSelected = monthStr === selectedMonth;
            const isCurrent = monthStr === currentMonth;

            // Check if monthly plan exists
            const monthPath = `${h.plugin.settings.planFolder}/Monthly/${monthStr}.md`;
            const hasNote = !!h.app.vault.getAbstractFileByPath(monthPath);

            const cell = grid.createDiv(`tl-periodic-month-cell ${isSelected ? 'tl-periodic-month-cell-selected' : ''} ${isCurrent ? 'tl-periodic-month-cell-current' : ''} ${hasNote ? 'tl-periodic-month-cell-has-note' : ''}`);
            cell.setText(getLanguage() === 'en' ? moment().month(m - 1).format('MMM') : `${m}月`);
            cell.addEventListener('click', () => {
                const picked = moment(`${year}-${String(m).padStart(2, '0')}-01`);
                h.periodicSelectedDate = picked;
                h.periodicSelectorOpen = !picked.isSame(moment(), 'month');
                h.invalidateTabCache('kanban');
                h.switchTab('kanban');
            });
        }
        }

        // Preview area
        await this.renderMonthPreview(body, sel);
    }

    private async renderMonthPreview(body: HTMLElement, date: moment.Moment): Promise<void> {
        const h = this.host;
        const monthStr = date.format('YYYY-MM');

        const preview = body.createDiv('tl-periodic-preview tl-periodic-preview-plain');

        // Load monthly plan
        const monthPath = `${h.plugin.settings.planFolder}/Monthly/${monthStr}.md`;
        const monthFile = h.app.vault.getAbstractFileByPath(monthPath);

        if (monthFile && monthFile instanceof TFile) {
            const content = await h.app.vault.read(monthFile);

            // Extract goals
            const lines = content.split('\n');
            const goalLines: string[] = [];
            let inGoals = false;
            for (const line of lines) {
                if (line.startsWith('## ') || line.startsWith('# ')) {
                    if (inGoals) break;
                    inGoals = true;
                    continue;
                }
                if (inGoals && line.trim() && !line.startsWith('---')) {
                    goalLines.push(line);
                }
            }

            // Tasks from monthly plan
            const tasks = h.parseMdTasks(content).filter(t => t.isTask);
            const taskSection = preview.createDiv('tl-periodic-task-section');
            if (tasks.length > 0) {
                for (const task of tasks) {
                    this.renderTask(taskSection, task, monthFile, 'month');
                }
            }
            this.renderTaskInput(taskSection, monthFile);
            if (goalLines.length > 0) {
                const goalsDiv = preview.createDiv('tl-periodic-goals');
                goalsDiv.createDiv({ cls: 'tl-periodic-goals-label', text: t('periodic.monthGoals') });
                for (const g of goalLines.slice(0, 8)) {
                    goalsDiv.createDiv({ cls: 'tl-periodic-goal-line', text: g.replace(/^[-*]\s*/, '') });
                }
            }
            await this.renderPlanSuggestion(preview, 'month', date);
        } else {
            // No monthly file — show task input that auto-creates file
            const taskSection = preview.createDiv('tl-periodic-task-section');
            this.renderTaskInputForMonth(taskSection, date);
            await this.renderPlanSuggestion(preview, 'month', date);
        }

    }

    // ──────────────────────────────────────────────────────
    // Shared task renderer & input (Things/TickTick style)
    // ──────────────────────────────────────────────────────

    private renderTask(container: HTMLElement, task: { text: string; done: boolean; indent: number }, file: TFile, scope: 'day' | 'week' | 'month' = 'day', sourceDate?: moment.Moment): void {
        const h = this.host;
        const row = container.createDiv(`tl-periodic-task-row ${task.done ? 'tl-periodic-task-row-done' : ''}`);
        row.dataset.taskText = task.text;
        row.dataset.taskIndent = String(task.indent);
        row.setAttribute('draggable', 'false');
        if (task.indent > 0) {
            row.addClass('tl-periodic-task-subtask');
            row.style.setProperty('--tl-indent-pad', `${20 + task.indent * 20}px`);
        }

        // Checkbox
        const cb = row.createEl('input', { type: 'checkbox' });
        cb.checked = task.done;
        cb.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            void (async () => {
                await h.toggleMdTask(file, task.text, task.done);
                task.done = !task.done;
                cb.checked = task.done;
                row.toggleClass('tl-periodic-task-row-done', task.done);
                label.toggleClass('tl-text-done', task.done);
                h.invalidateTabCache('kanban');
                void h.switchTab('kanban');
            })();
        });

        // Label — edit trigger: dblclick on desktop, single tap on mobile
        const label = row.createSpan({ cls: 'tl-periodic-task-text', text: task.text });
        if (task.done) {
            label.addClass('tl-text-done');
        }
        const startEdit = (target: HTMLElement) => {
            const input = this.createDetachedInput();
            input.type = 'text';
            input.value = task.text;
            input.className = 'tl-task-edit-input';
            target.replaceWith(input);
            input.focus();
            input.select();
            const save = () => {
                void (async () => {
                    const newText = input.value.trim();
                    if (newText && newText !== task.text) {
                        await h.editMdTask(file, task.text, newText);
                        task.text = newText;
                    }
                    const newLabel = this.createDetachedSpan();
                    newLabel.className = 'tl-periodic-task-text';
                    newLabel.textContent = task.text;
                    input.replaceWith(newLabel);
                    // Re-attach edit listener
                    if (Platform.isMobile) {
                        newLabel.addEventListener('click', () => startEdit(newLabel));
                    } else {
                        newLabel.addEventListener('dblclick', () => startEdit(newLabel));
                    }
                })();
            };
            input.addEventListener('blur', save);
            input.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                if (e.key === 'Escape') { input.value = task.text; input.blur(); }
            });
        };
        if (Platform.isMobile) {
            label.addEventListener('click', () => startEdit(label));
        } else {
            label.addEventListener('dblclick', () => startEdit(label));
        }

        const actions = row.createSpan({ cls: 'tl-task-actions' });

        const createDeleteButton = () => {
            const delBtn = actions.createEl('button', {
                cls: 'tl-task-action-btn tl-task-delete-btn',
                attr: { type: 'button', title: t('task.delete') },
            });
            setIcon(delBtn, 'trash-2');
            delBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                void (async () => {
                    await h.deleteMdTask(file, task.text);
                    row.remove();
                })();
            });
        };

        if (task.done) {
            createDeleteButton();
            return;
        }

        let dateBtn: HTMLButtonElement;
        const openReschedulePicker = () => {
            if (scope === 'day') {
                const defaultDate = sourceDate ? moment(sourceDate) : moment(h.periodicSelectedDate);
                this.openPeriodPicker('day', defaultDate, picked => {
                    void this.moveRenderedTaskToDay(file, task.text, picked, row);
                }, dateBtn);
            } else if (scope === 'week') {
                this.openPeriodPicker('week', moment(h.periodicSelectedDate).startOf('isoWeek'), picked => {
                    void this.moveRenderedTaskToWeek(file, task.text, picked.startOf('isoWeek'), row);
                }, dateBtn);
            } else {
                this.openPeriodPicker('month', moment(h.periodicSelectedDate).startOf('month'), picked => {
                    void this.moveRenderedTaskToMonth(file, task.text, picked.startOf('month'), row);
                }, dateBtn);
            }
        };

        // Add sub-task button
        const subBtn = actions.createEl('button', {
            cls: 'tl-task-action-btn tl-task-sub-btn',
            attr: { type: 'button', title: t('task.addSubtask') },
        });
        setIcon(subBtn, 'plus');
        subBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = row.nextElementSibling;
            if (next instanceof HTMLElement && next.classList.contains('tl-subtask-input-row')) return;
            const subRow = this.createDetachedDiv();
            subRow.className = 'tl-subtask-input-row';
            const subInput = subRow.createEl('input');
            subInput.type = 'text';
            subInput.className = 'tl-periodic-task-input tl-subtask-input';
            subInput.placeholder = t('task.subtaskPlaceholder');
            subRow.appendChild(subInput);
            row.after(subRow);
            subInput.focus();

            let subInputClosed = false;
            const closeSubInput = (commit: boolean) => {
                if (subInputClosed) return;
                subInputClosed = true;
                void (async () => {
                    const text = subInput.value.trim();
                    subRow.remove();
                    if (!commit || !text) return;
                    await h.addSubTask(file, task.text, text, task.indent);
                    h.invalidateTabCache('kanban');
                    h.switchTab('kanban');
                })();
            };
            subInput.addEventListener('blur', () => closeSubInput(true));
            subInput.addEventListener('keydown', (ke: KeyboardEvent) => {
                if (ke.key === 'Enter') {
                    ke.preventDefault();
                    closeSubInput(true);
                }
                if (ke.key === 'Escape') {
                    ke.preventDefault();
                    closeSubInput(false);
                }
            });
        });

        // Date button — explicit reschedule affordance, aligned with quick capture.
        dateBtn = actions.createEl('button', {
            cls: 'tl-task-action-btn tl-task-date-inline-btn',
            attr: { type: 'button', title: t('periodic.dateLabel') },
        });
        setIcon(dateBtn, 'calendar-clock');
        dateBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openReschedulePicker();
        });

        // Drag handle — right side, after action buttons
        const handle = actions.createEl('button', {
            cls: 'tl-task-action-btn tl-task-drag-handle',
            attr: { type: 'button', title: t('periodic.dragToReorder') },
        });
        setIcon(handle, 'grip-vertical');

        // Delete button — destructive action stays last.
        createDeleteButton();
        if (Platform.isMobile) {
            // Touch drag-and-drop for mobile
            let touchStartY = 0;
            let touchDragging = false;
            let touchClone: HTMLElement | null = null;
            handle.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                const touch = e.touches[0];
                touchStartY = touch.clientY;
                touchDragging = false;
            }, { passive: true });
            handle.addEventListener('touchmove', (e) => {
                const touch = e.touches[0];
                if (!touchDragging && Math.abs(touch.clientY - touchStartY) > 8) {
                    touchDragging = true;
                    row.addClass('tl-task-row-dragging');
                    // Create a floating clone for visual feedback
                    touchClone = row.cloneNode(true) as HTMLElement;
                    touchClone.addClass('tl-touch-drag-clone');
                    touchClone.setCssProps({ '--tl-drag-left': `${row.getBoundingClientRect().left}px`, '--tl-drag-width': `${row.getBoundingClientRect().width}px` });
                    activeDocument.body.appendChild(touchClone);
                }
                if (touchDragging) {
                    e.preventDefault(); // Prevent scroll during drag
                    if (touchClone) {
                        touchClone.setCssProps({ '--tl-drag-top': `${touch.clientY - 22}px` });
                    }
                    // Highlight drop target
                    const parent = row.parentElement;
                    if (parent) {
                        parent.querySelectorAll('.tl-periodic-task-row').forEach(r => {
                            r.removeClass('tl-task-row-drop-above', 'tl-task-row-drop-below');
                        });
                        const target = activeDocument.elementFromPoint(touch.clientX, touch.clientY)?.closest('.tl-periodic-task-row') as HTMLElement | null;
                        if (target && target !== row && parent.contains(target)) {
                            const rect = target.getBoundingClientRect();
                            if (touch.clientY < rect.top + rect.height / 2) {
                                target.addClass('tl-task-row-drop-above');
                            } else {
                                target.addClass('tl-task-row-drop-below');
                            }
                        }
                    }
                }
            }, { passive: false });
            handle.addEventListener('touchend', (e) => {
                if (touchClone) { touchClone.remove(); touchClone = null; }
                row.removeClass('tl-task-row-dragging');
                if (!touchDragging) return;
                touchDragging = false;
                const parent = row.parentElement;
                if (!parent) return;
                // Find drop target
                const touch = e.changedTouches[0];
                parent.querySelectorAll('.tl-periodic-task-row').forEach(r => {
                    r.removeClass('tl-task-row-drop-above', 'tl-task-row-drop-below');
                });
                const target = activeDocument.elementFromPoint(touch.clientX, touch.clientY)?.closest('.tl-periodic-task-row') as HTMLElement | null;
                if (!target || target === row || !parent.contains(target)) return;
                const targetText = target.dataset.taskText;
                if (!targetText || targetText === task.text) return;
                // Reorder
                void (async () => {
                    if (task.indent > 0) {
                        await h.setTaskIndent(file, task.text, 0);
                    }
                    const rows = Array.from(parent.querySelectorAll('.tl-periodic-task-row'));
                    const texts = rows.map(r => (r as HTMLElement).dataset.taskText || '').filter(t => t);
                    const fromIdx = texts.indexOf(task.text);
                    const toIdx = texts.indexOf(targetText);
                    if (fromIdx >= 0 && toIdx >= 0) {
                        texts.splice(fromIdx, 1);
                        texts.splice(toIdx, 0, task.text);
                        await h.reorderMdTasks(file, texts);
                        h.invalidateTabCache('kanban');
                        h.switchTab('kanban');
                    }
                })();
            }, { passive: true });
        } else {
            // Desktop: mousedown activates HTML5 drag
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                row.setAttribute('draggable', 'true');
                activeDocument.addEventListener('mouseup', () => row.setAttribute('draggable', 'false'), { once: true });
            });
        }
        row.addEventListener('dragend', () => row.setAttribute('draggable', 'false'));

        // Defer-to-today button — only for uncompleted tasks on past dates
        if (sourceDate && !task.done && sourceDate.isBefore(moment(), 'day')) {
            const deferBtn = row.createSpan({ cls: 'tl-task-defer-btn', attr: { title: t('periodic.deferToday') } });
            setIcon(deferBtn, 'forward');
            deferBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                void (async () => {
                    await h.deferTaskToToday(file, task.text);
                    row.remove();
                })();
            });
        }

        // Right-click / long-press mirrors the visible date button.
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openReschedulePicker();
        });

        // Mobile: long-press (500ms) to open date popup
        if (Platform.isMobile) {
            let longPressTimer: number | null = null;
            row.addEventListener('touchstart', () => {
                longPressTimer = window.setTimeout(() => {
                    openReschedulePicker();
                }, 500);
            }, { passive: true });
            row.addEventListener('touchmove', () => {
                if (longPressTimer) { window.clearTimeout(longPressTimer); longPressTimer = null; }
            }, { passive: true });
            row.addEventListener('touchend', () => {
                if (longPressTimer) { window.clearTimeout(longPressTimer); longPressTimer = null; }
            }, { passive: true });
        }

        // Drag & drop: default = reorder (subtasks auto-promote), hover 1s = nest
        let nestTimer: number | null = null;
        let nestMode = false;

        const clearDragState = () => {
            if (nestTimer) { window.clearTimeout(nestTimer); nestTimer = null; }
            nestMode = false;
            row.removeClass('tl-task-row-drop-above', 'tl-task-row-drop-below', 'tl-task-row-nest-hint');
        };

        row.addEventListener('dragstart', (e) => {
            e.dataTransfer?.setData('text/plain', task.text);
            e.dataTransfer?.setData('text/x-indent', String(task.indent));
            row.addClass('tl-task-row-dragging');
        });
        row.addEventListener('dragend', () => {
            row.removeClass('tl-task-row-dragging');
            clearDragState();
        });
        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            // If already in nest mode, keep it
            if (nestMode) return;

            // Show reorder indicator
            row.removeClass('tl-task-row-drop-above', 'tl-task-row-drop-below');
            const rect = row.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                row.addClass('tl-task-row-drop-above');
            } else {
                row.addClass('tl-task-row-drop-below');
            }

            // Start nest timer (1s hover → nest mode)
            if (!nestTimer) {
                nestTimer = window.setTimeout(() => {
                    nestMode = true;
                    row.removeClass('tl-task-row-drop-above', 'tl-task-row-drop-below');
                    row.addClass('tl-task-row-nest-hint');
                }, 1000);
            }
        });
        row.addEventListener('dragleave', () => {
            clearDragState();
        });
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            const wasNest = nestMode;
            clearDragState();
            const draggedText = e.dataTransfer?.getData('text/plain');
            if (!draggedText || draggedText === task.text) return;
            const draggedIndent = parseInt(e.dataTransfer?.getData('text/x-indent') || '0', 10);

            void (async () => {
                if (wasNest) {
                    // Nest: make sub-task
                    await h.deleteMdTask(file, draggedText);
                    await h.addSubTask(file, task.text, draggedText, task.indent);
                    h.invalidateTabCache('kanban');
                    h.switchTab('kanban');
                } else {
                    // Reorder — if dragged item is a subtask, auto-promote first
                    if (draggedIndent > 0) {
                        await h.setTaskIndent(file, draggedText, 0);
                    }
                    const parent = row.parentElement;
                    if (!parent) return;
                    const rows = Array.from(parent.querySelectorAll('.tl-periodic-task-row'));
                    const texts = rows.map(r => (r as HTMLElement).dataset.taskText || '').filter(t => t);
                    const fromIdx = texts.indexOf(draggedText);
                    const toIdx = texts.indexOf(task.text);
                    if (fromIdx >= 0 && toIdx >= 0) {
                        texts.splice(fromIdx, 1);
                        texts.splice(toIdx, 0, draggedText);
                        await h.reorderMdTasks(file, texts);
                        h.invalidateTabCache('kanban');
                        h.switchTab('kanban');
                    }
                }
            })();
        });
    }

    /** Inline task-add input */
    private renderTaskInput(container: HTMLElement, file: TFile): void {
        const h = this.host;
        const row = container.createDiv('tl-periodic-task-input-row');
        const input = row.createEl('input', {
            type: 'text',
            cls: 'tl-periodic-task-input',
            attr: { placeholder: t('periodic.addTaskPlaceholder') },
        });
        const addBtn = row.createEl('button', {
            cls: 'tl-periodic-task-add-btn',
            text: '+',
        });

        const doAdd = async () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            await h.addMdTask(file, text);
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        };

        addBtn.addEventListener('click', () => void doAdd());
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); void doAdd(); }
        });
    }

    /** Task input that auto-creates the daily note file */
    private renderTaskInputForDate(container: HTMLElement, date: moment.Moment): void {
        const h = this.host;
        const row = container.createDiv('tl-periodic-task-input-row');
        const input = row.createEl('input', {
            type: 'text',
            cls: 'tl-periodic-task-input',
            attr: { placeholder: t('periodic.addTaskPlaceholder') },
        });
        const addBtn = row.createEl('button', {
            cls: 'tl-periodic-task-add-btn',
            text: '+',
        });

        const doAdd = async () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            // Auto-create daily note if needed
            const file = await h.plugin.vaultManager.getOrCreateDailyNote(date.toDate());
            await h.addMdTask(file, text);
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        };

        addBtn.addEventListener('click', () => void doAdd());
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); void doAdd(); }
        });
    }

    /** Task input that auto-creates the weekly plan file */
    private renderTaskInputForWeek(container: HTMLElement, weekStart: moment.Moment, weekLabel: string): void {
        const h = this.host;
        const row = container.createDiv('tl-periodic-task-input-row');
        const input = row.createEl('input', {
            type: 'text',
            cls: 'tl-periodic-task-input',
            attr: { placeholder: t('periodic.addWeekTaskPlaceholder') },
        });
        const addBtn = row.createEl('button', {
            cls: 'tl-periodic-task-add-btn',
            text: '+',
        });

        const doAdd = async () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            const tmpl = h.plugin.templateManager.getWeeklyPlanTemplate(weekLabel, weekStart.format('YYYY-MM'));
            const file = await h.plugin.vaultManager.getOrCreateWeeklyPlan(weekStart.toDate(), tmpl);
            await h.addMdTask(file, text);
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        };

        addBtn.addEventListener('click', () => void doAdd());
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); void doAdd(); }
        });
    }

    /** Task input that auto-creates the monthly plan file */
    private renderTaskInputForMonth(container: HTMLElement, date: moment.Moment): void {
        const h = this.host;
        const monthStr = date.format('YYYY-MM');
        const row = container.createDiv('tl-periodic-task-input-row');
        const input = row.createEl('input', {
            type: 'text',
            cls: 'tl-periodic-task-input',
            attr: { placeholder: t('periodic.addMonthTaskPlaceholder') },
        });
        const addBtn = row.createEl('button', {
            cls: 'tl-periodic-task-add-btn',
            text: '+',
        });

        const doAdd = async () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            const tmpl = h.plugin.templateManager.getMonthlyPlanTemplate(monthStr);
            const file = await h.plugin.vaultManager.getOrCreateMonthlyPlan(date.toDate(), tmpl);
            await h.addMdTask(file, text);
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        };

        addBtn.addEventListener('click', () => void doAdd());
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); void doAdd(); }
        });
    }
}
