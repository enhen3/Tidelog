/**
 * Chat View - Sidebar chat interface for AI interactions
 */
import { ItemView, MarkdownRenderer, TFile, setIcon, moment, } from 'obsidian';
import { t, getLanguage } from '../i18n';
import { MorningSOP } from '../sop/morning-sop';
import { EveningSOP } from '../sop/evening-sop';
import { PeriodicRenderer } from './periodic-renderer';
import { ReviewRenderer } from './review-renderer';
import { ChatController } from './chat-controller';
import { ProModal } from './pro-modal';
export const CHAT_VIEW_TYPE = 'tl-chat-view';
export class ChatView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.messages = [];
        this.sopContext = {
            type: 'none',
            currentStep: 0,
            responses: {},
        };
        this.isProcessing = false;
        // Task input mode
        this.taskInputContainer = null;
        this.taskData = [];
        this.isTaskInputMode = false;
        this.quickUpdateMode = false;
        // Tab system
        this.activeTab = 'chat';
        this.kanbanWeekOffset = 0;
        this.kanbanMonthOffset = 0;
        this.kanbanDayOffset = 0;
        this.calendarMonth = moment();
        this.calendarViewMode = 'month';
        this.calendarWeekOffset = 0;
        // Periodic navigator state
        this.periodicMode = 'day';
        this.periodicSelectedDate = moment();
        this.periodicMonthOffset = 0;
        // Live refresh
        this.vaultModifyRef = null;
        this.refreshTimer = null;
        this._suppressRefresh = false;
        this.plugin = plugin;
        this.morningSOP = new MorningSOP(plugin);
        this.eveningSOP = new EveningSOP(plugin);
        this.periodicRenderer = new PeriodicRenderer(this);
        this.reviewRenderer = new ReviewRenderer(this);
        this.chatController = new ChatController(this);
    }
    getViewType() {
        return CHAT_VIEW_TYPE;
    }
    getDisplayText() {
        return 'TideLog';
    }
    getIcon() {
        return 'tidelog-wave';
    }
    async onOpen() {
        const container = this.contentEl;
        container.empty();
        container.addClass('tl-chat-container');
        // Tab bar (top-level navigation — no header)
        this.renderTabBar(container);
        // Tab content area
        this.tabContentEl = container.createDiv('tl-tab-content');
        // Chat panel (SOP buttons + messages + input)
        this.chatPanel = this.tabContentEl.createDiv('tl-tab-panel tl-tab-panel-chat');
        this.renderSOPButtons(this.chatPanel);
        this.messagesContainer = this.chatPanel.createDiv('tl-messages');
        this.renderInputArea(this.chatPanel);
        this.showWelcomeMessage();
        // Switch to Plan tab by default
        this.switchTab('kanban');
        // Live refresh: re-render kanban when vault files change
        this.vaultModifyRef = this.app.vault.on('modify', (file) => {
            if (this._suppressRefresh)
                return;
            if (this.activeTab !== 'kanban' && this.activeTab !== 'review')
                return;
            if (!(file instanceof TFile) || file.extension !== 'md')
                return;
            // Debounce to avoid re-render storm
            if (this.refreshTimer)
                clearTimeout(this.refreshTimer);
            this.refreshTimer = setTimeout(() => {
                this.switchTab(this.activeTab, false);
            }, 500);
        });
        this.registerEvent(this.vaultModifyRef);
    }
    async onClose() {
        if (this.refreshTimer)
            clearTimeout(this.refreshTimer);
    }
    /**
     * Render the header with SOP mode buttons
     */
    renderHeader(container) {
        const header = container.createDiv('tl-header');
        const title = header.createDiv('tl-title');
        const iconSpan = title.createSpan('tl-title-icon');
        setIcon(iconSpan, 'tidelog-wave');
        title.createSpan({ text: 'TideLog' });
    }
    /**
     * Render SOP buttons inside the chat panel only
     */
    renderSOPButtons(container) {
        const buttons = container.createDiv('tl-header-buttons');
        const eveningBtn = buttons.createEl('button', {
            cls: 'tl-mode-btn tl-mode-btn-review',
        });
        setIcon(eveningBtn, 'moon');
        eveningBtn.createSpan({ text: 'Review' });
        eveningBtn.addEventListener('click', () => this.startSOP('evening'));
        const insightBtn = buttons.createEl('button', {
            cls: 'tl-mode-btn tl-mode-btn-insight',
        });
        setIcon(insightBtn, 'lightbulb');
        insightBtn.createSpan({ text: 'Insight' });
        insightBtn.addEventListener('click', () => this.startFreeChat());
    }
    // =========================================================================
    // Tab bar
    // =========================================================================
    renderTabBar(container) {
        const tabBarWrap = container.createDiv('tl-tab-bar-wrap');
        this.tabBarEl = tabBarWrap.createDiv('tl-tab-bar');
        const tabs = [
            { id: 'kanban', emoji: '☀️', label: 'Plan' },
            { id: 'chat', emoji: '🌙', label: 'Review' },
            { id: 'review', emoji: '🌓', label: 'Insights' },
        ];
        for (const tab of tabs) {
            const btn = this.tabBarEl.createEl('button', {
                cls: `tl-tab-btn ${tab.id === this.activeTab ? 'tl-tab-btn-active' : ''}`,
                attr: { 'data-tab': tab.id },
            });
            btn.createEl('span', { cls: 'tl-tab-btn-icon', text: tab.emoji });
            btn.createEl('span', { cls: 'tl-tab-btn-label', text: tab.label });
            btn.addEventListener('click', () => this.switchTab(tab.id, true));
        }
    }
    switchTab(tab, animate = false) {
        this.activeTab = tab;
        // Cancel any pending debounced refresh to prevent queued re-renders
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        // Update tab bar active state
        this.tabBarEl.querySelectorAll('.tl-tab-btn').forEach(btn => {
            btn.removeClass('tl-tab-btn-active');
            if (btn.getAttribute('data-tab') === tab) {
                btn.addClass('tl-tab-btn-active');
            }
        });
        if (tab === 'chat') {
            this.chatPanel.removeClass('tl-hidden');
            // Remove non-chat panels
            this.tabContentEl.querySelectorAll('.tl-tab-panel:not(.tl-tab-panel-chat)').forEach(el => el.remove());
        }
        else {
            this.chatPanel.addClass('tl-hidden');
            // Remove stale panels immediately to prevent double-calendar flash
            this.tabContentEl.querySelectorAll('.tl-tab-panel:not(.tl-tab-panel-chat)').forEach(el => el.remove());
            // Build new panel
            const panel = this.tabContentEl.createDiv('tl-tab-panel');
            if (animate)
                panel.addClass('tl-tab-panel-animate');
            // Suppress vault-modify re-renders while this render is in progress
            this._suppressRefresh = true;
            const render = (tab === 'kanban')
                ? this.renderKanbanTab(panel)
                : this.renderReviewTab(panel);
            void render.finally(() => {
                this._suppressRefresh = false;
            });
        }
    }
    // =========================================================================
    // Shared helpers for task parsing / toggling
    // =========================================================================
    /**
     * Parse markdown content into structured items.
     * Filters out empty/placeholder items (e.g. "第一周：" with no content).
     */
    parseMdTasks(content) {
        const items = [];
        let section = '';
        const isSubstantive = (t) => {
            const stripped = t.replace(/[：:]/g, '').trim();
            if (stripped.length < 2)
                return false;
            if (/^第.{1,2}周$/.test(stripped))
                return false;
            return true;
        };
        const calcIndent = (ws) => {
            const tabs = (ws.match(/\t/g) || []).length;
            const spaces = ws.replace(/\t/g, '').length;
            return tabs + Math.floor(spaces / 2);
        };
        for (const line of content.split('\n')) {
            if (line.startsWith('## ') || line.startsWith('### ')) {
                section = line.replace(/^#{2,3}\s+/, '').trim();
                continue;
            }
            const taskM = line.match(/^(\s*)- \[([ x])\] (.+)$/);
            if (taskM) {
                const txt = taskM[3].trim();
                if (isSubstantive(txt)) {
                    items.push({ text: txt, done: taskM[2] === 'x', isTask: true, section, indent: calcIndent(taskM[1]) });
                }
                continue;
            }
            const numM = line.match(/^(\s*)\d+\.\s+(.+)$/);
            if (numM && numM[2].trim() && isSubstantive(numM[2].trim())) {
                let numText = numM[2].trim();
                // Handle numbered items with checkbox markers: 1. [x] text / 1. [ ] text
                const numTaskM = numText.match(/^\[([ x])\]\s*(.+)$/);
                if (numTaskM) {
                    items.push({ text: numTaskM[2].trim(), done: numTaskM[1] === 'x', isTask: true, section, indent: calcIndent(numM[1]) });
                }
                else {
                    items.push({ text: numText, done: false, isTask: false, section, indent: calcIndent(numM[1]) });
                }
                continue;
            }
            const bulletM = line.match(/^(\s*)- (.+)$/);
            if (bulletM && bulletM[2].trim() && isSubstantive(bulletM[2].trim())) {
                const txt = bulletM[2].trim();
                // Skip empty/near-empty checkboxes that slipped past the task regex
                if (/^\[[\sx]?\]/.test(txt))
                    continue;
                items.push({ text: txt, done: false, isTask: false, section, indent: calcIndent(bulletM[1]) });
            }
        }
        return items;
    }
    async toggleMdTask(file, taskText, wasDone) {
        this._suppressRefresh = true;
        try {
            let content = await this.app.vault.read(file);
            const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const oldMark = wasDone ? 'x' : ' ';
            const newMark = wasDone ? ' ' : 'x';
            // Support indented tasks (leading whitespace)
            const pat = new RegExp(`^(\\s*)- \\[${oldMark}\\] ${escaped}$`, 'm');
            const match = content.match(pat);
            if (match) {
                content = content.replace(pat, `${match[1]}- [${newMark}] ${taskText}`);
            }
            else {
                // Try matching numbered list item and convert to checkbox
                const numPat = new RegExp(`^(\\s*)\\d+\\.\\s+${escaped}$`, 'm');
                const numMatch = content.match(numPat);
                if (numMatch) {
                    content = content.replace(numPat, `${numMatch[1]}- [${newMark}] ${taskText}`);
                }
                else {
                    // Try matching plain bullet and convert to checkbox
                    const bulletPat = new RegExp(`^(\\s*)- ${escaped}$`, 'm');
                    const bulletMatch = content.match(bulletPat);
                    if (bulletMatch) {
                        content = content.replace(bulletPat, `${bulletMatch[1]}- [${newMark}] ${taskText}`);
                    }
                }
            }
            await this.app.vault.modify(file, content);
        }
        finally {
            // Delay clearing the flag so the vault 'modify' event (async) is suppressed
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }
    /**
     * Append a new task to a markdown file.
     * Inserts after the last existing task line, or at the end.
     */
    async addMdTask(file, taskText, indent = 0) {
        this._suppressRefresh = true;
        try {
            let content = await this.app.vault.read(file);
            const prefix = '  '.repeat(indent);
            const newLine = `${prefix}- [ ] ${taskText}`;
            const lines = content.split('\n');
            // Find the last task line index
            let lastTaskIdx = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].match(/^\s*- \[[ x]\] /)) {
                    lastTaskIdx = i;
                }
            }
            if (lastTaskIdx >= 0) {
                lines.splice(lastTaskIdx + 1, 0, newLine);
            }
            else {
                lines.push(newLine);
            }
            await this.app.vault.modify(file, lines.join('\n'));
        }
        finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }
    /** Insert a sub-task (indented) directly after a parent task */
    async addSubTask(file, parentText, subTaskText) {
        this._suppressRefresh = true;
        try {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            const escaped = parentText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^(\\s*- \\[[ x]\\] )${escaped}$`);
            let parentIdx = -1;
            for (let i = 0; i < lines.length; i++) {
                if (pat.test(lines[i])) {
                    parentIdx = i;
                    break;
                }
            }
            if (parentIdx >= 0) {
                lines.splice(parentIdx + 1, 0, `  - [ ] ${subTaskText}`);
                await this.app.vault.modify(file, lines.join('\n'));
            }
        }
        finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }
    /** Edit a task's text in a markdown file */
    async editMdTask(file, oldText, newText) {
        this._suppressRefresh = true;
        try {
            let content = await this.app.vault.read(file);
            const escaped = oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^(\\s*- \\[[ x]\\] )${escaped}$`, 'm');
            content = content.replace(pat, `$1${newText}`);
            await this.app.vault.modify(file, content);
        }
        finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }
    /** Delete a task line from a markdown file */
    async deleteMdTask(file, taskText) {
        this._suppressRefresh = true;
        try {
            let content = await this.app.vault.read(file);
            const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^\\s*- \\[[ x]\\] ${escaped}\\n?`, 'm');
            content = content.replace(pat, '');
            await this.app.vault.modify(file, content);
        }
        finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }
    /** Defer a task from a source file to today's daily note */
    async deferTaskToToday(sourceFile, taskText) {
        this._suppressRefresh = true;
        try {
            // Get or create today's daily note
            const todayNote = await this.plugin.vaultManager.getOrCreateDailyNote();
            // Add the task to today's note
            await this.addMdTask(todayNote, taskText);
            // Remove from source file
            let content = await this.app.vault.read(sourceFile);
            const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^\\s*- \\[[ x]\\] ${escaped}\\n?`, 'm');
            content = content.replace(pat, '');
            await this.app.vault.modify(sourceFile, content);
            // Refresh the view
            this.invalidateTabCache('kanban');
            this.switchTab('kanban');
        }
        finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }
    /** Move a task from a source file to a specific target date's daily note */
    async moveTaskToDate(sourceFile, taskText, targetDate) {
        this._suppressRefresh = true;
        try {
            const targetNote = await this.plugin.vaultManager.getOrCreateDailyNote(targetDate);
            // Don't move if source and target are the same file
            if (sourceFile.path === targetNote.path)
                return;
            await this.addMdTask(targetNote, taskText);
            // Remove from source file
            let content = await this.app.vault.read(sourceFile);
            const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^\\s*- \\[[ x]\\] ${escaped}\\n?`, 'm');
            content = content.replace(pat, '');
            await this.app.vault.modify(sourceFile, content);
            this.invalidateTabCache('kanban');
            this.switchTab('kanban');
        }
        finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }
    /** Change the indent level of a task (promote/demote) */
    async setTaskIndent(file, taskText, newIndent) {
        this._suppressRefresh = true;
        try {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^(\\s*)- (\\[[ x]\\] )${escaped}$`);
            const indent = Math.max(0, newIndent);
            const prefix = '  '.repeat(indent);
            for (let i = 0; i < lines.length; i++) {
                if (pat.test(lines[i])) {
                    const m = lines[i].match(pat);
                    if (m) {
                        lines[i] = `${prefix}- ${m[2]}${taskText}`;
                        break;
                    }
                }
            }
            await this.app.vault.modify(file, lines.join('\n'));
        }
        finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }
    /** Reorder all task lines in a markdown file by the given text order */
    async reorderMdTasks(file, orderedTexts) {
        this._suppressRefresh = true;
        try {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            // Collect all task lines and their positions
            const taskEntries = [];
            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(/^(\s*- \[[ x]\] )(.+)$/);
                if (m)
                    taskEntries.push({ idx: i, line: lines[i], text: m[2] });
            }
            if (taskEntries.length < 2)
                return;
            // Build reordered lines following the requested text order
            const reordered = [];
            for (const txt of orderedTexts) {
                const found = taskEntries.find(t => t.text === txt && !reordered.includes(t.line));
                if (found)
                    reordered.push(found.line);
            }
            // Append any tasks not in the ordered list
            for (const t of taskEntries) {
                if (!reordered.includes(t.line))
                    reordered.push(t.line);
            }
            // Replace task lines in-place
            for (let i = 0; i < taskEntries.length && i < reordered.length; i++) {
                lines[taskEntries[i].idx] = reordered[i];
            }
            await this.app.vault.modify(file, lines.join('\n'));
        }
        finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }
    /**
     * Extract emotion/energy scores from a daily note's body content.
     * Checks:
     *   1. **精力状态**: N/10  (morning energy)
     *   2. ### 开心事与情绪 section → first number on subsequent lines (evening emotion)
     *   3. YAML frontmatter emotion_score (fallback for legacy notes)
     * Returns the best available score (1-10), or null.
     */
    parseNoteScores(content) {
        // 1. Try evening emotion section: "## 开心事与情绪" or "### 开心事与情绪" followed by a number
        const emotionSectionMatch = content.match(/#{2,3}\s*开心事与情绪[\s\S]*?\n\s*(\d+)/m);
        if (emotionSectionMatch) {
            const v = parseInt(emotionSectionMatch[1], 10);
            if (v >= 1 && v <= 10)
                return v;
        }
        // 2. Try morning energy: "**精力状态**: N/10"
        const energyMatch = content.match(/\*\*精力状态\*\*[：:]\s*(\d+)/);
        if (energyMatch) {
            const v = parseInt(energyMatch[1], 10);
            if (v >= 1 && v <= 10)
                return v;
        }
        // 3. Fallback: YAML frontmatter emotion_score
        if (content.startsWith('---')) {
            const end = content.indexOf('---', 3);
            if (end > 0) {
                const fm = content.substring(4, end);
                const em = fm.match(/emotion_score:\s*(\d+)/);
                if (em)
                    return parseInt(em[1], 10);
            }
        }
        return null;
    }
    // =========================================================================
    // Kanban tab — delegated to PeriodicRenderer
    // =========================================================================
    async renderKanbanTab(panel) {
        await this.periodicRenderer.render(panel);
    }
    /**
     * Invalidate a cached tab panel so the next switchTab re-renders fresh.
     * Used by KanbanRenderer nav buttons to force re-render on navigation.
     */
    invalidateTabCache(_tab) {
        // Simple implementation: force re-render by switching tab
        // The tab content is always re-created by switchTab
    }
    // =========================================================================
    // Review tab — delegated to ReviewRenderer
    // =========================================================================
    async renderReviewTab(panel) {
        await this.reviewRenderer.render(panel);
    }
    /**
     * Render the input area
     */
    renderInputArea(container) {
        this.inputContainer = container.createDiv('tl-input-container');
        this.inputEl = this.inputContainer.createEl('textarea', {
            cls: 'tl-input',
            attr: {
                placeholder: t('chat.inputPlaceholder'),
                rows: '3',
            },
        });
        // Handle Enter key (Shift+Enter for new line)
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void this.sendMessage();
            }
        });
        // Auto-resize
        this.inputEl.addEventListener('input', () => {
            this.inputEl.setCssProps({ '--tl-input-height': 'auto' });
            this.inputEl.setCssProps({ '--tl-input-height': `${Math.min(this.inputEl.scrollHeight, 150)}px` });
        });
        const buttonContainer = this.inputContainer.createDiv('tl-input-buttons');
        this.sendButton = buttonContainer.createEl('button', {
            cls: 'tl-send-btn',
            text: t('chat.send'),
        });
        this.sendButton.addEventListener('click', () => { void this.sendMessage(); });
    }
    /**
     * Show welcome message
     */
    showWelcomeMessage() {
        this.addAIMessage(getLanguage() === 'en'
            ? `Hello 👋

I'm your AI coach, helping you build habits for continuous growth.

**🌙 Review** — Review your day, record achievements & emotions
**💡 Insight** — Insight analysis, generate reports

Click a button above to start, or type your thoughts.`
            : `你好 👋

我是你的 AI 教练，帮助你建立持续成长的习惯。

**🌙 Review** — 回顾一天，记录成就与情绪
**💡 Insight** — 洞察分析，生成报告

点击上方按钮开始，或直接输入你的想法。`);
    }
    /**
     * Start SOP workflow
     */
    startSOP(type) {
        this.sopContext = {
            type,
            currentStep: 0,
            responses: {},
        };
        // Clear messages and hide task input if visible
        this.messages = [];
        this.messagesContainer.empty();
        if (type === 'morning') {
            void this.startMorningSOP();
        }
        else if (type === 'evening') {
            void this.startEveningSOP();
        }
    }
    /**
     * Start morning SOP
     */
    async startMorningSOP() {
        // Check if today's plan already exists
        try {
            const dailyNotePath = this.plugin.vaultManager.getDailyNotePath();
            const file = this.app.vault.getAbstractFileByPath(dailyNotePath);
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                if (content.includes('精力状态') || content.includes('energy')) {
                    this.addAIMessage(t('chat.planExistsModify'));
                    return;
                }
            }
        }
        catch {
            // If check fails, just proceed with full SOP
        }
        this.addAIMessage(t('chat.startMorning'));
        await this.morningSOP.start(this.sopContext, (message) => {
            this.addAIMessage(message);
        });
    }
    /**
     * Start evening SOP
     */
    async startEveningSOP() {
        this.addAIMessage(t('chat.startEvening'));
        await this.eveningSOP.start(this.sopContext, (message) => {
            this.addAIMessage(message);
        });
    }
    /**
     * Start chat with pre-filled context (called from dashboard)
     */
    startChatWithContext(context) {
        this.switchTab('chat', true);
        this.sopContext = {
            type: 'none',
            currentStep: 0,
            responses: {},
        };
        this.messages = [];
        this.messagesContainer.empty();
        this.addAIMessage(t('chat.dashboardChat'));
        // Inject context as system-level background for the AI
        this.messages.push({
            role: 'system',
            content: getLanguage() === 'en'
                ? `The following is the user's dashboard summary data. Please answer the user's questions based on this data:\n\n${context}`
                : `以下是用户仪表盘上的摘要数据，请基于这些数据回答用户的问题：\n\n${context}`,
            timestamp: Date.now(),
        });
    }
    /**
     * Start free chat mode
     */
    startFreeChat() {
        this.sopContext = {
            type: 'none',
            currentStep: 0,
            responses: {},
        };
        this.messages = [];
        this.messagesContainer.empty();
        const messageEl = this.createMessageElement('ai');
        const contentDiv = messageEl.createDiv();
        void MarkdownRenderer.render(this.app, getLanguage() === 'en'
            ? `Free Chat Mode 💬

Talk about anything — problems you're facing, ideas to organize, topics to discuss.

You can also use the buttons below to generate insight reports:`
            : `自由对话模式 💬

聊什么都可以 — 遇到的问题、想梳理的想法、想讨论的话题。

也可以用下方按钮生成洞察报告：`, contentDiv, '', this);
        // Insight generation buttons
        const btnGroup = messageEl.createDiv('tl-insight-buttons');
        const isPro = this.plugin.licenseManager.isPro();
        const weeklyBtn = btnGroup.createEl('button', {
            cls: `tl-insight-btn ${!isPro ? 'tl-pro-locked-btn' : ''}`,
            text: `📊 ${t('chat.weeklyInsight')}${!isPro ? ' 🔒' : ''}`,
        });
        weeklyBtn.addEventListener('click', () => {
            if (!isPro) {
                new ProModal(this.app, t('chat.weeklyInsight'), this.plugin.licenseManager).open();
                return;
            }
            this.triggerInsight('weekly');
        });
        const monthlyBtn = btnGroup.createEl('button', {
            cls: `tl-insight-btn ${!isPro ? 'tl-pro-locked-btn' : ''}`,
            text: `📈 ${t('chat.monthlyInsight')}${!isPro ? ' 🔒' : ''}`,
        });
        monthlyBtn.addEventListener('click', () => {
            if (!isPro) {
                new ProModal(this.app, t('chat.monthlyInsight'), this.plugin.licenseManager).open();
                return;
            }
            this.triggerInsight('monthly');
        });
        const profileBtn = btnGroup.createEl('button', {
            cls: `tl-insight-btn ${!isPro ? 'tl-pro-locked-btn' : ''}`,
            text: `👤 ${t('chat.profileSuggestion')}${!isPro ? ' 🔒' : ''}`,
        });
        profileBtn.addEventListener('click', () => {
            if (!isPro) {
                new ProModal(this.app, t('chat.profileSuggestion'), this.plugin.licenseManager).open();
                return;
            }
            this.triggerProfileSuggestion();
        });
        this.scrollToBottom();
    }
    // =========================================================================
    // Message handling — delegated to ChatController
    // =========================================================================
    async sendMessage() {
        await this.chatController.sendMessage();
    }
    // =========================================================================
    // Message rendering (stays in ChatView — core UI)
    // =========================================================================
    /**
     * Add a user message to the UI
     */
    addUserMessage(content) {
        const messageEl = this.createMessageElement('user');
        messageEl.setText(content);
        this.scrollToBottom();
    }
    /**
     * Add an AI message to the UI
     */
    addAIMessage(content) {
        const messageEl = this.createMessageElement('ai');
        void MarkdownRenderer.render(this.app, content, messageEl, '', this);
        this.scrollToBottom();
    }
    /**
     * Stream an AI message (for SOP responses)
     */
    streamAIMessage(content) {
        const messageEl = this.createMessageElement('ai');
        let currentIndex = 0;
        const typewriter = setInterval(() => {
            if (currentIndex < content.length) {
                currentIndex = Math.min(currentIndex + 3, content.length);
                messageEl.empty();
                void MarkdownRenderer.render(this.app, content.substring(0, currentIndex), messageEl, '', this);
                this.scrollToBottom();
            }
            else {
                clearInterval(typewriter);
            }
        }, 15);
    }
    /**
     * Create a message element
     */
    createMessageElement(type) {
        const wrapper = this.messagesContainer.createDiv(`tl-message tl-message-${type}`);
        const avatar = wrapper.createDiv('tl-message-avatar');
        if (type === 'user') {
            setIcon(avatar, 'user');
        }
        else {
            setIcon(avatar, 'tidelog-wave');
        }
        const content = wrapper.createDiv('tl-message-content');
        return content;
    }
    /**
     * Scroll to bottom of messages
     */
    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
    /**
     * Show a thinking indicator (animated dots) while AI is processing
     */
    showThinkingIndicator() {
        this.hideThinkingIndicator(); // Remove any existing indicator
        const wrapper = this.messagesContainer.createDiv('tl-message tl-message-ai tl-thinking-indicator');
        const avatar = wrapper.createDiv('tl-message-avatar');
        setIcon(avatar, 'tidelog-wave');
        const content = wrapper.createDiv('tl-message-content');
        content.createDiv('tl-thinking-dots');
        this.scrollToBottom();
    }
    /**
     * Hide the thinking indicator
     */
    hideThinkingIndicator() {
        this.messagesContainer.querySelectorAll('.tl-thinking-indicator').forEach(el => el.remove());
    }
    // =========================================================================
    // Insight Generation — delegated to ChatController
    // =========================================================================
    /**
     * Trigger insight generation (public, called from main.ts)
     */
    triggerInsight(type) {
        this.chatController.triggerInsight(type);
    }
    /**
     * Trigger profile suggestion generation
     */
    triggerProfileSuggestion() {
        this.chatController.triggerProfileSuggestion();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdC12aWV3LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2hhdC12aWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztHQUVHO0FBRUgsT0FBTyxFQUNILFFBQVEsRUFDUixnQkFBZ0IsRUFFaEIsS0FBSyxFQUNMLE9BQU8sRUFDUCxNQUFNLEdBQ1QsTUFBTSxVQUFVLENBQUM7QUFHbEIsT0FBTyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFFekMsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ2hELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNoRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQWdCLE1BQU0scUJBQXFCLENBQUM7QUFDckUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRW5ELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNuRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBSXZDLE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBRyxjQUFjLENBQUM7QUFFN0MsTUFBTSxPQUFPLFFBQVMsU0FBUSxRQUFRO0lBa0RsQyxZQUFZLElBQW1CLEVBQUUsTUFBcUI7UUFDbEQsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBakRULGFBQVEsR0FBa0IsRUFBRSxDQUFDO1FBQzdCLGVBQVUsR0FBZTtZQUM1QixJQUFJLEVBQUUsTUFBTTtZQUNaLFdBQVcsRUFBRSxDQUFDO1lBQ2QsU0FBUyxFQUFFLEVBQUU7U0FDaEIsQ0FBQztRQU1LLGlCQUFZLEdBQUcsS0FBSyxDQUFDO1FBRTVCLGtCQUFrQjtRQUNYLHVCQUFrQixHQUF1QixJQUFJLENBQUM7UUFDOUMsYUFBUSxHQUEyRyxFQUFFLENBQUM7UUFDdEgsb0JBQWUsR0FBRyxLQUFLLENBQUM7UUFDeEIsb0JBQWUsR0FBRyxLQUFLLENBQUM7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LGNBQWMsQ0FBQyxDQUFDO1FBQ2hDLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUN4RCxPQUFPLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDdEMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFFRDs7T0FFRztJQUNILHFCQUFxQjtRQUNqQixJQUFJLENBQUMsaUJBQWlCLENBQUMsZ0JBQWdCLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNqRyxDQUFDO0lBRUQsNEVBQTRFO0lBQzVFLG1EQUFtRDtJQUNuRCw0RUFBNEU7SUFFNUU7O09BRUc7SUFDSCxjQUFjLENBQUMsSUFBMEI7UUFDckMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVEOztPQUVHO0lBQ0ssd0JBQXdCO1FBQzVCLElBQUksQ0FBQyxjQUFjLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztJQUNuRCxDQUFDO0NBRUoiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIENoYXQgVmlldyAtIFNpZGViYXIgY2hhdCBpbnRlcmZhY2UgZm9yIEFJIGludGVyYWN0aW9uc1xuICovXG5cbmltcG9ydCB7XG4gICAgSXRlbVZpZXcsXG4gICAgTWFya2Rvd25SZW5kZXJlcixcbiAgICBXb3Jrc3BhY2VMZWFmLFxuICAgIFRGaWxlLFxuICAgIHNldEljb24sXG4gICAgbW9tZW50LFxufSBmcm9tICdvYnNpZGlhbic7XG5cbmltcG9ydCBUaWRlTG9nUGx1Z2luIGZyb20gJy4uL21haW4nO1xuaW1wb3J0IHsgdCwgZ2V0TGFuZ3VhZ2UgfSBmcm9tICcuLi9pMThuJztcbmltcG9ydCB7IENoYXRNZXNzYWdlLCBTT1BDb250ZXh0LCBTT1BUeXBlIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgTW9ybmluZ1NPUCB9IGZyb20gJy4uL3NvcC9tb3JuaW5nLXNvcCc7XG5pbXBvcnQgeyBFdmVuaW5nU09QIH0gZnJvbSAnLi4vc29wL2V2ZW5pbmctc29wJztcbmltcG9ydCB7IFBlcmlvZGljUmVuZGVyZXIsIFBlcmlvZGljTW9kZSB9IGZyb20gJy4vcGVyaW9kaWMtcmVuZGVyZXInO1xuaW1wb3J0IHsgUmV2aWV3UmVuZGVyZXIgfSBmcm9tICcuL3Jldmlldy1yZW5kZXJlcic7XG5cbmltcG9ydCB7IENoYXRDb250cm9sbGVyIH0gZnJvbSAnLi9jaGF0LWNvbnRyb2xsZXInO1xuaW1wb3J0IHsgUHJvTW9kYWwgfSBmcm9tICcuL3Byby1tb2RhbCc7XG5cbnR5cGUgU2lkZWJhclRhYiA9ICdjaGF0JyB8ICdrYW5iYW4nIHwgJ3Jldmlldyc7XG5cbmV4cG9ydCBjb25zdCBDSEFUX1ZJRVdfVFlQRSA9ICd0bC1jaGF0LXZpZXcnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdFZpZXcgZXh0ZW5kcyBJdGVtVmlldyB7XG4gICAgcHVibGljIHBsdWdpbjogVGlkZUxvZ1BsdWdpbjtcbiAgICBwdWJsaWMgbWVzc2FnZXM6IENoYXRNZXNzYWdlW10gPSBbXTtcbiAgICBwdWJsaWMgc29wQ29udGV4dDogU09QQ29udGV4dCA9IHtcbiAgICAgICAgdHlwZTogJ25vbmUnLFxuICAgICAgICBjdXJyZW50U3RlcDogMCxcbiAgICAgICAgcmVzcG9uc2VzOiB7fSxcbiAgICB9O1xuXG4gICAgcHVibGljIG1lc3NhZ2VzQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG4gICAgcHVibGljIGlucHV0Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG4gICAgcHVibGljIGlucHV0RWwhOiBIVE1MVGV4dEFyZWFFbGVtZW50O1xuICAgIHB1YmxpYyBzZW5kQnV0dG9uITogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgcHVibGljIGlzUHJvY2Vzc2luZyA9IGZhbHNlO1xuXG4gICAgLy8gVGFzayBpbnB1dCBtb2RlXG4gICAgcHVibGljIHRhc2tJbnB1dENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgICBwdWJsaWMgdGFza0RhdGE6IHsgZmllbGQ6IEhUTUxJbnB1dEVsZW1lbnQ7IHN1YnRhc2tGaWVsZHM6IEhUTUxJbnB1dEVsZW1lbnRbXTsgc3VidGFza0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsIH1bXSA9IFtdO1xuICAgIHB1YmxpYyBpc1Rhc2tJbnB1dE1vZGUgPSBmYWxzZTtcbiAgICBwdWJsaWMgcXVpY2tVcGRhdGVNb2RlID0gZmFsc2U7XG5cbiAgICAvLyBUYWIgc3lzdGVtXG4gICAgcHJpdmF0ZSBhY3RpdmVUYWI6IFNpZGViYXJUYWIgPSAnY2hhdCc7XG4gICAgcHJpdmF0ZSB0YWJDb250ZW50RWwhOiBIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIHRhYkJhckVsITogSFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSBjaGF0UGFuZWwhOiBIVE1MRWxlbWVudDtcbiAgICBwdWJsaWMga2FuYmFuV2Vla09mZnNldCA9IDA7XG4gICAgcHVibGljIGthbmJhbk1vbnRoT2Zmc2V0ID0gMDtcbiAgICBwdWJsaWMga2FuYmFuRGF5T2Zmc2V0ID0gMDtcbiAgICBwdWJsaWMgY2FsZW5kYXJNb250aDogbW9tZW50Lk1vbWVudCA9IG1vbWVudCgpO1xuICAgIHB1YmxpYyBjYWxlbmRhclZpZXdNb2RlOiAnbW9udGgnIHwgJ3dlZWsnID0gJ21vbnRoJztcbiAgICBwdWJsaWMgY2FsZW5kYXJXZWVrT2Zmc2V0ID0gMDtcblxuICAgIC8vIFBlcmlvZGljIG5hdmlnYXRvciBzdGF0ZVxuICAgIHB1YmxpYyBwZXJpb2RpY01vZGU6IFBlcmlvZGljTW9kZSA9ICdkYXknO1xuICAgIHB1YmxpYyBwZXJpb2RpY1NlbGVjdGVkRGF0ZTogbW9tZW50Lk1vbWVudCA9IG1vbWVudCgpO1xuICAgIHB1YmxpYyBwZXJpb2RpY01vbnRoT2Zmc2V0ID0gMDtcblxuICAgIC8vIExpdmUgcmVmcmVzaFxuICAgIHByaXZhdGUgdmF1bHRNb2RpZnlSZWY6IFJldHVyblR5cGU8dHlwZW9mIHRoaXMuYXBwLnZhdWx0Lm9uPiB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgcmVmcmVzaFRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgX3N1cHByZXNzUmVmcmVzaCA9IGZhbHNlO1xuXG4gICAgcHVibGljIG1vcm5pbmdTT1AhOiBNb3JuaW5nU09QO1xuICAgIHB1YmxpYyBldmVuaW5nU09QITogRXZlbmluZ1NPUDtcbiAgICBwcml2YXRlIHBlcmlvZGljUmVuZGVyZXIhOiBQZXJpb2RpY1JlbmRlcmVyO1xuICAgIHByaXZhdGUgcmV2aWV3UmVuZGVyZXIhOiBSZXZpZXdSZW5kZXJlcjtcblxuICAgIHByaXZhdGUgY2hhdENvbnRyb2xsZXIhOiBDaGF0Q29udHJvbGxlcjtcblxuICAgIGNvbnN0cnVjdG9yKGxlYWY6IFdvcmtzcGFjZUxlYWYsIHBsdWdpbjogVGlkZUxvZ1BsdWdpbikge1xuICAgICAgICBzdXBlcihsZWFmKTtcbiAgICAgICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gICAgICAgIHRoaXMubW9ybmluZ1NPUCA9IG5ldyBNb3JuaW5nU09QKHBsdWdpbik7XG4gICAgICAgIHRoaXMuZXZlbmluZ1NPUCA9IG5ldyBFdmVuaW5nU09QKHBsdWdpbik7XG4gICAgICAgIHRoaXMucGVyaW9kaWNSZW5kZXJlciA9IG5ldyBQZXJpb2RpY1JlbmRlcmVyKHRoaXMpO1xuICAgICAgICB0aGlzLnJldmlld1JlbmRlcmVyID0gbmV3IFJldmlld1JlbmRlcmVyKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuY2hhdENvbnRyb2xsZXIgPSBuZXcgQ2hhdENvbnRyb2xsZXIodGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0Vmlld1R5cGUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIENIQVRfVklFV19UWVBFO1xuICAgIH1cblxuICAgIGdldERpc3BsYXlUZXh0KCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiAnVGlkZUxvZyc7XG4gICAgfVxuXG4gICAgZ2V0SWNvbigpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ3RpZGVsb2ctd2F2ZSc7XG4gICAgfVxuXG4gICAgYXN5bmMgb25PcGVuKCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLmNvbnRlbnRFbDtcbiAgICAgICAgY29udGFpbmVyLmVtcHR5KCk7XG4gICAgICAgIGNvbnRhaW5lci5hZGRDbGFzcygndGwtY2hhdC1jb250YWluZXInKTtcblxuICAgICAgICAvLyBUYWIgYmFyICh0b3AtbGV2ZWwgbmF2aWdhdGlvbiDigJQgbm8gaGVhZGVyKVxuICAgICAgICB0aGlzLnJlbmRlclRhYkJhcihjb250YWluZXIpO1xuXG4gICAgICAgIC8vIFRhYiBjb250ZW50IGFyZWFcbiAgICAgICAgdGhpcy50YWJDb250ZW50RWwgPSBjb250YWluZXIuY3JlYXRlRGl2KCd0bC10YWItY29udGVudCcpO1xuXG4gICAgICAgIC8vIENoYXQgcGFuZWwgKFNPUCBidXR0b25zICsgbWVzc2FnZXMgKyBpbnB1dClcbiAgICAgICAgdGhpcy5jaGF0UGFuZWwgPSB0aGlzLnRhYkNvbnRlbnRFbC5jcmVhdGVEaXYoJ3RsLXRhYi1wYW5lbCB0bC10YWItcGFuZWwtY2hhdCcpO1xuICAgICAgICB0aGlzLnJlbmRlclNPUEJ1dHRvbnModGhpcy5jaGF0UGFuZWwpO1xuICAgICAgICB0aGlzLm1lc3NhZ2VzQ29udGFpbmVyID0gdGhpcy5jaGF0UGFuZWwuY3JlYXRlRGl2KCd0bC1tZXNzYWdlcycpO1xuICAgICAgICB0aGlzLnJlbmRlcklucHV0QXJlYSh0aGlzLmNoYXRQYW5lbCk7XG4gICAgICAgIHRoaXMuc2hvd1dlbGNvbWVNZXNzYWdlKCk7XG5cbiAgICAgICAgLy8gU3dpdGNoIHRvIFBsYW4gdGFiIGJ5IGRlZmF1bHRcbiAgICAgICAgdGhpcy5zd2l0Y2hUYWIoJ2thbmJhbicpO1xuXG4gICAgICAgIC8vIExpdmUgcmVmcmVzaDogcmUtcmVuZGVyIGthbmJhbiB3aGVuIHZhdWx0IGZpbGVzIGNoYW5nZVxuICAgICAgICB0aGlzLnZhdWx0TW9kaWZ5UmVmID0gdGhpcy5hcHAudmF1bHQub24oJ21vZGlmeScsIChmaWxlKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy5fc3VwcHJlc3NSZWZyZXNoKSByZXR1cm47XG4gICAgICAgICAgICBpZiAodGhpcy5hY3RpdmVUYWIgIT09ICdrYW5iYW4nICYmIHRoaXMuYWN0aXZlVGFiICE9PSAncmV2aWV3JykgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB8fCBmaWxlLmV4dGVuc2lvbiAhPT0gJ21kJykgcmV0dXJuO1xuICAgICAgICAgICAgLy8gRGVib3VuY2UgdG8gYXZvaWQgcmUtcmVuZGVyIHN0b3JtXG4gICAgICAgICAgICBpZiAodGhpcy5yZWZyZXNoVGltZXIpIGNsZWFyVGltZW91dCh0aGlzLnJlZnJlc2hUaW1lcik7XG4gICAgICAgICAgICB0aGlzLnJlZnJlc2hUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuc3dpdGNoVGFiKHRoaXMuYWN0aXZlVGFiLCBmYWxzZSk7XG4gICAgICAgICAgICB9LCA1MDApO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMudmF1bHRNb2RpZnlSZWYpO1xuICAgIH1cblxuICAgIGFzeW5jIG9uQ2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGlmICh0aGlzLnJlZnJlc2hUaW1lcikgY2xlYXJUaW1lb3V0KHRoaXMucmVmcmVzaFRpbWVyKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW5kZXIgdGhlIGhlYWRlciB3aXRoIFNPUCBtb2RlIGJ1dHRvbnNcbiAgICAgKi9cbiAgICBwcml2YXRlIHJlbmRlckhlYWRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGhlYWRlciA9IGNvbnRhaW5lci5jcmVhdGVEaXYoJ3RsLWhlYWRlcicpO1xuICAgICAgICBjb25zdCB0aXRsZSA9IGhlYWRlci5jcmVhdGVEaXYoJ3RsLXRpdGxlJyk7XG4gICAgICAgIGNvbnN0IGljb25TcGFuID0gdGl0bGUuY3JlYXRlU3BhbigndGwtdGl0bGUtaWNvbicpO1xuICAgICAgICBzZXRJY29uKGljb25TcGFuLCAndGlkZWxvZy13YXZlJyk7XG4gICAgICAgIHRpdGxlLmNyZWF0ZVNwYW4oeyB0ZXh0OiAnVGlkZUxvZycgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVuZGVyIFNPUCBidXR0b25zIGluc2lkZSB0aGUgY2hhdCBwYW5lbCBvbmx5XG4gICAgICovXG4gICAgcHJpdmF0ZSByZW5kZXJTT1BCdXR0b25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgYnV0dG9ucyA9IGNvbnRhaW5lci5jcmVhdGVEaXYoJ3RsLWhlYWRlci1idXR0b25zJyk7XG5cbiAgICAgICAgY29uc3QgZXZlbmluZ0J0biA9IGJ1dHRvbnMuY3JlYXRlRWwoJ2J1dHRvbicsIHtcbiAgICAgICAgICAgIGNsczogJ3RsLW1vZGUtYnRuIHRsLW1vZGUtYnRuLXJldmlldycsXG4gICAgICAgIH0pO1xuICAgICAgICBzZXRJY29uKGV2ZW5pbmdCdG4sICdtb29uJyk7XG4gICAgICAgIGV2ZW5pbmdCdG4uY3JlYXRlU3Bhbih7IHRleHQ6ICdSZXZpZXcnIH0pO1xuICAgICAgICBldmVuaW5nQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5zdGFydFNPUCgnZXZlbmluZycpKTtcblxuICAgICAgICBjb25zdCBpbnNpZ2h0QnRuID0gYnV0dG9ucy5jcmVhdGVFbCgnYnV0dG9uJywge1xuICAgICAgICAgICAgY2xzOiAndGwtbW9kZS1idG4gdGwtbW9kZS1idG4taW5zaWdodCcsXG4gICAgICAgIH0pO1xuICAgICAgICBzZXRJY29uKGluc2lnaHRCdG4sICdsaWdodGJ1bGInKTtcbiAgICAgICAgaW5zaWdodEJ0bi5jcmVhdGVTcGFuKHsgdGV4dDogJ0luc2lnaHQnIH0pO1xuICAgICAgICBpbnNpZ2h0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5zdGFydEZyZWVDaGF0KCkpO1xuICAgIH1cblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBUYWIgYmFyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgcHJpdmF0ZSByZW5kZXJUYWJCYXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICAgICAgICBjb25zdCB0YWJCYXJXcmFwID0gY29udGFpbmVyLmNyZWF0ZURpdigndGwtdGFiLWJhci13cmFwJyk7XG4gICAgICAgIHRoaXMudGFiQmFyRWwgPSB0YWJCYXJXcmFwLmNyZWF0ZURpdigndGwtdGFiLWJhcicpO1xuXG4gICAgICAgIGNvbnN0IHRhYnM6IHsgaWQ6IFNpZGViYXJUYWI7IGVtb2ppOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmcgfVtdID0gW1xuICAgICAgICAgICAgeyBpZDogJ2thbmJhbicsIGVtb2ppOiAn4piA77iPJywgbGFiZWw6ICdQbGFuJyB9LFxuICAgICAgICAgICAgeyBpZDogJ2NoYXQnLCBlbW9qaTogJ/CfjJknLCBsYWJlbDogJ1JldmlldycgfSxcbiAgICAgICAgICAgIHsgaWQ6ICdyZXZpZXcnLCBlbW9qaTogJ/CfjJMnLCBsYWJlbDogJ0luc2lnaHRzJyB9LFxuICAgICAgICBdO1xuXG4gICAgICAgIGZvciAoY29uc3QgdGFiIG9mIHRhYnMpIHtcbiAgICAgICAgICAgIGNvbnN0IGJ0biA9IHRoaXMudGFiQmFyRWwuY3JlYXRlRWwoJ2J1dHRvbicsIHtcbiAgICAgICAgICAgICAgICBjbHM6IGB0bC10YWItYnRuICR7dGFiLmlkID09PSB0aGlzLmFjdGl2ZVRhYiA/ICd0bC10YWItYnRuLWFjdGl2ZScgOiAnJ31gLFxuICAgICAgICAgICAgICAgIGF0dHI6IHsgJ2RhdGEtdGFiJzogdGFiLmlkIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGJ0bi5jcmVhdGVFbCgnc3BhbicsIHsgY2xzOiAndGwtdGFiLWJ0bi1pY29uJywgdGV4dDogdGFiLmVtb2ppIH0pO1xuICAgICAgICAgICAgYnRuLmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC10YWItYnRuLWxhYmVsJywgdGV4dDogdGFiLmxhYmVsIH0pO1xuICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5zd2l0Y2hUYWIodGFiLmlkLCB0cnVlKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgc3dpdGNoVGFiKHRhYjogU2lkZWJhclRhYiwgYW5pbWF0ZSA9IGZhbHNlKTogdm9pZCB7XG4gICAgICAgIHRoaXMuYWN0aXZlVGFiID0gdGFiO1xuICAgICAgICAvLyBDYW5jZWwgYW55IHBlbmRpbmcgZGVib3VuY2VkIHJlZnJlc2ggdG8gcHJldmVudCBxdWV1ZWQgcmUtcmVuZGVyc1xuICAgICAgICBpZiAodGhpcy5yZWZyZXNoVGltZXIpIHsgY2xlYXJUaW1lb3V0KHRoaXMucmVmcmVzaFRpbWVyKTsgdGhpcy5yZWZyZXNoVGltZXIgPSBudWxsOyB9XG5cbiAgICAgICAgLy8gVXBkYXRlIHRhYiBiYXIgYWN0aXZlIHN0YXRlXG4gICAgICAgIHRoaXMudGFiQmFyRWwucXVlcnlTZWxlY3RvckFsbCgnLnRsLXRhYi1idG4nKS5mb3JFYWNoKGJ0biA9PiB7XG4gICAgICAgICAgICBidG4ucmVtb3ZlQ2xhc3MoJ3RsLXRhYi1idG4tYWN0aXZlJyk7XG4gICAgICAgICAgICBpZiAoYnRuLmdldEF0dHJpYnV0ZSgnZGF0YS10YWInKSA9PT0gdGFiKSB7XG4gICAgICAgICAgICAgICAgYnRuLmFkZENsYXNzKCd0bC10YWItYnRuLWFjdGl2ZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAodGFiID09PSAnY2hhdCcpIHtcbiAgICAgICAgICAgIHRoaXMuY2hhdFBhbmVsLnJlbW92ZUNsYXNzKCd0bC1oaWRkZW4nKTtcbiAgICAgICAgICAgIC8vIFJlbW92ZSBub24tY2hhdCBwYW5lbHNcbiAgICAgICAgICAgIHRoaXMudGFiQ29udGVudEVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy50bC10YWItcGFuZWw6bm90KC50bC10YWItcGFuZWwtY2hhdCknKS5mb3JFYWNoKGVsID0+IGVsLnJlbW92ZSgpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY2hhdFBhbmVsLmFkZENsYXNzKCd0bC1oaWRkZW4nKTtcbiAgICAgICAgICAgIC8vIFJlbW92ZSBzdGFsZSBwYW5lbHMgaW1tZWRpYXRlbHkgdG8gcHJldmVudCBkb3VibGUtY2FsZW5kYXIgZmxhc2hcbiAgICAgICAgICAgIHRoaXMudGFiQ29udGVudEVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy50bC10YWItcGFuZWw6bm90KC50bC10YWItcGFuZWwtY2hhdCknKS5mb3JFYWNoKGVsID0+IGVsLnJlbW92ZSgpKTtcbiAgICAgICAgICAgIC8vIEJ1aWxkIG5ldyBwYW5lbFxuICAgICAgICAgICAgY29uc3QgcGFuZWwgPSB0aGlzLnRhYkNvbnRlbnRFbC5jcmVhdGVEaXYoJ3RsLXRhYi1wYW5lbCcpO1xuICAgICAgICAgICAgaWYgKGFuaW1hdGUpIHBhbmVsLmFkZENsYXNzKCd0bC10YWItcGFuZWwtYW5pbWF0ZScpO1xuICAgICAgICAgICAgLy8gU3VwcHJlc3MgdmF1bHQtbW9kaWZ5IHJlLXJlbmRlcnMgd2hpbGUgdGhpcyByZW5kZXIgaXMgaW4gcHJvZ3Jlc3NcbiAgICAgICAgICAgIHRoaXMuX3N1cHByZXNzUmVmcmVzaCA9IHRydWU7XG4gICAgICAgICAgICBjb25zdCByZW5kZXIgPSAodGFiID09PSAna2FuYmFuJylcbiAgICAgICAgICAgICAgICA/IHRoaXMucmVuZGVyS2FuYmFuVGFiKHBhbmVsKVxuICAgICAgICAgICAgICAgIDogdGhpcy5yZW5kZXJSZXZpZXdUYWIocGFuZWwpO1xuICAgICAgICAgICAgdm9pZCByZW5kZXIuZmluYWxseSgoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fc3VwcHJlc3NSZWZyZXNoID0gZmFsc2U7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBTaGFyZWQgaGVscGVycyBmb3IgdGFzayBwYXJzaW5nIC8gdG9nZ2xpbmdcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvKipcbiAgICAgKiBQYXJzZSBtYXJrZG93biBjb250ZW50IGludG8gc3RydWN0dXJlZCBpdGVtcy5cbiAgICAgKiBGaWx0ZXJzIG91dCBlbXB0eS9wbGFjZWhvbGRlciBpdGVtcyAoZS5nLiBcIuesrOS4gOWRqO+8mlwiIHdpdGggbm8gY29udGVudCkuXG4gICAgICovXG4gICAgcHVibGljIHBhcnNlTWRUYXNrcyhjb250ZW50OiBzdHJpbmcpOiB7IHRleHQ6IHN0cmluZzsgZG9uZTogYm9vbGVhbjsgaXNUYXNrOiBib29sZWFuOyBzZWN0aW9uOiBzdHJpbmc7IGluZGVudDogbnVtYmVyIH1bXSB7XG4gICAgICAgIGNvbnN0IGl0ZW1zOiB7IHRleHQ6IHN0cmluZzsgZG9uZTogYm9vbGVhbjsgaXNUYXNrOiBib29sZWFuOyBzZWN0aW9uOiBzdHJpbmc7IGluZGVudDogbnVtYmVyIH1bXSA9IFtdO1xuICAgICAgICBsZXQgc2VjdGlvbiA9ICcnO1xuICAgICAgICBjb25zdCBpc1N1YnN0YW50aXZlID0gKHQ6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc3RyaXBwZWQgPSB0LnJlcGxhY2UoL1vvvJo6XS9nLCAnJykudHJpbSgpO1xuICAgICAgICAgICAgaWYgKHN0cmlwcGVkLmxlbmd0aCA8IDIpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGlmICgvXuesrC57MSwyfeWRqCQvLnRlc3Qoc3RyaXBwZWQpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgY2FsY0luZGVudCA9ICh3czogc3RyaW5nKTogbnVtYmVyID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRhYnMgPSAod3MubWF0Y2goL1xcdC9nKSB8fCBbXSkubGVuZ3RoO1xuICAgICAgICAgICAgY29uc3Qgc3BhY2VzID0gd3MucmVwbGFjZSgvXFx0L2csICcnKS5sZW5ndGg7XG4gICAgICAgICAgICByZXR1cm4gdGFicyArIE1hdGguZmxvb3Ioc3BhY2VzIC8gMik7XG4gICAgICAgIH07XG4gICAgICAgIGZvciAoY29uc3QgbGluZSBvZiBjb250ZW50LnNwbGl0KCdcXG4nKSkge1xuICAgICAgICAgICAgaWYgKGxpbmUuc3RhcnRzV2l0aCgnIyMgJykgfHwgbGluZS5zdGFydHNXaXRoKCcjIyMgJykpIHtcbiAgICAgICAgICAgICAgICBzZWN0aW9uID0gbGluZS5yZXBsYWNlKC9eI3syLDN9XFxzKy8sICcnKS50cmltKCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB0YXNrTSA9IGxpbmUubWF0Y2goL14oXFxzKiktIFxcWyhbIHhdKVxcXSAoLispJC8pO1xuICAgICAgICAgICAgaWYgKHRhc2tNKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdHh0ID0gdGFza01bM10udHJpbSgpO1xuICAgICAgICAgICAgICAgIGlmIChpc1N1YnN0YW50aXZlKHR4dCkpIHtcbiAgICAgICAgICAgICAgICAgICAgaXRlbXMucHVzaCh7IHRleHQ6IHR4dCwgZG9uZTogdGFza01bMl0gPT09ICd4JywgaXNUYXNrOiB0cnVlLCBzZWN0aW9uLCBpbmRlbnQ6IGNhbGNJbmRlbnQodGFza01bMV0pIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IG51bU0gPSBsaW5lLm1hdGNoKC9eKFxccyopXFxkK1xcLlxccysoLispJC8pO1xuICAgICAgICAgICAgaWYgKG51bU0gJiYgbnVtTVsyXS50cmltKCkgJiYgaXNTdWJzdGFudGl2ZShudW1NWzJdLnRyaW0oKSkpIHtcbiAgICAgICAgICAgICAgICBsZXQgbnVtVGV4dCA9IG51bU1bMl0udHJpbSgpO1xuICAgICAgICAgICAgICAgIC8vIEhhbmRsZSBudW1iZXJlZCBpdGVtcyB3aXRoIGNoZWNrYm94IG1hcmtlcnM6IDEuIFt4XSB0ZXh0IC8gMS4gWyBdIHRleHRcbiAgICAgICAgICAgICAgICBjb25zdCBudW1UYXNrTSA9IG51bVRleHQubWF0Y2goL15cXFsoWyB4XSlcXF1cXHMqKC4rKSQvKTtcbiAgICAgICAgICAgICAgICBpZiAobnVtVGFza00pIHtcbiAgICAgICAgICAgICAgICAgICAgaXRlbXMucHVzaCh7IHRleHQ6IG51bVRhc2tNWzJdLnRyaW0oKSwgZG9uZTogbnVtVGFza01bMV0gPT09ICd4JywgaXNUYXNrOiB0cnVlLCBzZWN0aW9uLCBpbmRlbnQ6IGNhbGNJbmRlbnQobnVtTVsxXSkgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaXRlbXMucHVzaCh7IHRleHQ6IG51bVRleHQsIGRvbmU6IGZhbHNlLCBpc1Rhc2s6IGZhbHNlLCBzZWN0aW9uLCBpbmRlbnQ6IGNhbGNJbmRlbnQobnVtTVsxXSkgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYnVsbGV0TSA9IGxpbmUubWF0Y2goL14oXFxzKiktICguKykkLyk7XG4gICAgICAgICAgICBpZiAoYnVsbGV0TSAmJiBidWxsZXRNWzJdLnRyaW0oKSAmJiBpc1N1YnN0YW50aXZlKGJ1bGxldE1bMl0udHJpbSgpKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHR4dCA9IGJ1bGxldE1bMl0udHJpbSgpO1xuICAgICAgICAgICAgICAgIC8vIFNraXAgZW1wdHkvbmVhci1lbXB0eSBjaGVja2JveGVzIHRoYXQgc2xpcHBlZCBwYXN0IHRoZSB0YXNrIHJlZ2V4XG4gICAgICAgICAgICAgICAgaWYgKC9eXFxbW1xcc3hdP1xcXS8udGVzdCh0eHQpKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKHsgdGV4dDogdHh0LCBkb25lOiBmYWxzZSwgaXNUYXNrOiBmYWxzZSwgc2VjdGlvbiwgaW5kZW50OiBjYWxjSW5kZW50KGJ1bGxldE1bMV0pIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpdGVtcztcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgdG9nZ2xlTWRUYXNrKGZpbGU6IFRGaWxlLCB0YXNrVGV4dDogc3RyaW5nLCB3YXNEb25lOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIHRoaXMuX3N1cHByZXNzUmVmcmVzaCA9IHRydWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgICAgICBjb25zdCBlc2NhcGVkID0gdGFza1RleHQucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKTtcbiAgICAgICAgICAgIGNvbnN0IG9sZE1hcmsgPSB3YXNEb25lID8gJ3gnIDogJyAnO1xuICAgICAgICAgICAgY29uc3QgbmV3TWFyayA9IHdhc0RvbmUgPyAnICcgOiAneCc7XG4gICAgICAgICAgICAvLyBTdXBwb3J0IGluZGVudGVkIHRhc2tzIChsZWFkaW5nIHdoaXRlc3BhY2UpXG4gICAgICAgICAgICBjb25zdCBwYXQgPSBuZXcgUmVnRXhwKGBeKFxcXFxzKiktIFxcXFxbJHtvbGRNYXJrfVxcXFxdICR7ZXNjYXBlZH0kYCwgJ20nKTtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gY29udGVudC5tYXRjaChwYXQpO1xuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgY29udGVudCA9IGNvbnRlbnQucmVwbGFjZShwYXQsIGAke21hdGNoWzFdfS0gWyR7bmV3TWFya31dICR7dGFza1RleHR9YCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIFRyeSBtYXRjaGluZyBudW1iZXJlZCBsaXN0IGl0ZW0gYW5kIGNvbnZlcnQgdG8gY2hlY2tib3hcbiAgICAgICAgICAgICAgICBjb25zdCBudW1QYXQgPSBuZXcgUmVnRXhwKGBeKFxcXFxzKilcXFxcZCtcXFxcLlxcXFxzKyR7ZXNjYXBlZH0kYCwgJ20nKTtcbiAgICAgICAgICAgICAgICBjb25zdCBudW1NYXRjaCA9IGNvbnRlbnQubWF0Y2gobnVtUGF0KTtcbiAgICAgICAgICAgICAgICBpZiAobnVtTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGVudCA9IGNvbnRlbnQucmVwbGFjZShudW1QYXQsIGAke251bU1hdGNoWzFdfS0gWyR7bmV3TWFya31dICR7dGFza1RleHR9YCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVHJ5IG1hdGNoaW5nIHBsYWluIGJ1bGxldCBhbmQgY29udmVydCB0byBjaGVja2JveFxuICAgICAgICAgICAgICAgICAgICBjb25zdCBidWxsZXRQYXQgPSBuZXcgUmVnRXhwKGBeKFxcXFxzKiktICR7ZXNjYXBlZH0kYCwgJ20nKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYnVsbGV0TWF0Y2ggPSBjb250ZW50Lm1hdGNoKGJ1bGxldFBhdCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChidWxsZXRNYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGVudCA9IGNvbnRlbnQucmVwbGFjZShidWxsZXRQYXQsIGAke2J1bGxldE1hdGNoWzFdfS0gWyR7bmV3TWFya31dICR7dGFza1RleHR9YCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgY29udGVudCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAvLyBEZWxheSBjbGVhcmluZyB0aGUgZmxhZyBzbyB0aGUgdmF1bHQgJ21vZGlmeScgZXZlbnQgKGFzeW5jKSBpcyBzdXBwcmVzc2VkXG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsgdGhpcy5fc3VwcHJlc3NSZWZyZXNoID0gZmFsc2U7IH0sIDIwMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBcHBlbmQgYSBuZXcgdGFzayB0byBhIG1hcmtkb3duIGZpbGUuXG4gICAgICogSW5zZXJ0cyBhZnRlciB0aGUgbGFzdCBleGlzdGluZyB0YXNrIGxpbmUsIG9yIGF0IHRoZSBlbmQuXG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGFkZE1kVGFzayhmaWxlOiBURmlsZSwgdGFza1RleHQ6IHN0cmluZywgaW5kZW50ID0gMCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICB0aGlzLl9zdXBwcmVzc1JlZnJlc2ggPSB0cnVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbGV0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICAgICAgY29uc3QgcHJlZml4ID0gJyAgJy5yZXBlYXQoaW5kZW50KTtcbiAgICAgICAgICAgIGNvbnN0IG5ld0xpbmUgPSBgJHtwcmVmaXh9LSBbIF0gJHt0YXNrVGV4dH1gO1xuICAgICAgICAgICAgY29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KCdcXG4nKTtcblxuICAgICAgICAgICAgLy8gRmluZCB0aGUgbGFzdCB0YXNrIGxpbmUgaW5kZXhcbiAgICAgICAgICAgIGxldCBsYXN0VGFza0lkeCA9IC0xO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChsaW5lc1tpXS5tYXRjaCgvXlxccyotIFxcW1sgeF1cXF0gLykpIHtcbiAgICAgICAgICAgICAgICAgICAgbGFzdFRhc2tJZHggPSBpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGxhc3RUYXNrSWR4ID49IDApIHtcbiAgICAgICAgICAgICAgICBsaW5lcy5zcGxpY2UobGFzdFRhc2tJZHggKyAxLCAwLCBuZXdMaW5lKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGluZXMucHVzaChuZXdMaW5lKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIGxpbmVzLmpvaW4oJ1xcbicpKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4geyB0aGlzLl9zdXBwcmVzc1JlZnJlc2ggPSBmYWxzZTsgfSwgMjAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBJbnNlcnQgYSBzdWItdGFzayAoaW5kZW50ZWQpIGRpcmVjdGx5IGFmdGVyIGEgcGFyZW50IHRhc2sgKi9cbiAgICBwdWJsaWMgYXN5bmMgYWRkU3ViVGFzayhmaWxlOiBURmlsZSwgcGFyZW50VGV4dDogc3RyaW5nLCBzdWJUYXNrVGV4dDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIHRoaXMuX3N1cHByZXNzUmVmcmVzaCA9IHRydWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XG4gICAgICAgICAgICBjb25zdCBlc2NhcGVkID0gcGFyZW50VGV4dC5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgJ1xcXFwkJicpO1xuICAgICAgICAgICAgY29uc3QgcGF0ID0gbmV3IFJlZ0V4cChgXihcXFxccyotIFxcXFxbWyB4XVxcXFxdICkke2VzY2FwZWR9JGApO1xuICAgICAgICAgICAgbGV0IHBhcmVudElkeCA9IC0xO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChwYXQudGVzdChsaW5lc1tpXSkpIHsgcGFyZW50SWR4ID0gaTsgYnJlYWs7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwYXJlbnRJZHggPj0gMCkge1xuICAgICAgICAgICAgICAgIGxpbmVzLnNwbGljZShwYXJlbnRJZHggKyAxLCAwLCBgICAtIFsgXSAke3N1YlRhc2tUZXh0fWApO1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBsaW5lcy5qb2luKCdcXG4nKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsgdGhpcy5fc3VwcHJlc3NSZWZyZXNoID0gZmFsc2U7IH0sIDIwMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKiogRWRpdCBhIHRhc2sncyB0ZXh0IGluIGEgbWFya2Rvd24gZmlsZSAqL1xuICAgIHB1YmxpYyBhc3luYyBlZGl0TWRUYXNrKGZpbGU6IFRGaWxlLCBvbGRUZXh0OiBzdHJpbmcsIG5ld1RleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICB0aGlzLl9zdXBwcmVzc1JlZnJlc2ggPSB0cnVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbGV0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICAgICAgY29uc3QgZXNjYXBlZCA9IG9sZFRleHQucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKTtcbiAgICAgICAgICAgIGNvbnN0IHBhdCA9IG5ldyBSZWdFeHAoYF4oXFxcXHMqLSBcXFxcW1sgeF1cXFxcXSApJHtlc2NhcGVkfSRgLCAnbScpO1xuICAgICAgICAgICAgY29udGVudCA9IGNvbnRlbnQucmVwbGFjZShwYXQsIGAkMSR7bmV3VGV4dH1gKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBjb250ZW50KTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4geyB0aGlzLl9zdXBwcmVzc1JlZnJlc2ggPSBmYWxzZTsgfSwgMjAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBEZWxldGUgYSB0YXNrIGxpbmUgZnJvbSBhIG1hcmtkb3duIGZpbGUgKi9cbiAgICBwdWJsaWMgYXN5bmMgZGVsZXRlTWRUYXNrKGZpbGU6IFRGaWxlLCB0YXNrVGV4dDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIHRoaXMuX3N1cHByZXNzUmVmcmVzaCA9IHRydWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgICAgICBjb25zdCBlc2NhcGVkID0gdGFza1RleHQucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKTtcbiAgICAgICAgICAgIGNvbnN0IHBhdCA9IG5ldyBSZWdFeHAoYF5cXFxccyotIFxcXFxbWyB4XVxcXFxdICR7ZXNjYXBlZH1cXFxcbj9gLCAnbScpO1xuICAgICAgICAgICAgY29udGVudCA9IGNvbnRlbnQucmVwbGFjZShwYXQsICcnKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBjb250ZW50KTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4geyB0aGlzLl9zdXBwcmVzc1JlZnJlc2ggPSBmYWxzZTsgfSwgMjAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBEZWZlciBhIHRhc2sgZnJvbSBhIHNvdXJjZSBmaWxlIHRvIHRvZGF5J3MgZGFpbHkgbm90ZSAqL1xuICAgIHB1YmxpYyBhc3luYyBkZWZlclRhc2tUb1RvZGF5KHNvdXJjZUZpbGU6IFRGaWxlLCB0YXNrVGV4dDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIHRoaXMuX3N1cHByZXNzUmVmcmVzaCA9IHRydWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBHZXQgb3IgY3JlYXRlIHRvZGF5J3MgZGFpbHkgbm90ZVxuICAgICAgICAgICAgY29uc3QgdG9kYXlOb3RlID0gYXdhaXQgdGhpcy5wbHVnaW4udmF1bHRNYW5hZ2VyLmdldE9yQ3JlYXRlRGFpbHlOb3RlKCk7XG5cbiAgICAgICAgICAgIC8vIEFkZCB0aGUgdGFzayB0byB0b2RheSdzIG5vdGVcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYWRkTWRUYXNrKHRvZGF5Tm90ZSwgdGFza1RleHQpO1xuXG4gICAgICAgICAgICAvLyBSZW1vdmUgZnJvbSBzb3VyY2UgZmlsZVxuICAgICAgICAgICAgbGV0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKHNvdXJjZUZpbGUpO1xuICAgICAgICAgICAgY29uc3QgZXNjYXBlZCA9IHRhc2tUZXh0LnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCAnXFxcXCQmJyk7XG4gICAgICAgICAgICBjb25zdCBwYXQgPSBuZXcgUmVnRXhwKGBeXFxcXHMqLSBcXFxcW1sgeF1cXFxcXSAke2VzY2FwZWR9XFxcXG4/YCwgJ20nKTtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UocGF0LCAnJyk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoc291cmNlRmlsZSwgY29udGVudCk7XG5cbiAgICAgICAgICAgIC8vIFJlZnJlc2ggdGhlIHZpZXdcbiAgICAgICAgICAgIHRoaXMuaW52YWxpZGF0ZVRhYkNhY2hlKCdrYW5iYW4nKTtcbiAgICAgICAgICAgIHRoaXMuc3dpdGNoVGFiKCdrYW5iYW4nKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4geyB0aGlzLl9zdXBwcmVzc1JlZnJlc2ggPSBmYWxzZTsgfSwgMjAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBNb3ZlIGEgdGFzayBmcm9tIGEgc291cmNlIGZpbGUgdG8gYSBzcGVjaWZpYyB0YXJnZXQgZGF0ZSdzIGRhaWx5IG5vdGUgKi9cbiAgICBwdWJsaWMgYXN5bmMgbW92ZVRhc2tUb0RhdGUoc291cmNlRmlsZTogVEZpbGUsIHRhc2tUZXh0OiBzdHJpbmcsIHRhcmdldERhdGU6IERhdGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgdGhpcy5fc3VwcHJlc3NSZWZyZXNoID0gdHJ1ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldE5vdGUgPSBhd2FpdCB0aGlzLnBsdWdpbi52YXVsdE1hbmFnZXIuZ2V0T3JDcmVhdGVEYWlseU5vdGUodGFyZ2V0RGF0ZSk7XG5cbiAgICAgICAgICAgIC8vIERvbid0IG1vdmUgaWYgc291cmNlIGFuZCB0YXJnZXQgYXJlIHRoZSBzYW1lIGZpbGVcbiAgICAgICAgICAgIGlmIChzb3VyY2VGaWxlLnBhdGggPT09IHRhcmdldE5vdGUucGF0aCkgcmV0dXJuO1xuXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFkZE1kVGFzayh0YXJnZXROb3RlLCB0YXNrVGV4dCk7XG5cbiAgICAgICAgICAgIC8vIFJlbW92ZSBmcm9tIHNvdXJjZSBmaWxlXG4gICAgICAgICAgICBsZXQgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoc291cmNlRmlsZSk7XG4gICAgICAgICAgICBjb25zdCBlc2NhcGVkID0gdGFza1RleHQucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKTtcbiAgICAgICAgICAgIGNvbnN0IHBhdCA9IG5ldyBSZWdFeHAoYF5cXFxccyotIFxcXFxbWyB4XVxcXFxdICR7ZXNjYXBlZH1cXFxcbj9gLCAnbScpO1xuICAgICAgICAgICAgY29udGVudCA9IGNvbnRlbnQucmVwbGFjZShwYXQsICcnKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShzb3VyY2VGaWxlLCBjb250ZW50KTtcblxuICAgICAgICAgICAgdGhpcy5pbnZhbGlkYXRlVGFiQ2FjaGUoJ2thbmJhbicpO1xuICAgICAgICAgICAgdGhpcy5zd2l0Y2hUYWIoJ2thbmJhbicpO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7IHRoaXMuX3N1cHByZXNzUmVmcmVzaCA9IGZhbHNlOyB9LCAyMDApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqIENoYW5nZSB0aGUgaW5kZW50IGxldmVsIG9mIGEgdGFzayAocHJvbW90ZS9kZW1vdGUpICovXG4gICAgcHVibGljIGFzeW5jIHNldFRhc2tJbmRlbnQoZmlsZTogVEZpbGUsIHRhc2tUZXh0OiBzdHJpbmcsIG5ld0luZGVudDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIHRoaXMuX3N1cHByZXNzUmVmcmVzaCA9IHRydWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XG4gICAgICAgICAgICBjb25zdCBlc2NhcGVkID0gdGFza1RleHQucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKTtcbiAgICAgICAgICAgIGNvbnN0IHBhdCA9IG5ldyBSZWdFeHAoYF4oXFxcXHMqKS0gKFxcXFxbWyB4XVxcXFxdICkke2VzY2FwZWR9JGApO1xuICAgICAgICAgICAgY29uc3QgaW5kZW50ID0gTWF0aC5tYXgoMCwgbmV3SW5kZW50KTtcbiAgICAgICAgICAgIGNvbnN0IHByZWZpeCA9ICcgICcucmVwZWF0KGluZGVudCk7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBhdC50ZXN0KGxpbmVzW2ldKSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtID0gbGluZXNbaV0ubWF0Y2gocGF0KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVzW2ldID0gYCR7cHJlZml4fS0gJHttWzJdfSR7dGFza1RleHR9YDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIGxpbmVzLmpvaW4oJ1xcbicpKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4geyB0aGlzLl9zdXBwcmVzc1JlZnJlc2ggPSBmYWxzZTsgfSwgMjAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBSZW9yZGVyIGFsbCB0YXNrIGxpbmVzIGluIGEgbWFya2Rvd24gZmlsZSBieSB0aGUgZ2l2ZW4gdGV4dCBvcmRlciAqL1xuICAgIHB1YmxpYyBhc3luYyByZW9yZGVyTWRUYXNrcyhmaWxlOiBURmlsZSwgb3JkZXJlZFRleHRzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICB0aGlzLl9zdXBwcmVzc1JlZnJlc2ggPSB0cnVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgICAgICBjb25zdCBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpO1xuXG4gICAgICAgICAgICAvLyBDb2xsZWN0IGFsbCB0YXNrIGxpbmVzIGFuZCB0aGVpciBwb3NpdGlvbnNcbiAgICAgICAgICAgIGNvbnN0IHRhc2tFbnRyaWVzOiB7IGlkeDogbnVtYmVyOyBsaW5lOiBzdHJpbmc7IHRleHQ6IHN0cmluZyB9W10gPSBbXTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBtID0gbGluZXNbaV0ubWF0Y2goL14oXFxzKi0gXFxbWyB4XVxcXSApKC4rKSQvKTtcbiAgICAgICAgICAgICAgICBpZiAobSkgdGFza0VudHJpZXMucHVzaCh7IGlkeDogaSwgbGluZTogbGluZXNbaV0sIHRleHQ6IG1bMl0gfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGFza0VudHJpZXMubGVuZ3RoIDwgMikgcmV0dXJuO1xuXG4gICAgICAgICAgICAvLyBCdWlsZCByZW9yZGVyZWQgbGluZXMgZm9sbG93aW5nIHRoZSByZXF1ZXN0ZWQgdGV4dCBvcmRlclxuICAgICAgICAgICAgY29uc3QgcmVvcmRlcmVkOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0eHQgb2Ygb3JkZXJlZFRleHRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZm91bmQgPSB0YXNrRW50cmllcy5maW5kKHQgPT4gdC50ZXh0ID09PSB0eHQgJiYgIXJlb3JkZXJlZC5pbmNsdWRlcyh0LmxpbmUpKTtcbiAgICAgICAgICAgICAgICBpZiAoZm91bmQpIHJlb3JkZXJlZC5wdXNoKGZvdW5kLmxpbmUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gQXBwZW5kIGFueSB0YXNrcyBub3QgaW4gdGhlIG9yZGVyZWQgbGlzdFxuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIHRhc2tFbnRyaWVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFyZW9yZGVyZWQuaW5jbHVkZXModC5saW5lKSkgcmVvcmRlcmVkLnB1c2godC5saW5lKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUmVwbGFjZSB0YXNrIGxpbmVzIGluLXBsYWNlXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRhc2tFbnRyaWVzLmxlbmd0aCAmJiBpIDwgcmVvcmRlcmVkLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgbGluZXNbdGFza0VudHJpZXNbaV0uaWR4XSA9IHJlb3JkZXJlZFtpXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIGxpbmVzLmpvaW4oJ1xcbicpKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4geyB0aGlzLl9zdXBwcmVzc1JlZnJlc2ggPSBmYWxzZTsgfSwgMjAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4dHJhY3QgZW1vdGlvbi9lbmVyZ3kgc2NvcmVzIGZyb20gYSBkYWlseSBub3RlJ3MgYm9keSBjb250ZW50LlxuICAgICAqIENoZWNrczpcbiAgICAgKiAgIDEuICoq57K+5Yqb54q25oCBKio6IE4vMTAgIChtb3JuaW5nIGVuZXJneSlcbiAgICAgKiAgIDIuICMjIyDlvIDlv4PkuovkuI7mg4Xnu6ogc2VjdGlvbiDihpIgZmlyc3QgbnVtYmVyIG9uIHN1YnNlcXVlbnQgbGluZXMgKGV2ZW5pbmcgZW1vdGlvbilcbiAgICAgKiAgIDMuIFlBTUwgZnJvbnRtYXR0ZXIgZW1vdGlvbl9zY29yZSAoZmFsbGJhY2sgZm9yIGxlZ2FjeSBub3RlcylcbiAgICAgKiBSZXR1cm5zIHRoZSBiZXN0IGF2YWlsYWJsZSBzY29yZSAoMS0xMCksIG9yIG51bGwuXG4gICAgICovXG4gICAgcHVibGljIHBhcnNlTm90ZVNjb3Jlcyhjb250ZW50OiBzdHJpbmcpOiBudW1iZXIgfCBudWxsIHtcbiAgICAgICAgLy8gMS4gVHJ5IGV2ZW5pbmcgZW1vdGlvbiBzZWN0aW9uOiBcIiMjIOW8gOW/g+S6i+S4juaDhee7qlwiIG9yIFwiIyMjIOW8gOW/g+S6i+S4juaDhee7qlwiIGZvbGxvd2VkIGJ5IGEgbnVtYmVyXG4gICAgICAgIGNvbnN0IGVtb3Rpb25TZWN0aW9uTWF0Y2ggPSBjb250ZW50Lm1hdGNoKC8jezIsM31cXHMq5byA5b+D5LqL5LiO5oOF57uqW1xcc1xcU10qP1xcblxccyooXFxkKykvbSk7XG4gICAgICAgIGlmIChlbW90aW9uU2VjdGlvbk1hdGNoKSB7XG4gICAgICAgICAgICBjb25zdCB2ID0gcGFyc2VJbnQoZW1vdGlvblNlY3Rpb25NYXRjaFsxXSwgMTApO1xuICAgICAgICAgICAgaWYgKHYgPj0gMSAmJiB2IDw9IDEwKSByZXR1cm4gdjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIDIuIFRyeSBtb3JuaW5nIGVuZXJneTogXCIqKueyvuWKm+eKtuaAgSoqOiBOLzEwXCJcbiAgICAgICAgY29uc3QgZW5lcmd5TWF0Y2ggPSBjb250ZW50Lm1hdGNoKC9cXCpcXCrnsr7lipvnirbmgIFcXCpcXCpb77yaOl1cXHMqKFxcZCspLyk7XG4gICAgICAgIGlmIChlbmVyZ3lNYXRjaCkge1xuICAgICAgICAgICAgY29uc3QgdiA9IHBhcnNlSW50KGVuZXJneU1hdGNoWzFdLCAxMCk7XG4gICAgICAgICAgICBpZiAodiA+PSAxICYmIHYgPD0gMTApIHJldHVybiB2O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gMy4gRmFsbGJhY2s6IFlBTUwgZnJvbnRtYXR0ZXIgZW1vdGlvbl9zY29yZVxuICAgICAgICBpZiAoY29udGVudC5zdGFydHNXaXRoKCctLS0nKSkge1xuICAgICAgICAgICAgY29uc3QgZW5kID0gY29udGVudC5pbmRleE9mKCctLS0nLCAzKTtcbiAgICAgICAgICAgIGlmIChlbmQgPiAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZm0gPSBjb250ZW50LnN1YnN0cmluZyg0LCBlbmQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVtID0gZm0ubWF0Y2goL2Vtb3Rpb25fc2NvcmU6XFxzKihcXGQrKS8pO1xuICAgICAgICAgICAgICAgIGlmIChlbSkgcmV0dXJuIHBhcnNlSW50KGVtWzFdLCAxMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gS2FuYmFuIHRhYiDigJQgZGVsZWdhdGVkIHRvIFBlcmlvZGljUmVuZGVyZXJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICBwcml2YXRlIGFzeW5jIHJlbmRlckthbmJhblRhYihwYW5lbDogSFRNTEVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgYXdhaXQgdGhpcy5wZXJpb2RpY1JlbmRlcmVyLnJlbmRlcihwYW5lbCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW52YWxpZGF0ZSBhIGNhY2hlZCB0YWIgcGFuZWwgc28gdGhlIG5leHQgc3dpdGNoVGFiIHJlLXJlbmRlcnMgZnJlc2guXG4gICAgICogVXNlZCBieSBLYW5iYW5SZW5kZXJlciBuYXYgYnV0dG9ucyB0byBmb3JjZSByZS1yZW5kZXIgb24gbmF2aWdhdGlvbi5cbiAgICAgKi9cbiAgICBwdWJsaWMgaW52YWxpZGF0ZVRhYkNhY2hlKF90YWI6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICAvLyBTaW1wbGUgaW1wbGVtZW50YXRpb246IGZvcmNlIHJlLXJlbmRlciBieSBzd2l0Y2hpbmcgdGFiXG4gICAgICAgIC8vIFRoZSB0YWIgY29udGVudCBpcyBhbHdheXMgcmUtY3JlYXRlZCBieSBzd2l0Y2hUYWJcbiAgICB9XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gUmV2aWV3IHRhYiDigJQgZGVsZWdhdGVkIHRvIFJldmlld1JlbmRlcmVyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZW5kZXJSZXZpZXdUYWIocGFuZWw6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGF3YWl0IHRoaXMucmV2aWV3UmVuZGVyZXIucmVuZGVyKHBhbmVsKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW5kZXIgdGhlIGlucHV0IGFyZWFcbiAgICAgKi9cbiAgICBwcml2YXRlIHJlbmRlcklucHV0QXJlYShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgICAgIHRoaXMuaW5wdXRDb250YWluZXIgPSBjb250YWluZXIuY3JlYXRlRGl2KCd0bC1pbnB1dC1jb250YWluZXInKTtcblxuICAgICAgICB0aGlzLmlucHV0RWwgPSB0aGlzLmlucHV0Q29udGFpbmVyLmNyZWF0ZUVsKCd0ZXh0YXJlYScsIHtcbiAgICAgICAgICAgIGNsczogJ3RsLWlucHV0JyxcbiAgICAgICAgICAgIGF0dHI6IHtcbiAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcjogdCgnY2hhdC5pbnB1dFBsYWNlaG9sZGVyJyksXG4gICAgICAgICAgICAgICAgcm93czogJzMnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gSGFuZGxlIEVudGVyIGtleSAoU2hpZnQrRW50ZXIgZm9yIG5ldyBsaW5lKVxuICAgICAgICB0aGlzLmlucHV0RWwuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG4gICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFbnRlcicgJiYgIWUuc2hpZnRLZXkpIHtcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgdm9pZCB0aGlzLnNlbmRNZXNzYWdlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEF1dG8tcmVzaXplXG4gICAgICAgIHRoaXMuaW5wdXRFbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHtcbiAgICAgICAgICAgIHRoaXMuaW5wdXRFbC5zZXRDc3NQcm9wcyh7ICctLXRsLWlucHV0LWhlaWdodCc6ICdhdXRvJyB9KTtcbiAgICAgICAgICAgIHRoaXMuaW5wdXRFbC5zZXRDc3NQcm9wcyh7ICctLXRsLWlucHV0LWhlaWdodCc6IGAke01hdGgubWluKHRoaXMuaW5wdXRFbC5zY3JvbGxIZWlnaHQsIDE1MCl9cHhgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBidXR0b25Db250YWluZXIgPSB0aGlzLmlucHV0Q29udGFpbmVyLmNyZWF0ZURpdigndGwtaW5wdXQtYnV0dG9ucycpO1xuXG4gICAgICAgIHRoaXMuc2VuZEJ1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywge1xuICAgICAgICAgICAgY2xzOiAndGwtc2VuZC1idG4nLFxuICAgICAgICAgICAgdGV4dDogdCgnY2hhdC5zZW5kJyksXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnNlbmRCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7IHZvaWQgdGhpcy5zZW5kTWVzc2FnZSgpOyB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaG93IHdlbGNvbWUgbWVzc2FnZVxuICAgICAqL1xuICAgIHByaXZhdGUgc2hvd1dlbGNvbWVNZXNzYWdlKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmFkZEFJTWVzc2FnZShnZXRMYW5ndWFnZSgpID09PSAnZW4nXG4gICAgICAgICAgICA/IGBIZWxsbyDwn5GLXG5cbkknbSB5b3VyIEFJIGNvYWNoLCBoZWxwaW5nIHlvdSBidWlsZCBoYWJpdHMgZm9yIGNvbnRpbnVvdXMgZ3Jvd3RoLlxuXG4qKvCfjJkgUmV2aWV3Kiog4oCUIFJldmlldyB5b3VyIGRheSwgcmVjb3JkIGFjaGlldmVtZW50cyAmIGVtb3Rpb25zXG4qKvCfkqEgSW5zaWdodCoqIOKAlCBJbnNpZ2h0IGFuYWx5c2lzLCBnZW5lcmF0ZSByZXBvcnRzXG5cbkNsaWNrIGEgYnV0dG9uIGFib3ZlIHRvIHN0YXJ0LCBvciB0eXBlIHlvdXIgdGhvdWdodHMuYFxuICAgICAgICAgICAgOiBg5L2g5aW9IPCfkYtcblxu5oiR5piv5L2g55qEIEFJIOaVmee7g++8jOW4ruWKqeS9oOW7uueri+aMgee7reaIkOmVv+eahOS5oOaDr+OAglxuXG4qKvCfjJkgUmV2aWV3Kiog4oCUIOWbnumhvuS4gOWkqe+8jOiusOW9leaIkOWwseS4juaDhee7qlxuKirwn5KhIEluc2lnaHQqKiDigJQg5rSe5a+f5YiG5p6Q77yM55Sf5oiQ5oql5ZGKXG5cbueCueWHu+S4iuaWueaMiemSruW8gOWni++8jOaIluebtOaOpei+k+WFpeS9oOeahOaDs+azleOAgmApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN0YXJ0IFNPUCB3b3JrZmxvd1xuICAgICAqL1xuICAgIHN0YXJ0U09QKHR5cGU6IFNPUFR5cGUpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zb3BDb250ZXh0ID0ge1xuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIGN1cnJlbnRTdGVwOiAwLFxuICAgICAgICAgICAgcmVzcG9uc2VzOiB7fSxcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBDbGVhciBtZXNzYWdlcyBhbmQgaGlkZSB0YXNrIGlucHV0IGlmIHZpc2libGVcbiAgICAgICAgdGhpcy5tZXNzYWdlcyA9IFtdO1xuICAgICAgICB0aGlzLm1lc3NhZ2VzQ29udGFpbmVyLmVtcHR5KCk7XG5cbiAgICAgICAgaWYgKHR5cGUgPT09ICdtb3JuaW5nJykge1xuICAgICAgICAgICAgdm9pZCB0aGlzLnN0YXJ0TW9ybmluZ1NPUCgpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdldmVuaW5nJykge1xuICAgICAgICAgICAgdm9pZCB0aGlzLnN0YXJ0RXZlbmluZ1NPUCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RhcnQgbW9ybmluZyBTT1BcbiAgICAgKi9cbiAgICBhc3luYyBzdGFydE1vcm5pbmdTT1AoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIC8vIENoZWNrIGlmIHRvZGF5J3MgcGxhbiBhbHJlYWR5IGV4aXN0c1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZGFpbHlOb3RlUGF0aCA9IHRoaXMucGx1Z2luLnZhdWx0TWFuYWdlci5nZXREYWlseU5vdGVQYXRoKCk7XG4gICAgICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGRhaWx5Tm90ZVBhdGgpO1xuICAgICAgICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICAgICAgICAgIGlmIChjb250ZW50LmluY2x1ZGVzKCfnsr7lipvnirbmgIEnKSB8fCBjb250ZW50LmluY2x1ZGVzKCdlbmVyZ3knKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZEFJTWVzc2FnZSh0KCdjaGF0LnBsYW5FeGlzdHNNb2RpZnknKSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgLy8gSWYgY2hlY2sgZmFpbHMsIGp1c3QgcHJvY2VlZCB3aXRoIGZ1bGwgU09QXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmFkZEFJTWVzc2FnZSh0KCdjaGF0LnN0YXJ0TW9ybmluZycpKTtcbiAgICAgICAgYXdhaXQgdGhpcy5tb3JuaW5nU09QLnN0YXJ0KHRoaXMuc29wQ29udGV4dCwgKG1lc3NhZ2UpID0+IHtcbiAgICAgICAgICAgIHRoaXMuYWRkQUlNZXNzYWdlKG1lc3NhZ2UpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydCBldmVuaW5nIFNPUFxuICAgICAqL1xuICAgIGFzeW5jIHN0YXJ0RXZlbmluZ1NPUCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgdGhpcy5hZGRBSU1lc3NhZ2UodCgnY2hhdC5zdGFydEV2ZW5pbmcnKSk7XG4gICAgICAgIGF3YWl0IHRoaXMuZXZlbmluZ1NPUC5zdGFydCh0aGlzLnNvcENvbnRleHQsIChtZXNzYWdlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmFkZEFJTWVzc2FnZShtZXNzYWdlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RhcnQgY2hhdCB3aXRoIHByZS1maWxsZWQgY29udGV4dCAoY2FsbGVkIGZyb20gZGFzaGJvYXJkKVxuICAgICAqL1xuICAgIHB1YmxpYyBzdGFydENoYXRXaXRoQ29udGV4dChjb250ZXh0OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zd2l0Y2hUYWIoJ2NoYXQnLCB0cnVlKTtcbiAgICAgICAgdGhpcy5zb3BDb250ZXh0ID0ge1xuICAgICAgICAgICAgdHlwZTogJ25vbmUnLFxuICAgICAgICAgICAgY3VycmVudFN0ZXA6IDAsXG4gICAgICAgICAgICByZXNwb25zZXM6IHt9LFxuICAgICAgICB9O1xuICAgICAgICB0aGlzLm1lc3NhZ2VzID0gW107XG4gICAgICAgIHRoaXMubWVzc2FnZXNDb250YWluZXIuZW1wdHkoKTtcbiAgICAgICAgdGhpcy5hZGRBSU1lc3NhZ2UodCgnY2hhdC5kYXNoYm9hcmRDaGF0JykpO1xuICAgICAgICAvLyBJbmplY3QgY29udGV4dCBhcyBzeXN0ZW0tbGV2ZWwgYmFja2dyb3VuZCBmb3IgdGhlIEFJXG4gICAgICAgIHRoaXMubWVzc2FnZXMucHVzaCh7XG4gICAgICAgICAgICByb2xlOiAnc3lzdGVtJyxcbiAgICAgICAgICAgIGNvbnRlbnQ6IGdldExhbmd1YWdlKCkgPT09ICdlbidcbiAgICAgICAgICAgICAgICA/IGBUaGUgZm9sbG93aW5nIGlzIHRoZSB1c2VyJ3MgZGFzaGJvYXJkIHN1bW1hcnkgZGF0YS4gUGxlYXNlIGFuc3dlciB0aGUgdXNlcidzIHF1ZXN0aW9ucyBiYXNlZCBvbiB0aGlzIGRhdGE6XFxuXFxuJHtjb250ZXh0fWBcbiAgICAgICAgICAgICAgICA6IGDku6XkuIvmmK/nlKjmiLfku6rooajnm5jkuIrnmoTmkZjopoHmlbDmja7vvIzor7fln7rkuo7ov5nkupvmlbDmja7lm57nrZTnlKjmiLfnmoTpl67popjvvJpcXG5cXG4ke2NvbnRleHR9YCxcbiAgICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RhcnQgZnJlZSBjaGF0IG1vZGVcbiAgICAgKi9cbiAgICBwcml2YXRlIHN0YXJ0RnJlZUNoYXQoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc29wQ29udGV4dCA9IHtcbiAgICAgICAgICAgIHR5cGU6ICdub25lJyxcbiAgICAgICAgICAgIGN1cnJlbnRTdGVwOiAwLFxuICAgICAgICAgICAgcmVzcG9uc2VzOiB7fSxcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLm1lc3NhZ2VzID0gW107XG4gICAgICAgIHRoaXMubWVzc2FnZXNDb250YWluZXIuZW1wdHkoKTtcblxuICAgICAgICBjb25zdCBtZXNzYWdlRWwgPSB0aGlzLmNyZWF0ZU1lc3NhZ2VFbGVtZW50KCdhaScpO1xuICAgICAgICBjb25zdCBjb250ZW50RGl2ID0gbWVzc2FnZUVsLmNyZWF0ZURpdigpO1xuICAgICAgICB2b2lkIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyKFxuICAgICAgICAgICAgdGhpcy5hcHAsXG4gICAgICAgICAgICBnZXRMYW5ndWFnZSgpID09PSAnZW4nXG4gICAgICAgICAgICAgICAgPyBgRnJlZSBDaGF0IE1vZGUg8J+SrFxuXG5UYWxrIGFib3V0IGFueXRoaW5nIOKAlCBwcm9ibGVtcyB5b3UncmUgZmFjaW5nLCBpZGVhcyB0byBvcmdhbml6ZSwgdG9waWNzIHRvIGRpc2N1c3MuXG5cbllvdSBjYW4gYWxzbyB1c2UgdGhlIGJ1dHRvbnMgYmVsb3cgdG8gZ2VuZXJhdGUgaW5zaWdodCByZXBvcnRzOmBcbiAgICAgICAgICAgICAgICA6IGDoh6rnlLHlr7nor53mqKHlvI8g8J+SrFxuXG7ogYrku4DkuYjpg73lj6/ku6Ug4oCUIOmBh+WIsOeahOmXrumimOOAgeaDs+ais+eQhueahOaDs+azleOAgeaDs+iuqOiuuueahOivnemimOOAglxuXG7kuZ/lj6/ku6XnlKjkuIvmlrnmjInpkq7nlJ/miJDmtJ7lr5/miqXlkYrvvJpgLFxuICAgICAgICAgICAgY29udGVudERpdixcbiAgICAgICAgICAgICcnLFxuICAgICAgICAgICAgdGhpc1xuICAgICAgICApO1xuXG4gICAgICAgIC8vIEluc2lnaHQgZ2VuZXJhdGlvbiBidXR0b25zXG4gICAgICAgIGNvbnN0IGJ0bkdyb3VwID0gbWVzc2FnZUVsLmNyZWF0ZURpdigndGwtaW5zaWdodC1idXR0b25zJyk7XG5cbiAgICAgICAgY29uc3QgaXNQcm8gPSB0aGlzLnBsdWdpbi5saWNlbnNlTWFuYWdlci5pc1BybygpO1xuXG4gICAgICAgIGNvbnN0IHdlZWtseUJ0biA9IGJ0bkdyb3VwLmNyZWF0ZUVsKCdidXR0b24nLCB7XG4gICAgICAgICAgICBjbHM6IGB0bC1pbnNpZ2h0LWJ0biAkeyFpc1BybyA/ICd0bC1wcm8tbG9ja2VkLWJ0bicgOiAnJ31gLFxuICAgICAgICAgICAgdGV4dDogYPCfk4ogJHt0KCdjaGF0LndlZWtseUluc2lnaHQnKX0keyFpc1BybyA/ICcg8J+UkicgOiAnJ31gLFxuICAgICAgICB9KTtcbiAgICAgICAgd2Vla2x5QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc1Bybykge1xuICAgICAgICAgICAgICAgIG5ldyBQcm9Nb2RhbCh0aGlzLmFwcCwgdCgnY2hhdC53ZWVrbHlJbnNpZ2h0JyksIHRoaXMucGx1Z2luLmxpY2Vuc2VNYW5hZ2VyKS5vcGVuKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy50cmlnZ2VySW5zaWdodCgnd2Vla2x5Jyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IG1vbnRobHlCdG4gPSBidG5Hcm91cC5jcmVhdGVFbCgnYnV0dG9uJywge1xuICAgICAgICAgICAgY2xzOiBgdGwtaW5zaWdodC1idG4gJHshaXNQcm8gPyAndGwtcHJvLWxvY2tlZC1idG4nIDogJyd9YCxcbiAgICAgICAgICAgIHRleHQ6IGDwn5OIICR7dCgnY2hhdC5tb250aGx5SW5zaWdodCcpfSR7IWlzUHJvID8gJyDwn5SSJyA6ICcnfWAsXG4gICAgICAgIH0pO1xuICAgICAgICBtb250aGx5QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc1Bybykge1xuICAgICAgICAgICAgICAgIG5ldyBQcm9Nb2RhbCh0aGlzLmFwcCwgdCgnY2hhdC5tb250aGx5SW5zaWdodCcpLCB0aGlzLnBsdWdpbi5saWNlbnNlTWFuYWdlcikub3BlbigpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMudHJpZ2dlckluc2lnaHQoJ21vbnRobHknKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgcHJvZmlsZUJ0biA9IGJ0bkdyb3VwLmNyZWF0ZUVsKCdidXR0b24nLCB7XG4gICAgICAgICAgICBjbHM6IGB0bC1pbnNpZ2h0LWJ0biAkeyFpc1BybyA/ICd0bC1wcm8tbG9ja2VkLWJ0bicgOiAnJ31gLFxuICAgICAgICAgICAgdGV4dDogYPCfkaQgJHt0KCdjaGF0LnByb2ZpbGVTdWdnZXN0aW9uJyl9JHshaXNQcm8gPyAnIPCflJInIDogJyd9YCxcbiAgICAgICAgfSk7XG4gICAgICAgIHByb2ZpbGVCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoIWlzUHJvKSB7XG4gICAgICAgICAgICAgICAgbmV3IFByb01vZGFsKHRoaXMuYXBwLCB0KCdjaGF0LnByb2ZpbGVTdWdnZXN0aW9uJyksIHRoaXMucGx1Z2luLmxpY2Vuc2VNYW5hZ2VyKS5vcGVuKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy50cmlnZ2VyUHJvZmlsZVN1Z2dlc3Rpb24oKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5zY3JvbGxUb0JvdHRvbSgpO1xuICAgIH1cblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBNZXNzYWdlIGhhbmRsaW5nIOKAlCBkZWxlZ2F0ZWQgdG8gQ2hhdENvbnRyb2xsZXJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICBwcml2YXRlIGFzeW5jIHNlbmRNZXNzYWdlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBhd2FpdCB0aGlzLmNoYXRDb250cm9sbGVyLnNlbmRNZXNzYWdlKCk7XG4gICAgfVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIE1lc3NhZ2UgcmVuZGVyaW5nIChzdGF5cyBpbiBDaGF0VmlldyDigJQgY29yZSBVSSlcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvKipcbiAgICAgKiBBZGQgYSB1c2VyIG1lc3NhZ2UgdG8gdGhlIFVJXG4gICAgICovXG4gICAgYWRkVXNlck1lc3NhZ2UoY29udGVudDogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2VFbCA9IHRoaXMuY3JlYXRlTWVzc2FnZUVsZW1lbnQoJ3VzZXInKTtcbiAgICAgICAgbWVzc2FnZUVsLnNldFRleHQoY29udGVudCk7XG4gICAgICAgIHRoaXMuc2Nyb2xsVG9Cb3R0b20oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGQgYW4gQUkgbWVzc2FnZSB0byB0aGUgVUlcbiAgICAgKi9cbiAgICBhZGRBSU1lc3NhZ2UoY29udGVudDogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2VFbCA9IHRoaXMuY3JlYXRlTWVzc2FnZUVsZW1lbnQoJ2FpJyk7XG4gICAgICAgIHZvaWQgTWFya2Rvd25SZW5kZXJlci5yZW5kZXIodGhpcy5hcHAsIGNvbnRlbnQsIG1lc3NhZ2VFbCwgJycsIHRoaXMpO1xuICAgICAgICB0aGlzLnNjcm9sbFRvQm90dG9tKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RyZWFtIGFuIEFJIG1lc3NhZ2UgKGZvciBTT1AgcmVzcG9uc2VzKVxuICAgICAqL1xuICAgIHN0cmVhbUFJTWVzc2FnZShjb250ZW50OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgbWVzc2FnZUVsID0gdGhpcy5jcmVhdGVNZXNzYWdlRWxlbWVudCgnYWknKTtcbiAgICAgICAgbGV0IGN1cnJlbnRJbmRleCA9IDA7XG5cbiAgICAgICAgY29uc3QgdHlwZXdyaXRlciA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50SW5kZXggPCBjb250ZW50Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRJbmRleCA9IE1hdGgubWluKGN1cnJlbnRJbmRleCArIDMsIGNvbnRlbnQubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICBtZXNzYWdlRWwuZW1wdHkoKTtcbiAgICAgICAgICAgICAgICB2b2lkIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyKHRoaXMuYXBwLCBjb250ZW50LnN1YnN0cmluZygwLCBjdXJyZW50SW5kZXgpLCBtZXNzYWdlRWwsICcnLCB0aGlzKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbFRvQm90dG9tKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodHlwZXdyaXRlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIDE1KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBtZXNzYWdlIGVsZW1lbnRcbiAgICAgKi9cbiAgICBjcmVhdGVNZXNzYWdlRWxlbWVudCh0eXBlOiAndXNlcicgfCAnYWknKTogSFRNTEVsZW1lbnQge1xuICAgICAgICBjb25zdCB3cmFwcGVyID0gdGhpcy5tZXNzYWdlc0NvbnRhaW5lci5jcmVhdGVEaXYoXG4gICAgICAgICAgICBgdGwtbWVzc2FnZSB0bC1tZXNzYWdlLSR7dHlwZX1gXG4gICAgICAgICk7XG5cbiAgICAgICAgY29uc3QgYXZhdGFyID0gd3JhcHBlci5jcmVhdGVEaXYoJ3RsLW1lc3NhZ2UtYXZhdGFyJyk7XG4gICAgICAgIGlmICh0eXBlID09PSAndXNlcicpIHtcbiAgICAgICAgICAgIHNldEljb24oYXZhdGFyLCAndXNlcicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2V0SWNvbihhdmF0YXIsICd0aWRlbG9nLXdhdmUnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSB3cmFwcGVyLmNyZWF0ZURpdigndGwtbWVzc2FnZS1jb250ZW50Jyk7XG5cbiAgICAgICAgcmV0dXJuIGNvbnRlbnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xsIHRvIGJvdHRvbSBvZiBtZXNzYWdlc1xuICAgICAqL1xuICAgIHNjcm9sbFRvQm90dG9tKCk6IHZvaWQge1xuICAgICAgICB0aGlzLm1lc3NhZ2VzQ29udGFpbmVyLnNjcm9sbFRvcCA9IHRoaXMubWVzc2FnZXNDb250YWluZXIuc2Nyb2xsSGVpZ2h0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNob3cgYSB0aGlua2luZyBpbmRpY2F0b3IgKGFuaW1hdGVkIGRvdHMpIHdoaWxlIEFJIGlzIHByb2Nlc3NpbmdcbiAgICAgKi9cbiAgICBzaG93VGhpbmtpbmdJbmRpY2F0b3IoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuaGlkZVRoaW5raW5nSW5kaWNhdG9yKCk7IC8vIFJlbW92ZSBhbnkgZXhpc3RpbmcgaW5kaWNhdG9yXG4gICAgICAgIGNvbnN0IHdyYXBwZXIgPSB0aGlzLm1lc3NhZ2VzQ29udGFpbmVyLmNyZWF0ZURpdigndGwtbWVzc2FnZSB0bC1tZXNzYWdlLWFpIHRsLXRoaW5raW5nLWluZGljYXRvcicpO1xuICAgICAgICBjb25zdCBhdmF0YXIgPSB3cmFwcGVyLmNyZWF0ZURpdigndGwtbWVzc2FnZS1hdmF0YXInKTtcbiAgICAgICAgc2V0SWNvbihhdmF0YXIsICd0aWRlbG9nLXdhdmUnKTtcbiAgICAgICAgY29uc3QgY29udGVudCA9IHdyYXBwZXIuY3JlYXRlRGl2KCd0bC1tZXNzYWdlLWNvbnRlbnQnKTtcbiAgICAgICAgY29udGVudC5jcmVhdGVEaXYoJ3RsLXRoaW5raW5nLWRvdHMnKTtcbiAgICAgICAgdGhpcy5zY3JvbGxUb0JvdHRvbSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEhpZGUgdGhlIHRoaW5raW5nIGluZGljYXRvclxuICAgICAqL1xuICAgIGhpZGVUaGlua2luZ0luZGljYXRvcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5tZXNzYWdlc0NvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcudGwtdGhpbmtpbmctaW5kaWNhdG9yJykuZm9yRWFjaChlbCA9PiBlbC5yZW1vdmUoKSk7XG4gICAgfVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEluc2lnaHQgR2VuZXJhdGlvbiDigJQgZGVsZWdhdGVkIHRvIENoYXRDb250cm9sbGVyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLyoqXG4gICAgICogVHJpZ2dlciBpbnNpZ2h0IGdlbmVyYXRpb24gKHB1YmxpYywgY2FsbGVkIGZyb20gbWFpbi50cylcbiAgICAgKi9cbiAgICB0cmlnZ2VySW5zaWdodCh0eXBlOiAnd2Vla2x5JyB8ICdtb250aGx5Jyk6IHZvaWQge1xuICAgICAgICB0aGlzLmNoYXRDb250cm9sbGVyLnRyaWdnZXJJbnNpZ2h0KHR5cGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyaWdnZXIgcHJvZmlsZSBzdWdnZXN0aW9uIGdlbmVyYXRpb25cbiAgICAgKi9cbiAgICBwcml2YXRlIHRyaWdnZXJQcm9maWxlU3VnZ2VzdGlvbigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5jaGF0Q29udHJvbGxlci50cmlnZ2VyUHJvZmlsZVN1Z2dlc3Rpb24oKTtcbiAgICB9XG5cbn1cbiJdfQ==