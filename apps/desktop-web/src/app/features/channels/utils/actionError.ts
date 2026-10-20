import { logger } from '@chatic/bridges';

import { classifyWireError, extractErrorMessage, type WireErrorKind } from '../../../shared';

/**
 * Turn a thrown channel-action failure into copy a person can act on.
 *
 * `extractErrorMessage` returns whatever the transport carried, which for this
 * API is its own wire text — a user could be shown
 * `403 NOT ALLOWED - action[update] is invalid @doPut(channels/U:1001095)`.
 * That string is no sentence to lead with, so the toast's title is one of four
 * sentences and the raw value sits under it (`toastFailure`), where whoever reports
 * the failure can read it back.
 *
 * Unrecognised failures fall through to the generic line rather than leading with
 * the wire text: a message nobody wrote is not better than a message someone did.
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
    // The wire text is logged here; the toast shows it under the sentence.
    logger.error('CHANNEL', '[ChannelAction] failed', { error, raw });
    return KEY_BY_KIND[classifyWireError(raw)];
};
