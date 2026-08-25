import type { LogEntry, LogListener } from '../core/types';

/**
 * What a log store looks like to the two things that read it: the uploader and
 * the debug monitor.
 *
 * Split from the write side on purpose. In a hybrid run the web has no store of
 * its own — the app owns it — so what `apps/web` holds is a bridge-backed reader
 * that stores nothing. Folding `push` into one interface would force that object
 * to carry a method it cannot honour, and the type would be lying. Keeping the
 * reader separate also means the uploader has no way to append: principle 16's
 * "the uploader is not a subscriber" holds at the type level rather than by
 * convention.
 *
 * `peek`/`ack`/`clear` are async because a bridge implementation exists; local
 * ones resolve immediately. `size` is not, because it is a display value and the
 * remote implementation answers from the count its last round trip reported —
 * asking across the bridge for it would cost a trip per read.
 */
export interface LogStoreReader {
    /**
     * Up to `limit` entries, oldest first, WITHOUT removing them. Handing back
     * the same entries on a later call is correct and expected: `ack` is the
     * only thing that releases them (principle 4).
     */
    peek(limit: number): Promise<LogEntry[]>;

    /**
     * Releases entries the pipeline is done with — both a batch the server
     * accepted and one being given up on.
     *
     * Takes entries rather than ids so an entry that somehow carries no `id` is
     * still releasable (the queue falls back to identity matching). A remote
     * implementation extracts the ids itself before putting them on the wire.
     * Were this ids-only, an id-less entry could never be released and would be
     * re-fetched forever.
     */
    ack(entries: LogEntry[]): Promise<void>;

    /** Discards everything held. The monitor's explicit drop, and opt-out. */
    clear(): Promise<void>;

    /** Best-known count of entries waiting to be sent. May lag by one cycle. */
    size(): number;
}

/**
 * The append side, held only by the listener that fills the store.
 *
 * Synchronous because it runs inside `LogHub.publish`, which cannot await
 * (principle 16). Implementations must swallow their own failures — throwing
 * here would be caught by the hub, silently.
 */
export interface LogStoreWriter {
    /**
     * Appends one entry. Over capacity the oldest go first, and `debug` is not
     * accepted at all (principles 13 and 18).
     */
    push(entry: LogEntry): void;
}

/** A store that actually holds something is both halves. */
export interface LogStore extends LogStoreReader, LogStoreWriter {}

/**
 * Turns a writer into a hub listener. This *is* "the one that stores" — the
 * listener has no logic of its own beyond handing the entry over, which is what
 * keeps it symmetric with the console and native-sender listeners.
 */
export const toLogListener =
    (writer: LogStoreWriter): LogListener =>
    entry =>
        writer.push(entry);
