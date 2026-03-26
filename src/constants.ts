/**
 * TideLog — Constants & Default Values
 * Separated from types.ts for cleaner module organization
 */

import {
    EveningQuestionConfig,
    TideLogSettings,
} from './types';
import { t } from './i18n';

// =============================================================================
// Default Evening Questions
// =============================================================================

export function getDefaultEveningQuestions(): EveningQuestionConfig[] {
    return [
    {
        type: 'goal_alignment',
        sectionName: t('insight.sectionGoalAlign'),
        initialMessage: t('evening.q1'),
        required: true,
        enabled: true,
    },
    {
        type: 'success_diary',
        sectionName: t('insight.sectionSuccess'),
        initialMessage: t('evening.q2'),
        required: true,
        enabled: true,
    },
    {
        type: 'happiness_emotion',
        sectionName: t('insight.sectionJoyEmotion'),
        initialMessage: t('evening.q3'),
        required: true,
        enabled: true,
    },
    {
        type: 'anxiety_awareness',
        sectionName: t('insight.sectionAnxiety'),
        initialMessage: t('evening.q4'),
        required: true,
        enabled: true,
    },
    {
        type: 'tomorrow_plan',
        sectionName: t('insight.sectionTomorrow'),
        initialMessage: t('evening.q5'),
        required: true,
        enabled: true,
    },
    {
        type: 'deep_analysis',
        sectionName: t('insight.sectionDeep'),
        initialMessage: t('evening.q6'),
        required: false,
        enabled: false,
    },
    {
        type: 'reflection',
        sectionName: t('insight.sectionReflect'),
        initialMessage: t('evening.q7'),
        required: false,
        enabled: false,
    },
    {
        type: 'principle_extract',
        sectionName: t('insight.sectionPrinciple'),
        initialMessage: t('evening.q8'),
        required: false,
        enabled: false,
    },
    {
        type: 'free_writing',
        sectionName: t('insight.sectionFreeWrite'),
        initialMessage: t('evening.q9'),
        required: false,
        enabled: false,
    },
];
}

// =============================================================================
// Default Plugin Settings
// =============================================================================

export const DEFAULT_SETTINGS: TideLogSettings = {
    proLicense: { key: '', activated: false },
    language: 'zh',
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
            model: 'deepseek-ai/DeepSeek-V3.2',
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
    eveningQuestions: [...getDefaultEveningQuestions()],
};
