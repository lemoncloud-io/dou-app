import type { LogEntry } from '@chatic/bridges';

/**
 * Read-only window onto the running uploader's queue, for the debug monitor.
 *
 * The queue lives in `startLogUploader`'s closure and is deliberately not
 * exported: it is the uploader's to mutate, and a second writer would break the
 * at-least-once contract. But once the queue is the only log store, the debug
 * view has nowhere else to read from — so the uploader registers a reader here
 * and the monitor asks through it.
 *
 * Registration rather than a shared singleton: the monitor must not be able to
 * bring a queue into existence, and it has to be able to tell that no uploader
 * is running (during boot, or after teardown) instead of quietly showing an
 * empty list that looks like "no logs".
 *
 * `clear` is here because holding is only half the workflow — an engineer
 * reproducing something wants a clean slate for the next attempt, and the
 * alternatives are releasing the hold (which ships everything) or reloading.
 * It discards; that is the point, and the label says so.
 */

export interface LogQueueView {
    /** Everything held right now, oldest first. Non-destructive. */
    snapshot(): LogEntry[];
    /** Drops what is held. Discards — nothing is sent. */
    clear(): void;
}

let view: LogQueueView | undefined;

/** Publishes the running uploader's queue. Returns the unregister function. */
export const registerLogQueueView = (registered: LogQueueView): (() => void) => {
    view = registered;
    return () => {
        // Guarded so a late teardown cannot unregister a newer uploader's view.
        if (view === registered) view = undefined;
    };
};

/** The queue view, or undefined when no uploader is running. */
export const getLogQueueView = (): LogQueueView | undefined => view;
