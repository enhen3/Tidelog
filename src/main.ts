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
import { setLanguage, t } from './i18n';
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
import { LicenseManager } from './services/license-manager';

import { migrateSettings } from './settings-migration';

export default class TideLogPlugin extends Plugin {
    settings: TideLogSettings = DEFAULT_SETTINGS;
    vaultManager!: VaultManager;
    templateManager!: TemplateManager;
    insightService!: InsightService;
    taskRegistry!: TaskRegistryService;
    kanbanService!: KanbanService;
    fileLinkService!: FileLinkService;
    dashboardService!: DashboardService;
    licenseManager!: LicenseManager;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
    }

    async onload(): Promise<void> {

        // Register views FIRST — before any async work.
        // Obsidian restores saved workspace leaves during onload; if the view
        // factory isn't registered yet, restored leaves show the
        // "plugin is no longer active" error.
        this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));
        this.registerView(KANBAN_VIEW_TYPE, (leaf) => new KanbanView(leaf, this));
        this.registerView(CALENDAR_VIEW_TYPE, (leaf) => new CalendarView(leaf, this));
        this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));

        // Load settings
        await this.loadSettings();

        // Set i18n language
        setLanguage(this.settings.language);

        // Initialize managers
        this.vaultManager = new VaultManager(this.app, this.settings);
        this.templateManager = new TemplateManager(this.app, this.settings);
        this.insightService = new InsightService(this);
        this.taskRegistry = new TaskRegistryService(this.app, this.settings);
        this.kanbanService = new KanbanService(this.app, this.settings, this.taskRegistry, this.vaultManager);
        this.fileLinkService = new FileLinkService(this.app, this.settings, this.kanbanService);
        this.dashboardService = new DashboardService(this.app, this.settings);
        this.licenseManager = new LicenseManager(this);

        // Background license verification (non-blocking)
        void this.licenseManager.verifyOnStartup();

        // Ensure vault structure exists
        await this.initializeVaultStructure();

        // Register custom tide icon for ribbon
        addIcon('tidelog-wave', `<path d="M8 50 Q20 30 32 50 Q44 70 56 50 Q68 30 80 50 Q92 70 96 60" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M4 70 Q16 50 28 70 Q40 90 52 70 Q64 50 76 70 Q88 90 96 80" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="22" r="8" fill="currentColor"/><path d="M42 22 Q50 8 58 22" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`);

        // Plan: sunrise over horizon — new day, new plan
        addIcon('tidelog-plan', `<circle cx="50" cy="50" r="14" fill="none" stroke="currentColor" stroke-width="5"/><line x1="50" y1="28" x2="50" y2="18" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="50" y1="82" x2="50" y2="72" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="28" y1="50" x2="18" y2="50" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="82" y1="50" x2="72" y2="50" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="34.4" y1="34.4" x2="27.4" y2="27.4" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="65.6" y1="34.4" x2="72.6" y2="27.4" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="34.4" y1="65.6" x2="27.4" y2="72.6" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="65.6" y1="65.6" x2="72.6" y2="72.6" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`);

        // Review: crescent moon — evening reflection
        addIcon('tidelog-review', `<path d="M60 20 A30 30 0 1 0 60 80 A22 22 0 1 1 60 20Z" fill="currentColor"/><circle cx="72" cy="28" r="2.5" fill="currentColor"/><circle cx="82" cy="44" r="1.8" fill="currentColor"/><circle cx="76" cy="60" r="2" fill="currentColor"/>`);

        // Insights: eclipsed sun — plan meets review, synthesis
        addIcon('tidelog-insights', `<circle cx="50" cy="50" r="22" fill="none" stroke="currentColor" stroke-width="5"/><path d="M50 28 A22 22 0 0 1 50 72 A14 14 0 0 0 50 28Z" fill="currentColor"/><line x1="50" y1="18" x2="50" y2="8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><line x1="50" y1="92" x2="50" y2="82" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><line x1="18" y1="50" x2="8" y2="50" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><line x1="92" y1="50" x2="82" y2="50" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`);

        // Add ribbon icons
        this.addRibbonIcon('tidelog-wave', 'TideLog', () => {
            void this.activateChatView();
        });



        // Add commands
        this.addCommand({
            id: 'open-chat',
            name: 'Open chat',
            callback: () => {
                void this.activateChatView();
            },
        });

        this.addCommand({
            id: 'start-morning-sop',
            name: 'Start morning review',
            callback: () => {
                void this.activateChatView('morning');
            },
        });

        this.addCommand({
            id: 'start-evening-sop',
            name: 'Start evening review',
            callback: () => {
                void this.activateChatView('evening');
            },
        });

        this.addCommand({
            id: 'generate-weekly-insight',
            name: 'Generate weekly insight',
            callback: () => {
                void this.generateInsight('weekly');
            },
        });

        this.addCommand({
            id: 'generate-monthly-insight',
            name: 'Generate monthly insight',
            callback: () => {
                void this.generateInsight('monthly');
            },
        });

        this.addCommand({
            id: 'generate-dashboard',
            name: 'Generate / refresh dashboard (Markdown)',
            callback: async () => {
                const file = await this.dashboardService.generateDashboard();
                const leaf = this.app.workspace.getLeaf();
                await leaf.openFile(file);
            },
        });

        this.addCommand({
            id: 'sync-kanban',
            name: 'Sync today to kanban board',
            callback: async () => {
                await this.kanbanService.syncFromDailyNote();
            },
        });

        this.addCommand({
            id: 'open-kanban-view',
            name: 'Open kanban board',
            callback: () => { void this.openView(KANBAN_VIEW_TYPE); },
        });

        this.addCommand({
            id: 'open-calendar-view',
            name: 'Open calendar heatmap',
            callback: () => { void this.openView(CALENDAR_VIEW_TYPE); },
        });

        this.addCommand({
            id: 'open-dashboard-view',
            name: 'Open dashboard',
            callback: () => { void this.openViewInSidebar(DASHBOARD_VIEW_TYPE); },
        });

        // Add settings tab
        this.addSettingTab(new TideLogSettingTab(this.app, this));

        // Auto-open chat view in sidebar when layout is ready
        this.app.workspace.onLayoutReady(() => {
            void this.activateChatView();
            // Ensure weekly kanban board exists
            void this.kanbanService.ensureWeeklyBoard().catch((e) => {
                console.error('[TideLog] Failed to ensure kanban board:', e);
            });
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

        // Run any pending settings migrations (e.g. deprecated model replacement)
        if (migrateSettings(this.settings)) {
            await this.saveData(this.settings);
        }
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        setLanguage(this.settings.language);
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
            void workspace.revealLeaf(leaf);

            // If SOP type specified, start the workflow
            if (sopType && leaf.view && 'startSOP' in leaf.view) {
                (leaf.view as ChatView).startSOP(sopType);
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
            void workspace.revealLeaf(leaves[0]);
        } else {
            const leaf = workspace.getLeaf(true);
            await leaf.setViewState({ type: viewType, active: true });
            void workspace.revealLeaf(leaf);
        }
    }

    /**
     * Open a custom view in the right sidebar (not the main editor area)
     */
    async openViewInSidebar(viewType: string): Promise<void> {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(viewType);

        if (leaves.length > 0) {
            void workspace.revealLeaf(leaves[0]);
        } else {
            const leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: viewType, active: true });
                void workspace.revealLeaf(leaf);
            }
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
            const view = leaves[0].view;
            if (view && 'triggerInsight' in view) {
                (view as ChatView).triggerInsight(type);
            }
        }
    }
}
