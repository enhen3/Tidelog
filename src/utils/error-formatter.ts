/**
 * TideLog Error System — Structured error codes for user-facing diagnostics.
 *
 * Error codes follow TL-XXYY format:
 *   XX = category  (10=auth, 20=model, 30=network, 40=billing, 50=server, 60=config, 90=unknown)
 *   YY = specific   variant within category
 */

import { t } from '../i18n';

// ─── Error Codes ─────────────────────────────────────────────────────────────

export const ErrorCode = {
    AUTH_INVALID:      'TL-1001',  // API key invalid or expired
    AUTH_MISSING:      'TL-1002',  // API key not configured
    MODEL_NOT_FOUND:   'TL-2001',  // Model not found / deprecated
    NETWORK_FAILED:    'TL-3001',  // Network connection failed
    NETWORK_TIMEOUT:   'TL-3002',  // Request timeout
    BILLING_CREDITS:   'TL-4001',  // Insufficient credits / balance
    BILLING_RATE:      'TL-4002',  // Rate limit exceeded
    SERVER_ERROR:      'TL-5001',  // Provider server error (5xx)
    CONFIG_URL:        'TL-6001',  // Base URL misconfigured
    UNKNOWN:           'TL-9001',  // Unclassified error
} as const;

export type TideLogErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

// ─── TideLogError class ──────────────────────────────────────────────────────

export class TideLogError extends Error {
    code: TideLogErrorCode;
    detail: string;

    constructor(code: TideLogErrorCode, detail = '') {
        super(`[${code}] ${detail}`);
        this.code = code;
        this.detail = detail;
        this.name = 'TideLogError';
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Classify an HTTP status code into a TideLogError.
 * Used by all AI providers for consistent error handling.
 */
export function classifyHTTPError(
    status: number,
    responseText: string,
    providerName: string,
    model?: string,
): TideLogError {
    // Try to extract error message from JSON response
    let detail = responseText;
    try {
        const body = JSON.parse(responseText) as { error?: { message?: string }; message?: string };
        detail = body?.error?.message || body?.message || responseText;
    } catch { /* use raw text */ }

    if (status === 401 || status === 403) {
        return new TideLogError(ErrorCode.AUTH_INVALID, `${providerName}: ${detail}`);
    }
    if (status === 404) {
        return new TideLogError(
            ErrorCode.MODEL_NOT_FOUND,
            model ? `${providerName}: model "${model}" — ${detail}` : `${providerName}: ${detail}`
        );
    }
    if (status === 402) {
        return new TideLogError(ErrorCode.BILLING_CREDITS, `${providerName}: ${detail}`);
    }
    if (status === 429) {
        return new TideLogError(ErrorCode.BILLING_RATE, `${providerName}: ${detail}`);
    }
    if (status >= 500) {
        return new TideLogError(ErrorCode.SERVER_ERROR, `${providerName}: ${detail}`);
    }
    return new TideLogError(ErrorCode.UNKNOWN, `${providerName} HTTP ${status}: ${detail}`);
}

/**
 * Classify a network / unknown error into a TideLogError.
 */
export function classifyNetworkError(err: unknown): TideLogError {
    const msg = String(err).toLowerCase();
    if (msg.includes('timeout')) {
        return new TideLogError(ErrorCode.NETWORK_TIMEOUT, String(err));
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused') || msg.includes('failed to fetch')) {
        return new TideLogError(ErrorCode.NETWORK_FAILED, String(err));
    }
    return new TideLogError(ErrorCode.UNKNOWN, String(err));
}

// ─── User-facing formatter ──────────────────────────────────────────────────

/**
 * Format any error into a user-friendly message with error code.
 * Used by chat controller & settings tab.
 */
export function formatAPIError(error: unknown, providerName: string): string {
    // If it's already a TideLogError, use its code directly
    if (error instanceof TideLogError) {
        return formatByCode(error.code, providerName, error.detail);
    }

    // Legacy: classify from raw error string
    const errMsg = String(error).toLowerCase();
    const label = providerName.charAt(0).toUpperCase() + providerName.slice(1);

    if (errMsg.includes('402') || errMsg.includes('credits') || errMsg.includes('balance') || errMsg.includes('quota') || errMsg.includes('billing') || errMsg.includes('payment')) {
        return formatByCode(ErrorCode.BILLING_CREDITS, label);
    }
    if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('unauthorized') || errMsg.includes('permission')) {
        return formatByCode(ErrorCode.AUTH_INVALID, label);
    }
    if (errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('too many')) {
        return formatByCode(ErrorCode.BILLING_RATE, label);
    }
    if (errMsg.includes('404') || errMsg.includes('model not found')) {
        return formatByCode(ErrorCode.MODEL_NOT_FOUND, label);
    }
    if (errMsg.includes('500') || errMsg.includes('502') || errMsg.includes('503') || errMsg.includes('internal')) {
        return formatByCode(ErrorCode.SERVER_ERROR, label);
    }
    if (errMsg.includes('network') || errMsg.includes('fetch') || errMsg.includes('failed to fetch') || errMsg.includes('econnrefused') || errMsg.includes('timeout')) {
        return formatByCode(ErrorCode.NETWORK_FAILED, label);
    }
    return formatByCode(ErrorCode.UNKNOWN, label);
}

function formatByCode(code: TideLogErrorCode, provider: string, detail?: string): string {
    const detailLine = detail ? `\n\n\`${detail}\`` : '';

    switch (code) {
        case ErrorCode.AUTH_INVALID:
            return t('error.auth', provider) + `\n\n**${code}**` + detailLine;
        case ErrorCode.AUTH_MISSING:
            return t('error.auth', provider) + `\n\n**${code}**` + detailLine;
        case ErrorCode.MODEL_NOT_FOUND:
            return t('error.modelNotFound') + `\n\n**${code}**` + detailLine;
        case ErrorCode.NETWORK_FAILED:
            return t('error.network') + `\n\n**${code}**` + detailLine;
        case ErrorCode.NETWORK_TIMEOUT:
            return t('error.network') + `\n\n**${code}**` + detailLine;
        case ErrorCode.BILLING_CREDITS:
            return t('error.credits', provider) + `\n\n**${code}**` + detailLine;
        case ErrorCode.BILLING_RATE:
            return t('error.rateLimit', provider) + `\n\n**${code}**` + detailLine;
        case ErrorCode.SERVER_ERROR:
            return t('error.serverError', provider) + `\n\n**${code}**` + detailLine;
        case ErrorCode.CONFIG_URL:
            return t('error.network') + `\n\n**${code}**` + detailLine;
        default:
            return t('error.unknown', provider) + `\n\n**${code}**` + detailLine;
    }
}
