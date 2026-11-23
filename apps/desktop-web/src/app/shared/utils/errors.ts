import i18next from 'i18next';

export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

const defaultErrorMessage = (): string => i18next.t('errors.unknown');

export const extractErrorMessage = (error: any): string => {
    if (!error) {
        return defaultErrorMessage();
    }

    if (error.message) {
        return error.message;
    }

    if (error.status || error.statusText) {
        return `${error.status || ''} ${error.statusText || ''}`.trim();
    }

    if (typeof error === 'string') {
        return error;
    }

    if (error.toString && error.toString() !== '[object Object]') {
        return error.toString();
    }

    if (error.response?.data) {
        if (error.response.data.error) {
            return error.response.data.error;
        }
        if (error.response.data.message) {
            return error.response.data.message;
        }
    }

    return defaultErrorMessage();
};

const RAW_TEXT_MAX = 300;

export const serverErrorText = (error: unknown): string => {
    const text = rawErrorText(error);
    if (text.startsWith('<')) return '';
    return text.length > RAW_TEXT_MAX ? `${text.slice(0, RAW_TEXT_MAX)}…` : text;
};

const CAUSE_DEPTH_MAX = 3;

const rawErrorText = (error: unknown, depth = 0): string => {
    const own = ownErrorText(error);
    const cause = (error as { cause?: unknown } | null)?.cause;
    if (!cause || depth >= CAUSE_DEPTH_MAX) return own;
    const inner = rawErrorText(cause, depth + 1);
    if (!inner || own.includes(inner)) return own;
    return own ? `${own} — ${inner}` : inner;
};

const ownErrorText = (error: unknown): string => {
    if (!error) return '';
    const data = (error as { response?: { data?: unknown } }).response?.data;
    if (typeof data === 'string' && data.trim()) return data.trim();
    if (data && typeof data === 'object') {
        const { error: wire, message } = data as { error?: unknown; message?: unknown };
        if (typeof wire === 'string' && wire.trim()) return wire.trim();
        if (typeof message === 'string' && message.trim()) return message.trim();
    }
    if (typeof error === 'string') return error.trim();
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message.trim() : '';
};

const UNREACHED_STATUSES = new Set([408, 502, 503, 504]);

export type WireErrorKind = 'expired' | 'notFound' | 'conflict' | 'denied' | 'network' | 'invalid' | 'unknown';

export const classifyWireError = (raw: string): WireErrorKind => {
    const text = raw.toUpperCase();
    if (text.includes('EXPIRED')) return 'expired';
    if (/\b404\b/.test(text) || text.includes('NOT FOUND') || text.includes('NOT-FOUND')) return 'notFound';
    if (/\b409\b/.test(text) || text.includes('CONFLICT') || text.includes('ALREADY')) return 'conflict';
    if (/\b403\b/.test(text) || text.includes('NOT ALLOWED') || text.includes('FORBIDDEN')) return 'denied';
    const status = /^\s*([1-5]\d{2})\b/.exec(text)?.[1];
    if (status && UNREACHED_STATUSES.has(Number(status))) return 'network';
    if (!status && (text.includes('NETWORK') || text.includes('TIMEOUT') || text.includes('FAILED TO FETCH'))) {
        return 'network';
    }
    if (/\b400\b/.test(text) || text.includes('INVALID')) return 'invalid';
    return 'unknown';
};

export const socketErrorStatus = (error: unknown): number | undefined => {
    const carried = (error as { errorCode?: unknown } | null)?.errorCode;
    if (typeof carried === 'number') return carried;
    const leading = /^\s*([1-5]\d{2})\b/.exec(toError(error).message);
    return leading ? Number(leading[1]) : undefined;
};
