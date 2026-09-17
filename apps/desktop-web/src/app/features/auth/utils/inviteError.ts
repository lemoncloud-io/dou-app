import { logger } from '@chatic/bridges';

/**
 * Invite-login failure surfaced to the user. Two shapes:
 *  - `format` — the pasted input never reached the backend (local parse fail),
 *    so there's no server text; we show a canned hint.
 *  - `server` — the API/socket rejected it; the raw text goes to the console and
 *    the dialog gets a sentence that says what to do next.
 */
export type InviteLoginError = { kind: 'format' } | { kind: 'server'; message: string };

/**
 * Pull the backend's own error text out of a caught error. Covers both paths:
 *  - `throwIfApiError` rethrows `new Error(data.error)` → it's already `err.message`.
 *  - an HTTP-level throw carries the body on `err.response.data` (`{ error | message }`
 *    or a bare string).
 * Falls back to the generic `err.message`; empty string lets the UI show a default.
 */
export const extractServerErrorMessage = (err: Error): string => {
    const data = (err as { response?: { data?: unknown } }).response?.data;
    if (typeof data === 'string' && data.trim()) return data.trim();
    if (data && typeof data === 'object') {
        const { error, message } = data as { error?: unknown; message?: unknown };
        if (typeof error === 'string' && error.trim()) return error.trim();
        if (typeof message === 'string' && message.trim()) return message.trim();
    }
    return err.message?.trim() ?? '';
};

type InviteErrorKey =
    | 'auth.invite.failed.format'
    | 'auth.invite.failed.notFound'
    | 'auth.invite.failed.expired'
    | 'auth.invite.failed.already'
    | 'auth.invite.failed.denied'
    | 'auth.invite.failed.network'
    | 'auth.invite.failed.generic';

/**
 * Classify the server's wire text. It used to be printed verbatim, so a mistyped
 * code produced `400 INVALID - @code[invt:bogus] is invalid (not-found)` in the
 * dialog: it reads as a crash, and it does not tell anyone what to do. The raw
 * text still reaches the console, where it is the useful thing.
 *
 * Whole-number codes only, and an unrecognised failure takes the generic line
 * rather than leaking the wire text.
 */
const serverErrorKey = (raw: string): InviteErrorKey => {
    const text = raw.toUpperCase();
    if (text.includes('EXPIRED')) return 'auth.invite.failed.expired';
    // The one the backend answers a wrong or revoked code with, `(not-found)`
    // inside a 400, so the code test alone would send it to the generic line.
    if (/\b404\b/.test(text) || text.includes('NOT FOUND') || text.includes('NOT-FOUND')) {
        return 'auth.invite.failed.notFound';
    }
    if (/\b409\b/.test(text) || text.includes('CONFLICT') || text.includes('ALREADY')) {
        return 'auth.invite.failed.already';
    }
    if (/\b403\b/.test(text) || text.includes('NOT ALLOWED') || text.includes('FORBIDDEN')) {
        return 'auth.invite.failed.denied';
    }
    if (text.includes('NETWORK') || text.includes('TIMEOUT') || text.includes('FAILED TO FETCH')) {
        return 'auth.invite.failed.network';
    }
    if (/\b400\b/.test(text) || text.includes('INVALID')) return 'auth.invite.failed.notFound';
    return 'auth.invite.failed.generic';
};

/** Resolve the user-facing line for an invite-login error. */
export const inviteLoginErrorText = (error: InviteLoginError, t: (key: string) => string): string => {
    if (error.kind === 'format') return t('auth.invite.failed.format');
    logger.error('AUTH', '[InviteLogin] rejected', { raw: error.message });
    return t(serverErrorKey(error.message));
};
