import { logger } from '@chatic/bridges';

import { classifyWireError, extractErrorMessage, type WireErrorKind } from '../../../shared';

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
    logger.error('CHANNEL', '[ChannelAction] failed', { error, raw });
    return KEY_BY_KIND[classifyWireError(raw)];
};
