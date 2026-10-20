import { logger } from '@chatic/bridges';

import { classifyWireError, type WireErrorKind } from '../../../shared';

/**
 * Invite-login failure surfaced to the user. Two families:
 *  - turned down locally, nothing sent, so there's no server text and we show a canned hint:
 *    `format` (unparseable paste), `backend` (the link names a server this build does not trust,
 *    see `isTrustedInviteBackend`), `relay` (a phone-to-phone invite this screen cannot accept),
 *    `unmarked` (an encoded link that names no server) and `loggedIn` (an account is signed in, and
 *    joining as a guest would replace it).
 *  - `server` — the API/socket rejected it; the dialog gets a sentence that says what to do next,
 *    with the raw text under it and in the failure toast.
 */
export type InviteLoginError =
    | { kind: 'format' | 'backend' | 'relay' | 'unmarked' | 'loggedIn' }
    | { kind: 'server'; message: string };

type InviteErrorKey =
    | 'auth.invite.failed.format'
    | 'auth.invite.failed.backend'
    | 'auth.invite.failed.relay'
    | 'auth.invite.failed.unmarked'
    | 'auth.invite.failed.loggedIn'
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
 * generic line; the raw text goes under it, in the dialog and the failure toast.
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

/** Refusals made locally, before anything was sent: one line each, no server text to classify. */
const KEY_BY_LOCAL_KIND: Record<Exclude<InviteLoginError['kind'], 'server'>, InviteErrorKey> = {
    format: 'auth.invite.failed.format',
    backend: 'auth.invite.failed.backend',
    relay: 'auth.invite.failed.relay',
    unmarked: 'auth.invite.failed.unmarked',
    loggedIn: 'auth.invite.failed.loggedIn',
};

/** Resolve the user-facing line for an invite-login error. */
export const inviteLoginErrorText = (error: InviteLoginError, t: (key: string) => string): string => {
    if (error.kind !== 'server') return t(KEY_BY_LOCAL_KIND[error.kind]);
    logger.error('AUTH', '[InviteLogin] rejected', { raw: error.message });
    return t(KEY_BY_KIND[classifyWireError(error.message)]);
};
