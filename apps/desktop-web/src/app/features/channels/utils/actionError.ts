import { logger } from '@chatic/bridges';

import { classifyWireError, extractErrorMessage, type WireErrorKind } from '../../../shared';

/**
 * Turn a thrown channel-action failure into copy a person can act on.
 *
 * `extractErrorMessage` returns whatever the transport carried, which for this
 * API is its own wire text — a user could be shown
 * `403 NOT ALLOWED - action[update] is invalid @doPut(channels/U:1001095)`.
 * That string is useful in a console and useless in a toast, so the raw value
 * stays on the console and the toast gets one of four sentences.
 *
 * Unrecognised failures fall through to the generic line rather than leaking the
 * wire text: a message nobody wrote is not better than a message someone did.
 */
type ChannelActionErrorKey =
    | 'errors.notAllowed'
    | 'errors.notFound'
    | 'errors.conflict'
    | 'errors.network'
    | 'errors.generic';

const KEY_BY_KIND: Record<WireErrorKind, ChannelActionErrorKey> = {
    denied: 'errors.notAllowed',
    notFound: 'errors.notFound',
    conflict: 'errors.conflict',
    network: 'errors.network',
    expired: 'errors.generic',
    invalid: 'errors.generic',
    unknown: 'errors.generic',
};

export const channelActionErrorKey = (error: unknown): ChannelActionErrorKey => {
    const raw = extractErrorMessage(error);
    // The wire text belongs in the log, not in a toast.
    logger.error('CHANNEL', '[ChannelAction] failed', { error, raw });
    return KEY_BY_KIND[classifyWireError(raw)];
};
