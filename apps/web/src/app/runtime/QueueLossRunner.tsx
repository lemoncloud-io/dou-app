import { useEffect } from 'react';

import { useAppForeground } from '../bridge';
import { queueLossObserver } from './logging/queueLossObserver';

/** How often the queue's eviction counter is read while the app stays open. */
const OBSERVE_INTERVAL_MS = 5 * 60_000;

/**
 * Reports how many log entries the unsent queue has evicted (ADR-0099).
 *
 * Two occasions, for two different sessions. Foreground return is when loss that happened while the
 * app was suspended becomes visible; the low-frequency timer covers a session someone leaves open
 * for hours, which would otherwise report nothing until it ended.
 *
 * Deliberately NOT tied to the upload cycle: the observer must stay off the send path, or the entry
 * it writes feeds the queue it is measuring at the moment that queue is already overflowing. The
 * cadence is coarse for the same reason — this measures a slow-moving fact.
 *
 * Renders nothing; mounted once under AppRuntime.
 */
export const QueueLossRunner = (): null => {
    useEffect(() => {
        const timer = setInterval(() => queueLossObserver.observe(), OBSERVE_INTERVAL_MS);
        return () => clearInterval(timer);
    }, []);

    useAppForeground(() => queueLossObserver.observe());

    return null;
};
