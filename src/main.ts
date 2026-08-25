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

import { TideLogSettings, EveningQuestionConfig, AIProviderType } from './types';
import { DEFAULT_SETTINGS, getDefaultEveningQuestions } from './constants';
import { setLanguage, t } from './i18n';
import { TideLogSettingTab } from './settings/settings-tab';
import { ChatView, CHAT_VIEW_TYPE } from './views/chat-view';
import { KanbanView, KANBAN_VIEW_TYPE } from './views/kanban-view';
import { CalendarView, CALENDAR_VIEW_TYPE } from './views/calendar-view';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './views/dashboard-view';
import { OnboardingModal } from './views/onboarding-modal';
import { VaultManager } from './services/vault-manager';
import { TemplateManager } from './services/template-manager';
import { InsightService } from './services/insight-service';
import { LegacyImportService } from './services/legacy-import-service';
import { FirstInsightService } from './services/first-insight-service';
import { PlanSuggestionService } from './services/plan-suggestion-service';
import { createAIProvider } from './ai/ai-provider';
import { TaskRegistryService } from './services/task-registry';
import { KanbanService } from './services/kanban-service';
import { FileLinkService } from './services/file-linker';
import { DashboardService } from './services/dashboard-service';
import { LicenseManager } from './services/license-manager';
import { ProModal } from './views/pro-modal';
import { FirstInsightModal } from './views/first-insight-modal';

import { migrateSettings } from './settings-migration';

const PROVIDER_KEYS: AIProviderType[] = [
    'openrouter',
    'anthropic',
    'gemini',
    'openai',
    'siliconflow',
    'custom',
];

interface SecretStorageLike {
    getSecret(id: string): string | null;
    setSecret(id: string, value: string): void;
}

export default class TideLogPlugin extends Plugin {
    settings: TideLogSettings = DEFAULT_SETTINGS;
    vaultManager!: VaultManager;
    templateManager!: TemplateManager;
    insightService!: InsightService;
    legacyImportService!: LegacyImportService;
    firstInsightService!: FirstInsightService;
    planSuggestionService!: PlanSuggestionService;
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
        this.legacyImportService = new LegacyImportService(this);
        this.firstInsightService = new FirstInsightService(this);
        this.planSuggestionService = new PlanSuggestionService(this);
        this.taskRegistry = new TaskRegistryService(this.app, this.settings);
        this.kanbanService = new KanbanService(this.app, this.settings, this.taskRegistry, this.vaultManager);
        this.fileLinkService = new FileLinkService(this.app, this.settings, this.kanbanService);
        this.dashboardService = new DashboardService(this.app, this.settings);
        this.licenseManager = new LicenseManager(this);

        // Background license verification (non-blocking)
        void this.licenseManager.verifyOnStartup();

        // Register custom tide icon for ribbon
        addIcon('tidelog-wave', `<path d="M8 50 Q20 30 32 50 Q44 70 56 50 Q68 30 80 50 Q92 70 96 60" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M4 70 Q16 50 28 70 Q40 90 52 70 Q64 50 76 70 Q88 90 96 80" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="22" r="8" fill="currentColor"/><path d="M42 22 Q50 8 58 22" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`);

        // Plan: sunrise over horizon — new day, new plan
        addIcon('tidelog-plan', `<circle cx="50" cy="50" r="14" fill="none" stroke="currentColor" stroke-width="5"/><line x1="50" y1="28" x2="50" y2="18" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="50" y1="82" x2="50" y2="72" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="28" y1="50" x2="18" y2="50" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="82" y1="50" x2="72" y2="50" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="34.4" y1="34.4" x2="27.4" y2="27.4" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="65.6" y1="34.4" x2="72.6" y2="27.4" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="34.4" y1="65.6" x2="27.4" y2="72.6" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="65.6" y1="65.6" x2="72.6" y2="72.6" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`);

        // Review: crescent moon — evening reflection
        addIcon('tidelog-review', `<path d="M60 20 A30 30 0 1 0 60 80 A22 22 0 1 1 60 20Z" fill="currentColor"/><circle cx="72" cy="28" r="2.5" fill="currentColor"/><circle cx="82" cy="44" r="1.8" fill="currentColor"/><circle cx="76" cy="60" r="2" fill="currentColor"/>`);

        // Insights: eclipsed sun — plan meets review, synthesis
        addIcon('tidelog-insights', `<circle cx="50" cy="50" r="22" fill="none" stroke="currentColor" stroke-width="5"/><path d="M50 28 A22 22 0 0 1 50 72 A14 14 0 0 0 50 28Z" fill="currentColor"/><line x1="50" y1="18" x2="50" y2="8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><line x1="50" y1="92" x2="50" y2="82" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><line x1="18" y1="50" x2="8" y2="50" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><line x1="92" y1="50" x2="82" y2="50" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`);

        // Add ribbon icon
        this.addRibbonIcon('tidelog-wave', t('cmd.openChat'), () => {
            void this.activateChatView();
        });



        // Add commands
        this.addCommand({
            id: 'open-chat',
            name: t('cmd.openChat'),
            callback: () => {
                void this.activateChatView();
            },
        });

        this.addCommand({
            id: 'start-morning-sop',
            name: t('cmd.startMorningReview'),
            callback: () => {
                void this.activateChatView('morning');
            },
        });

        this.addCommand({
            id: 'start-evening-sop',
            name: t('cmd.startEveningReview'),
            callback: () => {
                void this.activateChatView('evening');
            },
        });

        this.addCommand({
            id: 'open-getting-started',
            name: t('cmd.openGettingStarted'),
            callback: () => {
                this.openOnboarding();
            },
        });

        this.addCommand({
            id: 'generate-weekly-insight',
            name: t('cmd.generateWeeklyInsight'),
            callback: () => {
                void this.generateInsight('weekly');
            },
        });

        this.addCommand({
            id: 'generate-monthly-insight',
            name: t('cmd.generateMonthlyInsight'),
            callback: () => {
                void this.generateInsight('monthly');
            },
        });

        this.addCommand({
            id: 'generate-first-insight',
            name: t('cmd.generateFirstInsight'),
            callback: () => {
                void this.openFirstInsight();
            },
        });

        this.addCommand({
            id: 'generate-dashboard',
            name: 'Generate / refresh dashboard (Markdown)',
            callback: async () => {
                if (!this.licenseManager.isPro()) {
                    this.showProRequired(t('view.dashboardDisplayText'));
                    return;
                }
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

        // Start passive file linking after Obsidian has restored the workspace.
        // Do not open views or create vault files on bare plugin load; TideLog
        // writes to the vault only after an explicit user action or a daily note
        // edit that belongs to the configured TideLog folder.
        this.app.workspace.onLayoutReady(() => {
            this.fileLinkService.startListening();
            if (!this.settings.onboardingCompleted) {
                this.openOnboarding();
            }
        });


    }

    onunload(): void {
        this.fileLinkService.stopListening();
    }

    async loadSettings(): Promise<void> {
        const saved: Partial<TideLogSettings> = (await this.loadData() as Partial<TideLogSettings> | null) ?? {};

        // Apply the user's saved language BEFORE generating any defaults
        // that pass through t(), so default question text resolves in the
        // user's language rather than the i18n module's startup default.
        if (saved.language) {
            setLanguage(saved.language);
        }

        // Deep merge: providers need per-key merge so new providers get defaults
        const mergedProviders = { ...DEFAULT_SETTINGS.providers };
        const savedProviders = saved.providers;
        if (savedProviders) {
            type ProviderKey = keyof typeof mergedProviders;
            for (const key of Object.keys(savedProviders) as ProviderKey[]) {
                mergedProviders[key] = {
                    ...DEFAULT_SETTINGS.providers[key],
                    ...savedProviders[key],
                };
            }
        }

        // Evening questions need a fresh, owned array so:
        //   1. UI edits don't alias-mutate DEFAULT_SETTINGS.eveningQuestions
        //   2. Defaults regenerate in the user's currently-set language
        //      (DEFAULT_SETTINGS.eveningQuestions is frozen at module load
        //      under the i18n default language, 'zh')
        const savedQuestions = saved.eveningQuestions;
        const eveningQuestions: EveningQuestionConfig[] =
            (Array.isArray(savedQuestions) && savedQuestions.length > 0)
                ? savedQuestions.map((q) => ({ ...q }))
                : getDefaultEveningQuestions();

        this.settings = {
            ...DEFAULT_SETTINGS,
            ...saved,
            trial: {
                ...DEFAULT_SETTINGS.trial,
                ...saved.trial,
            },
            providers: mergedProviders,
            eveningQuestions,
        };

        // Run any pending settings migrations (e.g. deprecated model replacement)
        const settingsMigrated = migrateSettings(this.settings);
        const secretsMigrated = this.migratePersistedSecretsToSecretStorage();
        this.loadSecretsIntoRuntimeSettings();

        if (settingsMigrated || secretsMigrated) {
            await this.saveData(this.getPersistableSettings());
        }
    }

    async saveSettings(): Promise<void> {
        this.persistRuntimeSecrets();
        await this.saveData(this.getPersistableSettings());
        setLanguage(this.settings.language);
    }

    private getProviderSecretId(provider: AIProviderType): string {
        return `tidelog-${provider}-api-key`;
    }

    private getLicenseSecretId(): string {
        return 'tidelog-license-key';
    }

    private getSecretStorage(): SecretStorageLike | null {
        const secretStorage = (this.app as App & { secretStorage?: Partial<SecretStorageLike> }).secretStorage;
        if (
            secretStorage
            && typeof secretStorage.getSecret === 'function'
            && typeof secretStorage.setSecret === 'function'
        ) {
            return secretStorage as SecretStorageLike;
        }

        return null;
    }

    private migratePersistedSecretsToSecretStorage(): boolean {
        const secretStorage = this.getSecretStorage();
        if (!secretStorage) return false;

        let migrated = false;

        for (const provider of PROVIDER_KEYS) {
            const persistedKey = this.settings.providers[provider].apiKey?.trim();
            if (!persistedKey) continue;
            secretStorage.setSecret(this.getProviderSecretId(provider), persistedKey);
            migrated = true;
        }

        const persistedLicenseKey = this.settings.proLicense.key?.trim();
        if (persistedLicenseKey) {
            secretStorage.setSecret(this.getLicenseSecretId(), persistedLicenseKey);
            migrated = true;
        }

        return migrated;
    }

    private loadSecretsIntoRuntimeSettings(): void {
        const secretStorage = this.getSecretStorage();
        if (!secretStorage) return;

        for (const provider of PROVIDER_KEYS) {
            this.settings.providers[provider].apiKey =
                secretStorage.getSecret(this.getProviderSecretId(provider)) || '';
        }

        this.settings.proLicense.key =
            secretStorage.getSecret(this.getLicenseSecretId()) || '';
    }

    private persistRuntimeSecrets(): void {
        const secretStorage = this.getSecretStorage();
        if (!secretStorage) return;

        for (const provider of PROVIDER_KEYS) {
            secretStorage.setSecret(
                this.getProviderSecretId(provider),
                this.settings.providers[provider].apiKey || '',
            );
        }

        secretStorage.setSecret(
            this.getLicenseSecretId(),
            this.settings.proLicense.key || '',
        );
    }

    private getPersistableSettings(): TideLogSettings {
        const secretStorage = this.getSecretStorage();
        const providers = { ...this.settings.providers };
        for (const provider of PROVIDER_KEYS) {
            providers[provider] = {
                ...this.settings.providers[provider],
                apiKey: secretStorage ? '' : this.settings.providers[provider].apiKey,
            };
        }

        return {
            ...this.settings,
            proLicense: {
                ...this.settings.proLicense,
                key: secretStorage ? '' : this.settings.proLicense.key,
            },
            providers,
            eveningQuestions: this.settings.eveningQuestions.map((q) => ({ ...q })),
        };
    }

    openOnboarding(): void {
        new OnboardingModal(this.app, this).open();
    }

    async openFirstInsight(): Promise<void> {
        if (this.settings.firstInsightCompleted && !this.licenseManager.isPro()) {
            this.showProRequired(t('chat.insightProfile'));
            return;
        }
        await this.initializeVaultStructure();
        new FirstInsightModal(this.app, this).open();
    }

    async showTrialOfferOnce(featureName: string): Promise<void> {
        if (
            !this.licenseManager.isTrialEligible()
            || this.settings.trial.offerShownAt
        ) {
            return;
        }

        await this.licenseManager.markTrialOfferShown();
        window.setTimeout(() => {
            new ProModal(this.app, featureName, this.licenseManager).open();
        }, 250);
    }

    /**
     * AI 是否可用。自 1.2 起 AI 能力由 TideLog 服务端统一提供，
     * 用户不再自备 API Key，因此恒为 true。
     * 保留此方法而非删除，是因为它是 13 处 UI 分支的判断依据
     * （试用闸门、首次画像入口、新手引导等），集中在此返回可一次性修正全部路径。
     */
    hasConfiguredAI(): boolean {
        return true;
    }

    async completeOnboarding(): Promise<void> {
        if (this.settings.onboardingCompleted) return;
        this.settings.onboardingCompleted = true;
        await this.saveSettings();
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
        return createAIProvider(this);
    }

    /**
     * Activate the chat view in the right sidebar.
     * Lazily initialises the vault structure and template files on first SOP/insight use.
     */
    async activateChatView(sopType?: 'morning' | 'evening'): Promise<void> {
        // Folders and template files are created on demand — never on bare plugin load.
        if (sopType) {
            await this.initializeVaultStructure();
        }
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
        if (!this.licenseManager.isPro()) {
            this.showProRequired(type === 'weekly' ? t('chat.weeklyInsight') : t('chat.monthlyInsight'));
            return;
        }

        // Ensure vault structure exists before writing insight files
        await this.initializeVaultStructure();

        // Open chat view first
        await this.activateChatView();

        // Find the chat view and open the gated Insights screen.
        // Generation must remain a user-initiated click inside the current-cycle gate.
        const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
        if (leaves.length > 0) {
            const view = leaves[0].view;
            if (view && 'openInsights' in view) {
                (view as ChatView).openInsights(type);
            }
        }
    }

    private showProRequired(featureName: string): void {
        new ProModal(this.app, featureName, this.licenseManager).open();
    }
}
