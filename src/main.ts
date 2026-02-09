/**
 * Dailot — Main Plugin Entry Point
 */

import {
    App,
    Plugin,
    PluginManifest,
    WorkspaceLeaf,
    addIcon,
} from 'obsidian';

import { AIFlowSettings, DEFAULT_SETTINGS } from './types';
import { AIFlowSettingTab } from './settings/settings-tab';
import { ChatView, CHAT_VIEW_TYPE } from './views/chat-view';
import { KanbanView, KANBAN_VIEW_TYPE } from './views/kanban-view';
import { CalendarView, CALENDAR_VIEW_TYPE } from './views/calendar-view';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './views/dashboard-view';
import { VaultManager } from './services/vault-manager';
import { TemplateManager } from './services/template-manager';
import { InsightService } from './services/insight-service';
import { createAIProvider } from './services/ai-provider';
import { TaskRegistryService } from './services/task-registry';
import { KanbanService } from './services/kanban-service';
import { FileLinkService } from './services/file-linker';
import { DashboardService } from './services/dashboard-service';

export default class AIFlowManagerPlugin extends Plugin {
    settings: AIFlowSettings = DEFAULT_SETTINGS;
    vaultManager!: VaultManager;
    templateManager!: TemplateManager;
    insightService!: InsightService;
    taskRegistry!: TaskRegistryService;
    kanbanService!: KanbanService;
    fileLinkService!: FileLinkService;
    dashboardService!: DashboardService;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
    }

    async onload(): Promise<void> {
        console.log('Loading Dailot plugin');

        // Load settings
        await this.loadSettings();

        // Initialize managers
        this.vaultManager = new VaultManager(this.app, this.settings);
        this.templateManager = new TemplateManager(this.app, this.settings);
        this.insightService = new InsightService(this);
        this.taskRegistry = new TaskRegistryService(this.app, this.settings);
        this.kanbanService = new KanbanService(this.app, this.settings, this.taskRegistry);
        this.fileLinkService = new FileLinkService(this.app, this.settings, this.kanbanService);
        this.dashboardService = new DashboardService(this.app, this.settings);

        // Ensure vault structure exists
        await this.initializeVaultStructure();

        // Register views
        this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));
        this.registerView(KANBAN_VIEW_TYPE, (leaf) => new KanbanView(leaf, this));
        this.registerView(CALENDAR_VIEW_TYPE, (leaf) => new CalendarView(leaf, this));
        this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));

        // Register custom helm icon for ribbon
        addIcon('dailot-helm', `<circle cx="50" cy="50" r="14" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" stroke-width="6"/><line x1="50" y1="18" x2="50" y2="4" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><line x1="50" y1="82" x2="50" y2="96" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><line x1="18" y1="50" x2="4" y2="50" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><line x1="82" y1="50" x2="96" y2="50" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><line x1="27.4" y1="27.4" x2="17.5" y2="17.5" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><line x1="72.6" y1="72.6" x2="82.5" y2="82.5" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><line x1="27.4" y1="72.6" x2="17.5" y2="82.5" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><line x1="72.6" y1="27.4" x2="82.5" y2="17.5" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>`);

        // Add ribbon icons
        this.addRibbonIcon('dailot-helm', 'Dailot「小舵」', () => {
            this.activateChatView();
        });

        this.addRibbonIcon('layout-dashboard', '仪表盘', () => {
            this.openView(DASHBOARD_VIEW_TYPE);
        });

        // Add commands
        this.addCommand({
            id: 'open-chat',
            name: 'Open Chat',
            callback: () => {
                this.activateChatView();
            },
        });

        this.addCommand({
            id: 'start-morning-sop',
            name: 'Start Morning Review',
            callback: () => {
                this.activateChatView('morning');
            },
        });

        this.addCommand({
            id: 'start-evening-sop',
            name: 'Start Evening Review',
            callback: () => {
                this.activateChatView('evening');
            },
        });

        this.addCommand({
            id: 'generate-weekly-insight',
            name: 'Generate Weekly Insight',
            callback: () => {
                this.generateInsight('weekly');
            },
        });

        this.addCommand({
            id: 'generate-monthly-insight',
            name: 'Generate Monthly Insight',
            callback: () => {
                this.generateInsight('monthly');
            },
        });

        this.addCommand({
            id: 'generate-dashboard',
            name: 'Generate / Refresh Dashboard (Markdown)',
            callback: async () => {
                const file = await this.dashboardService.generateDashboard();
                const leaf = this.app.workspace.getLeaf();
                await leaf.openFile(file);
            },
        });

        this.addCommand({
            id: 'sync-kanban',
            name: 'Sync Today to Kanban Board',
            callback: async () => {
                await this.kanbanService.syncFromDailyNote();
            },
        });

        this.addCommand({
            id: 'open-kanban-view',
            name: 'Open Kanban Board',
            callback: () => this.openView(KANBAN_VIEW_TYPE),
        });

        this.addCommand({
            id: 'open-calendar-view',
            name: 'Open Calendar Heatmap',
            callback: () => this.openView(CALENDAR_VIEW_TYPE),
        });

        this.addCommand({
            id: 'open-dashboard-view',
            name: 'Open Dashboard',
            callback: () => this.openView(DASHBOARD_VIEW_TYPE),
        });

        // Add settings tab
        this.addSettingTab(new AIFlowSettingTab(this.app, this));

        // Auto-open chat view in sidebar when layout is ready
        this.app.workspace.onLayoutReady(async () => {
            this.activateChatView();
            // Ensure weekly kanban board exists
            try {
                await this.kanbanService.ensureWeeklyBoard();
            } catch (e) {
                console.error('[AI Flow] Failed to ensure kanban board:', e);
            }
            // Start file linker
            this.fileLinkService.startListening();
        });

        console.log('Dailot plugin loaded');
    }

    onunload(): void {
        console.log('Unloading Dailot plugin');
        this.fileLinkService.stopListening();
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    /**
     * Initialize the vault structure on first run
     */
    async initializeVaultStructure(): Promise<void> {
        // Create folder structure
        await this.vaultManager.ensureDirectoryStructure();

        // Create template files if they don't exist
        await this.templateManager.ensureTemplateFiles();
    }

    /**
     * Get the current AI provider based on settings
     */
    getAIProvider() {
        return createAIProvider(this.settings);
    }

    /**
     * Activate the chat view in the right sidebar
     */
    async activateChatView(sopType?: 'morning' | 'evening'): Promise<void> {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);

        if (leaves.length > 0) {
            // View already exists, use it
            leaf = leaves[0];
        } else {
            // Create new leaf in right sidebar
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({
                    type: CHAT_VIEW_TYPE,
                    active: true,
                });
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);

            // If SOP type specified, start the workflow
            if (sopType) {
                const view = leaf.view as ChatView;
                if (view && view.startSOP) {
                    view.startSOP(sopType);
                }
            }
        }
    }

    /**
     * Open a custom view in a new leaf
     */
    async openView(viewType: string): Promise<void> {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(viewType);

        if (leaves.length > 0) {
            workspace.revealLeaf(leaves[0]);
        } else {
            const leaf = workspace.getLeaf(true);
            await leaf.setViewState({ type: viewType, active: true });
            workspace.revealLeaf(leaf);
        }
    }

    /**
     * Generate weekly or monthly insight report
     */
    async generateInsight(type: 'weekly' | 'monthly'): Promise<void> {
        // Open chat view first
        await this.activateChatView();

        // Find the chat view and trigger insight
        const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
        if (leaves.length > 0) {
            const view = leaves[0].view as ChatView;
            if (view && view.triggerInsight) {
                view.triggerInsight(type);
            }
        }
    }
}
