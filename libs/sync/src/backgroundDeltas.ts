import { logger } from '@chatic/logger';

import type { BackgroundDelta } from './types';

const listeners = new Set<(delta: BackgroundDelta) => void>();

export const subscribeBackgroundDeltas = (listener: (delta: BackgroundDelta) => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const emitBackgroundDelta = (delta: BackgroundDelta): void => {
    for (const listener of [...listeners]) {
        try {
            listener(delta);
        } catch (error) {
            logger.warn('SYNC', '[backgroundDeltas] a listener threw', { error, data: { cid: delta.cid } });
        }
    }
};
