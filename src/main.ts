/**
 * TideLog — Main Plugin Entry Point
 */

import {
    App,
    Plugin,
    PluginManifest,
    WorkspaceLeaf,
    addIcon,
} from 'obsidian';

import { TideLogSettings } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { TideLogSettingTab } from './settings/settings-tab';
import { ChatView, CHAT_VIEW_TYPE } from './views/chat-view';
import { KanbanView, KANBAN_VIEW_TYPE } from './views/kanban-view';
import { CalendarView, CALENDAR_VIEW_TYPE } from './views/calendar-view';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './views/dashboard-view';
import { VaultManager } from './services/vault-manager';
import { TemplateManager } from './services/template-manager';
import { InsightService } from './services/insight-service';
import { createAIProvider } from './ai/ai-provider';
import { TaskRegistryService } from './services/task-registry';
import { KanbanService } from './services/kanban-service';
import { FileLinkService } from './services/file-linker';
import { DashboardService } from './services/dashboard-service';

export default class TideLogPlugin extends Plugin {
    settings: TideLogSettings = DEFAULT_SETTINGS;
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

        // Load settings
        await this.loadSettings();

        // Initialize managers
        this.vaultManager = new VaultManager(this.app, this.settings);
        this.templateManager = new TemplateManager(this.app, this.settings);
        this.insightService = new InsightService(this);
        this.taskRegistry = new TaskRegistryService(this.app, this.settings);
        this.kanbanService = new KanbanService(this.app, this.settings, this.taskRegistry, this.vaultManager);
        this.fileLinkService = new FileLinkService(this.app, this.settings, this.kanbanService);
        this.dashboardService = new DashboardService(this.app, this.settings);

        // Ensure vault structure exists
        await this.initializeVaultStructure();

        // Register views
        this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));
        this.registerView(KANBAN_VIEW_TYPE, (leaf) => new KanbanView(leaf, this));
        this.registerView(CALENDAR_VIEW_TYPE, (leaf) => new CalendarView(leaf, this));
        this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));

        // Register custom tide icon for ribbon
        addIcon('tidelog-wave', `<path d="M8 50 Q20 30 32 50 Q44 70 56 50 Q68 30 80 50 Q92 70 96 60" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M4 70 Q16 50 28 70 Q40 90 52 70 Q64 50 76 70 Q88 90 96 80" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="22" r="8" fill="currentColor"/><path d="M42 22 Q50 8 58 22" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`);

        // Add ribbon icons
        this.addRibbonIcon('tidelog-wave', 'TideLog', () => {
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
        this.addSettingTab(new TideLogSettingTab(this.app, this));

        // Auto-open chat view in sidebar when layout is ready
        this.app.workspace.onLayoutReady(async () => {
            this.activateChatView();
            // Ensure weekly kanban board exists
            try {
                await this.kanbanService.ensureWeeklyBoard();
            } catch (e) {
                console.error('[TideLog] Failed to ensure kanban board:', e);
            }
            // Start file linker
            this.fileLinkService.startListening();
        });


    }

    onunload(): void {
        this.fileLinkService.stopListening();
    }

    async loadSettings(): Promise<void> {
        const saved = (await this.loadData()) || {};
        // Deep merge: providers need per-key merge so new providers get defaults
        const mergedProviders = { ...DEFAULT_SETTINGS.providers };
        if (saved.providers) {
            for (const key of Object.keys(saved.providers)) {
                mergedProviders[key as keyof typeof mergedProviders] = {
                    ...DEFAULT_SETTINGS.providers[key as keyof typeof DEFAULT_SETTINGS.providers],
                    ...saved.providers[key],
                };
            }
        }
        this.settings = { ...DEFAULT_SETTINGS, ...saved, providers: mergedProviders };
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
