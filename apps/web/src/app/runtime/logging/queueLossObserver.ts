import { logger, type ObservationData } from '@chatic/bridges';

import { getLogQueueView } from './logQueueView';

/**
 * Reports how many log entries the unsent queue has evicted.
 *
 * **Why this needs to exist at all.** The queue drops on backpressure in a fixed order — `debug`,
 * then `info`, then oldest-first — and a device that logs a lot is usually a device something is
 * wrong with. So the entries most worth having are the ones most likely to be discarded, and
 * without this every "there are no warnings for this user" reading is ambiguous: it could mean
 * healthy, or it could mean the evidence was thrown away. That ambiguity would undermine every
 * other trigger this track added (ADR-0075).
 *
 * **Why a third party reads it.** Neither the queue nor the uploader may log — `logger → send →
 * fail → logger` is a recursion the design already had to break, and it is pinned by a test. So the
 * count is read through the uploader's read-only view by something that is not on the send path.
 *
 * **Only growth is reported.** The counter is cumulative, so re-reporting it would repeat the same
 * loss every observation. The delta is the new information; a flat counter says nothing and stays
 * silent.
 *
 * This entry can itself be evicted. That is not a flaw to fix — if it was dropped, the queue was
 * under exactly the pressure it describes. It does mean the *absence* of this entry is not proof
 * that nothing was lost.
 */
export interface IQueueLossObserver {
    /** Reads the counter and logs the increase, if any. Safe to call when no uploader is running. */
    observe(): void;
    /** Forgets the last reading. Tests only. */
    reset(): void;
}

class QueueLossObserver implements IQueueLossObserver {
    /** Last value seen, so only the increase since then is reported. */
    private lastSeen = 0;

    observe(): void {
        const view = getLogQueueView();
        // No uploader running (boot, teardown) — there is no queue to have lost anything yet.
        if (!view) return;

        const total = view.droppedCount();
        // A queue replaced by a newer uploader starts from zero; treat a smaller number as a fresh
        // baseline rather than reporting a negative delta.
        if (total < this.lastSeen) {
            this.lastSeen = total;
            return;
        }

        const delta = total - this.lastSeen;
        if (delta === 0) return;

        this.lastSeen = total;
        logger.warn('LOG_BUFFER', `log queue evicted ${delta} entr${delta === 1 ? 'y' : 'ies'}`, {
            observation: 'queue-loss',
            dropped: delta,
            droppedTotal: total,
        } satisfies ObservationData);
    }

    reset(): void {
        this.lastSeen = 0;
    }
}

export const queueLossObserver: IQueueLossObserver = new QueueLossObserver();
