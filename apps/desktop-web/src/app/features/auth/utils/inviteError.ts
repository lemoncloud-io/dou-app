import { logger } from '@chatic/bridges';

import { classifyWireError, type WireErrorKind } from '../../../shared';

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
 * A mistyped code used to print the server's wire text verbatim
 * (`400 INVALID - @code[invt:bogus] is invalid (not-found)`), which reads as a
 * crash and says nothing about what to do. An unrecognised failure takes the
 * generic line rather than leaking it; the raw text still reaches the console.
 * A bare 400 means the code was not accepted, so it reads as not found.
 */
const KEY_BY_KIND: Record<WireErrorKind, InviteErrorKey> = {
    expired: 'auth.invite.failed.expired',
    notFound: 'auth.invite.failed.notFound',
    invalid: 'auth.invite.failed.notFound',
    conflict: 'auth.invite.failed.already',
    denied: 'auth.invite.failed.denied',
    network: 'auth.invite.failed.network',
    unknown: 'auth.invite.failed.generic',
};

/** Resolve the user-facing line for an invite-login error. */
export const inviteLoginErrorText = (error: InviteLoginError, t: (key: string) => string): string => {
    if (error.kind === 'format') return t('auth.invite.failed.format');
    logger.error('AUTH', '[InviteLogin] rejected', { raw: error.message });
    return t(KEY_BY_KIND[classifyWireError(error.message)]);
};
