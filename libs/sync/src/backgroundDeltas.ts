import { logger } from '@chatic/bridges';

import type { BackgroundDelta } from './types';

/**
 * The announcements of answered background deltas, kept apart from the receiver so a subscriber
 * outlives it: the connection host restarts the receiver on a remount, and an app runner that
 * subscribed once must keep hearing from whichever receiver is running.
 */
const listeners = new Set<(delta: BackgroundDelta) => void>();

/**
 * Hears every background cloud's delta that came back, with the moment its request went out. Returns
 * the unsubscribe.
 */
export const subscribeBackgroundDeltas = (listener: (delta: BackgroundDelta) => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const emitBackgroundDelta = (delta: BackgroundDelta): void => {
    for (const listener of [...listeners]) {
        // A listener that throws is the app's bug, not the delta's: caught here, it cannot reach the
        // receiver's own catch and be reported as a failed delta.
        try {
            listener(delta);
        } catch (error) {
            logger.warn('SYNC', '[backgroundDeltas] a listener threw', { error, data: { cid: delta.cid } });
        }
    }
};
