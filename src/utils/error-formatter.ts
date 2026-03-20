/**
 * User-friendly error message formatter for AI API errors.
 * Detects common HTTP status codes and error patterns across all providers.
 */

import { t } from '../i18n';

export function formatAPIError(error: unknown, providerName: string): string {
    const errMsg = String(error).toLowerCase();
    const label = providerName.charAt(0).toUpperCase() + providerName.slice(1);

    if (errMsg.includes('402') || errMsg.includes('credits') || errMsg.includes('balance') || errMsg.includes('quota') || errMsg.includes('billing') || errMsg.includes('payment')) {
        return t('error.credits', label);
    }

    if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('unauthorized') || errMsg.includes('permission')) {
        return t('error.auth', label);
    }

    if (errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('too many')) {
        return t('error.rateLimit', label);
    }

    if (errMsg.includes('404') || errMsg.includes('model not found')) {
        return t('error.modelNotFound');
    }

    if (errMsg.includes('500') || errMsg.includes('502') || errMsg.includes('503') || errMsg.includes('internal')) {
        return t('error.serverError', label);
    }

    if (errMsg.includes('network') || errMsg.includes('fetch') || errMsg.includes('failed to fetch') || errMsg.includes('econnrefused') || errMsg.includes('timeout')) {
        return t('error.network');
    }

    return t('error.unknown', label);
}
