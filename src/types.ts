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
    lastVerified?: number; // timestamp of last successful online verification
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

    // Language
    language: Language;

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

export interface AIProvider {
    name: string;
    sendMessage(
        messages: ChatMessage[],
        systemPrompt: string,
        onChunk: StreamCallback
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
