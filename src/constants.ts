/**
 * TideLog — Constants & Default Values
 * Separated from types.ts for cleaner module organization
 */

import {
    EveningQuestionConfig,
    TideLogSettings,
} from './types';

// =============================================================================
// Default Evening Questions
// =============================================================================

export const DEFAULT_EVENING_QUESTIONS: EveningQuestionConfig[] = [
    {
        type: 'goal_alignment',
        sectionName: '目标对标',
        initialMessage: '今天过得怎么样？计划里的事情推进得顺利吗？',
        required: true,
        enabled: true,
    },
    {
        type: 'success_diary',
        sectionName: '成功日记',
        initialMessage: '今天有什么让你觉得"还不错"的事？大事小事都算 😊',
        required: true,
        enabled: true,
    },
    {
        type: 'happiness_emotion',
        sectionName: '开心事与情绪',
        initialMessage: '今天有什么开心或温暖的瞬间吗？给今天的情绪打个分吧（1-10）。',
        required: true,
        enabled: true,
    },
    {
        type: 'anxiety_awareness',
        sectionName: '焦虑觉察',
        initialMessage: '今天有没有什么让你不太舒服的事？没有的话说"没有"就好。',
        required: true,
        enabled: true,
    },
    {
        type: 'tomorrow_plan',
        sectionName: '明日计划',
        initialMessage: '明天最想推进的 1-3 件事是什么？',
        required: true,
        enabled: true,
    },
    {
        type: 'deep_analysis',
        sectionName: '深度分析',
        initialMessage: '想挑一件今天的事深入聊聊吗？成功的或没完成的都行。不需要的话回复"跳过"。',
        required: false,
        enabled: false,
    },
    {
        type: 'reflection',
        sectionName: '反思',
        initialMessage: '来做个小反思：今天做好了什么？有什么可以改进的？有什么被忽略的？\n\n不需要的话回复"跳过"。',
        required: false,
        enabled: false,
    },
    {
        type: 'principle_extract',
        sectionName: '原则提炼',
        initialMessage: '从今天的经历里，你悟到了什么可以指导未来的道理？不需要的话回复"跳过"。',
        required: false,
        enabled: false,
    },
    {
        type: 'free_writing',
        sectionName: '自由随笔',
        initialMessage: '还有什么想说的吗？什么都可以。没有的话，回复"结束"收工 🌙',
        required: false,
        enabled: false,
    },
];

// =============================================================================
// Default Plugin Settings
// =============================================================================

export const DEFAULT_SETTINGS: TideLogSettings = {
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
        siliconflow: {
            apiKey: '',
            model: 'deepseek-ai/DeepSeek-V3',
            enabled: false,
            baseUrl: 'https://api.siliconflow.cn/v1',
        },
        custom: {
            apiKey: '',
            model: '',
            enabled: false,
            baseUrl: 'https://api.deepseek.com/v1',
        },
    },
    dayBoundaryHour: 2,
    dailyFolder: '01-Daily',
    planFolder: '02-Plan',
    archiveFolder: '03-Archive',
    enableMorningSOP: true,
    enableEveningSOP: true,
    includeOptionalQuestions: true,
    eveningQuestions: [...DEFAULT_EVENING_QUESTIONS],
};
