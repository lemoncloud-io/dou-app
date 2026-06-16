/**
 * Invite-login failure surfaced to the user. Two shapes:
 *  - `format` — the pasted input never reached the backend (local parse fail),
 *    so there's no server text; we show a canned hint.
 *  - `server` — the API/socket rejected it; we show the backend's own message
 *    verbatim instead of a generic line, so the real cause is visible.
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

/** Resolve the user-facing line for an invite-login error: server text verbatim, canned hint otherwise. */
export const inviteLoginErrorText = (error: InviteLoginError, t: (key: string) => string): string => {
    if (error.kind === 'format') return t('auth.invite.failed.format');
    return error.message || t('auth.invite.failed.generic');
};
