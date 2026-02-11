/**
 * Dailot — Type Definitions
 */

// =============================================================================
// Plugin Settings
// =============================================================================

export type AIProviderType = 'openrouter' | 'anthropic' | 'gemini' | 'openai' | 'custom';

export interface ProviderConfig {
    apiKey: string;
    model: string;
    enabled: boolean;
    baseUrl?: string;
}

export interface AIFlowSettings {
    // AI Provider Settings
    activeProvider: AIProviderType;
    providers: {
        openrouter: ProviderConfig;
        anthropic: ProviderConfig;
        gemini: ProviderConfig;
        openai: ProviderConfig;
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

export const DEFAULT_EVENING_QUESTIONS: EveningQuestionConfig[] = [
    {
        type: 'goal_alignment',
        sectionName: '目标对标',
        initialMessage: '让我们先来回顾一下今天的计划完成情况。\n\n今天的任务完成得怎么样？有什么顺利的或者遇到阻碍的地方吗？',
        required: true,
        enabled: true,
    },
    {
        type: 'success_diary',
        sectionName: '成功日记',
        initialMessage: '接下来，让我们记录今天的成就。\n\n今天有什么让你感到自豪或者做得不错的事情？即使是小事也值得记录。试着说出 3-5 条。',
        required: true,
        enabled: true,
    },
    {
        type: 'happiness_emotion',
        sectionName: '开心事与情绪',
        initialMessage: '很棒！现在让我们关注一下情绪。\n\n今天有什么让你开心或感到温暖的瞬间吗？如果给今天的情绪打分（1-10），你会打几分？',
        required: true,
        enabled: true,
    },
    {
        type: 'anxiety_awareness',
        sectionName: '焦虑觉察',
        initialMessage: '谢谢分享！接下来，让我们觉察一下可能的负面情绪。\n\n今天有什么让你感到焦虑、不安或不舒服的事情吗？如果没有也完全没关系，可以说"没有"。',
        required: true,
        enabled: true,
    },
    {
        type: 'tomorrow_plan',
        sectionName: '明日计划',
        initialMessage: '最后一个必答题：规划明天。\n\n明天最重要的 1-3 件事是什么？',
        required: true,
        enabled: true,
    },
    {
        type: 'deep_analysis',
        sectionName: '深度分析',
        initialMessage: '【选问】想要对今天的某件事进行深度分析吗？\n\n可以是成功的事情（分析成功因素），也可以是没完成的事情（分析阻碍因素）。\n\n如果不需要，回复"跳过"。',
        required: false,
        enabled: true,
    },
    {
        type: 'reflection',
        sectionName: '反思',
        initialMessage: '【选问】让我们用斯多葛三问来反思：\n\n1. 今天做好了什么？\n2. 有什么可以改进的？\n3. 有什么遗漏的？\n\n如果不需要，回复"跳过"。',
        required: false,
        enabled: true,
    },
    {
        type: 'principle_extract',
        sectionName: '原则提炼',
        initialMessage: '【选问】从今天的经历中，你能提炼出什么原则或教训吗？\n\n好的原则是具体、可操作的指导方针。\n\n如果不需要，回复"跳过"。',
        required: false,
        enabled: true,
    },
    {
        type: 'free_writing',
        sectionName: '自由随笔',
        initialMessage: '【选问】还有什么想说的吗？任何想法都可以。\n\n如果没有了，回复"结束"完成今天的复盘。',
        required: false,
        enabled: true,
    },
];

export const DEFAULT_SETTINGS: AIFlowSettings = {
    activeProvider: 'openrouter',
    providers: {
        openrouter: {
            apiKey: '',
            model: 'anthropic/claude-sonnet-4',
            enabled: true,
        },
        anthropic: {
            apiKey: '',
            model: 'claude-sonnet-4-20250514',
            enabled: false,
        },
        gemini: {
            apiKey: '',
            model: 'gemini-2.0-flash',
            enabled: false,
        },
        openai: {
            apiKey: '',
            model: 'gpt-4o',
            enabled: false,
        },
        custom: {
            apiKey: '',
            model: '',
            enabled: false,
            baseUrl: 'https://api.deepseek.com/v1',
        },
    },
    dayBoundaryHour: 6,
    dailyFolder: '01-Daily',
    planFolder: '02-Plan',
    archiveFolder: '03-Archive',
    enableMorningSOP: true,
    enableEveningSOP: true,
    includeOptionalQuestions: true,
    eveningQuestions: [...DEFAULT_EVENING_QUESTIONS],
};

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
