import { logger } from '@chatic/bridges';

import { extractErrorMessage } from '../../../shared';

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
export type ChannelActionErrorKey =
    | 'errors.notAllowed'
    | 'errors.notFound'
    | 'errors.conflict'
    | 'errors.network'
    | 'errors.generic';

export const channelActionErrorKey = (error: unknown): ChannelActionErrorKey => {
    const raw = extractErrorMessage(error);
    // The wire text belongs in the log, not in a toast.
    logger.error('CHANNEL', '[ChannelAction] failed', { error, raw });

    const text = raw.toUpperCase();
    if (text.includes('403') || text.includes('NOT ALLOWED') || text.includes('FORBIDDEN')) {
        return 'errors.notAllowed';
    }
    if (text.includes('404') || text.includes('NOT FOUND')) return 'errors.notFound';
    if (text.includes('409') || text.includes('CONFLICT')) return 'errors.conflict';
    if (text.includes('NETWORK') || text.includes('TIMEOUT') || text.includes('FAILED TO FETCH')) {
        return 'errors.network';
    }
    return 'errors.generic';
};
