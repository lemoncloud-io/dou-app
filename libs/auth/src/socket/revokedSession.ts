import { logger } from '@chatic/logger';

import { relaySession } from '../session/relaySession';

const REVOKED_MARKER = 'session revoked';

const MAX_CAUSE_DEPTH = 5;

const messageOf = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return typeof error === 'string' ? error : '';
};

export const isRevokedSessionError = (error: unknown): boolean => {
    let current: unknown = error;
    for (let depth = 0; depth < MAX_CAUSE_DEPTH && current; depth += 1) {
        if (messageOf(current).includes(REVOKED_MARKER)) return true;
        current = (current as { cause?: unknown })?.cause;
    }
    return false;
};

let handled = false;

export const resetRevokedSessionHandling = (): void => {
    handled = false;
};

export const handleRevokedRelaySession = async (scope: string): Promise<void> => {
    if (handled) return;
    handled = true;

    logger.error('AUTH', '[revokedSession] relay session revoked by the server — clearing it', {
        data: { scope },
    });

    await relaySession.clearAndRedirect();
};
