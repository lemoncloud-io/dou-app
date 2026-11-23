import { logger } from '@chatic/bridges';

import { classifyWireError, type WireErrorKind } from '../../../shared';

export type InviteLoginError =
    | { kind: 'format' | 'backend' | 'relay' | 'unmarked' | 'loggedIn' | 'used' | 'expired' | 'canceled' }
    | { kind: 'server'; message: string };

type InviteErrorKey =
    | 'auth.invite.failed.format'
    | 'auth.invite.failed.backend'
    | 'auth.invite.failed.relay'
    | 'auth.invite.failed.unmarked'
    | 'auth.invite.failed.loggedIn'
    | 'auth.invite.failed.used'
    | 'auth.invite.failed.canceled'
    | 'auth.invite.failed.notFound'
    | 'auth.invite.failed.expired'
    | 'auth.invite.failed.already'
    | 'auth.invite.failed.denied'
    | 'auth.invite.failed.network'
    | 'auth.invite.failed.generic';

const KEY_BY_KIND: Record<WireErrorKind, InviteErrorKey> = {
    expired: 'auth.invite.failed.expired',
    notFound: 'auth.invite.failed.notFound',
    invalid: 'auth.invite.failed.notFound',
    conflict: 'auth.invite.failed.already',
    denied: 'auth.invite.failed.denied',
    network: 'auth.invite.failed.network',
    unknown: 'auth.invite.failed.generic',
};

const KEY_BY_LOCAL_KIND: Record<Exclude<InviteLoginError['kind'], 'server'>, InviteErrorKey> = {
    format: 'auth.invite.failed.format',
    backend: 'auth.invite.failed.backend',
    relay: 'auth.invite.failed.relay',
    unmarked: 'auth.invite.failed.unmarked',
    loggedIn: 'auth.invite.failed.loggedIn',
    used: 'auth.invite.failed.used',
    expired: 'auth.invite.failed.expired',
    canceled: 'auth.invite.failed.canceled',
};

export const inviteLoginErrorText = (error: InviteLoginError, t: (key: string) => string): string => {
    if (error.kind !== 'server') return t(KEY_BY_LOCAL_KIND[error.kind]);
    logger.error('AUTH', '[InviteLogin] rejected', { raw: error.message });
    return t(KEY_BY_KIND[classifyWireError(error.message)]);
};
