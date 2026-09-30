import { logger } from '@chatic/bridges';

import { classifyWireError, extractErrorMessage } from '../../../shared';

/**
 * Why a new channel was not made, as far as the person can act on it:
 * - `limit`: the place is full. More room comes with a subscription, which desktop does not sell,
 *   so the dialog points at the mobile app.
 * - `denied`: this account may not make channels here. Trying again changes nothing.
 * - `network`: the server was not reached. Trying again is the answer.
 * - `other`: anything else, which may pass on a second try.
 */
export type CreateChannelFailure = 'limit' | 'denied' | 'network' | 'other';

// A limit's wire text has not been captured from the server, so it is matched on the words a cap
// is reported with. It is tested before the status: a cap can arrive as a 403, and reading that as
// "denied" would hide the one answer that helps.
const LIMIT_TEXT = /\bLIMIT|EXCEED|QUOTA/i;

export const createChannelFailure = (error: unknown): CreateChannelFailure => {
    const raw = extractErrorMessage(error);
    // The wire text belongs in the log, not in the dialog.
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
