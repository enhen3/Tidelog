/**
 * TideLog — Type Definitions
 */

import type { Language } from './i18n';

// =============================================================================
// License
// =============================================================================

export interface LicenseInfo {
    key: string;
    activated: boolean;
    activatedAt?: number;
    deviceId?: string;
    lastVerified?: number;
    licenseType?: 'monthly' | 'annual' | 'lifetime';
    expiresAt?: number; // epoch ms, null for lifetime
}

export interface TrialInfo {
    startedAt?: number;
    expiresAt?: number;
    offerShownAt?: number;
}

// =============================================================================
// Plugin Settings
// =============================================================================

export type AIProviderType = 'openrouter' | 'anthropic' | 'gemini' | 'openai' | 'siliconflow' | 'custom';

export interface ProviderConfig {
    apiKey: string;
    model: string;
    enabled: boolean;
    baseUrl?: string;
}

export interface TideLogSettings {
    // License
    proLicense: LicenseInfo;
    trial: TrialInfo;

    // Language
    language: Language;

    // Onboarding
    onboardingCompleted: boolean;
    /** 是否已经在设置页看过一次默认展开的 TideLog 快速介绍。 */
    quickGuideSeen: boolean;
    firstInsightCompleted: boolean;
    /** 已在复盘反馈里提示过「可以从旧日记生成画像」的时间戳。null 表示还没提示过。 */
    firstInsightHintShownAt: number | null;

    // AI Provider Settings
    activeProvider: AIProviderType;
    providers: {
        openrouter: ProviderConfig;
        anthropic: ProviderConfig;
        gemini: ProviderConfig;
        openai: ProviderConfig;
        siliconflow: ProviderConfig;
        custom: ProviderConfig;
    };

    // Date Logic
    dayBoundaryHour: number; // Default 6 (6:00 AM)

    // Folder Paths
    dailyFolder: string;
    planFolder: string;
    archiveFolder: string;

    // SOP Preferences
    enableMorningSOP: boolean;
    enableEveningSOP: boolean;
    includeOptionalQuestions: boolean;

    // Evening SOP Questions (user-configurable)
    eveningQuestions: EveningQuestionConfig[];

    // Settings schema version (for migrations)
    settingsVersion?: number;
}

/**
 * User-configurable evening question
 */
export interface EveningQuestionConfig {
    type: EveningQuestionType;
    sectionName: string;
    initialMessage: string;
    required: boolean;
    enabled: boolean;
    /** Only user-created questions can be deleted from Settings. */
    custom?: boolean;
}

// =============================================================================
// Chat Messages
// =============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
    role: MessageRole;
    content: string;
    timestamp: number;
}

// =============================================================================
// SOP Context
// =============================================================================

export type SOPType = 'morning' | 'evening' | 'none';

export type EveningQuestionType =
    | 'goal_alignment'      // 必问：目标对标
    | 'success_diary'       // 必问：成功日记
    | 'happiness_emotion'   // 必问：开心事与情绪评分
    | 'anxiety_awareness'   // 必问：焦虑/不适觉察
    | 'tomorrow_plan'       // 必问：明天计划
    | 'deep_analysis'       // 选问：深度分析
    | 'reflection'          // 选问：新思考与复盘
    | 'principle_extract'   // 选问：原则提炼
    | 'free_writing';       // 选问：自由随笔

export interface SOPContext {
    type: SOPType;
    currentStep: number;
    currentQuestion?: EveningQuestionType;
    responses: Record<string, string>;
    reviewTargetDate?: string;
    weeklyPlanContent?: string;
    todayPlanContent?: string;
    userProfileContent?: string;
}

// =============================================================================
// AI Provider Interface
// =============================================================================

export interface StreamCallback {
    (chunk: string): void;
}

export type AIFeature = 'daily_insight' | 'weekly' | 'monthly' | 'profile' | 'chat';
export type AIResponseMode = 'stream' | 'buffered';

export interface AIProvider {
    name: string;
    sendMessage(
        messages: ChatMessage[],
        systemPrompt: string,
        onChunk: StreamCallback,
        feature?: AIFeature,
        /** 一次用户动作的标识。同一动作的多次调用只消耗一个配额单位。 */
        sessionId?: string,
        /** 长报告若不展示逐字过程，可用缓冲响应减少长连接中断。 */
        responseMode?: AIResponseMode,
    ): Promise<string>;
    testConnection(): Promise<boolean>;
}

// =============================================================================
// Vault File Types
// =============================================================================

export interface DailyNoteSection {
    morningPlan?: string;
    goalAlignment?: string;
    successDiary?: string;
    happinessEmotion?: string;
    anxietyAwareness?: string;
    tomorrowPlan?: string;
    deepAnalysis?: string;
    reflection?: string;
    principleExtract?: string;
    freeWriting?: string;
}

export interface WeeklyPlanData {
    weekNumber: string;
    goals: string[];
    keyTasks: string[];
}

export interface UserProfile {
    basicInfo: string;
    emotionalTraits: string;
    successPatterns: string;
    thinkingStyle: string;
    coreValues: string;
    growthBoundaries: string;
}
