import { logger } from '@chatic/bridges';

import { classifyWireError, extractErrorMessage } from '../../../shared';

export type CreateChannelFailure = 'limit' | 'denied' | 'network' | 'other';

const LIMIT_TEXT = /\bLIMIT|EXCEED|QUOTA/i;

export const createChannelFailure = (error: unknown): CreateChannelFailure => {
    const raw = extractErrorMessage(error);
    logger.error('CHANNEL', '[CreateChannel] failed', { error, raw });
    if (LIMIT_TEXT.test(raw)) return 'limit';
    switch (classifyWireError(raw)) {
        case 'denied':
            return 'denied';
        case 'network':
            return 'network';
        default:
            return 'other';
    }
};
