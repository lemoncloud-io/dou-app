import { serializeLogs } from '@chatic/logger';
import { MmkvStorage } from '../../../database/mmkv';

import type { LogEntry } from '@chatic/logger';
import type { ILogService } from '../types';
import type { LogUploadQueuePersistence } from './types';

/**
 * Deliberately NOT the retired ring buffer's `@chatic/log.queue`. That key held
 * a diagnostic window that could be overwritten freely; this one holds entries
 * the server has not taken yet, so the two never shared a key (ADR-0063).
 */
const UPLOAD_QUEUE_STORAGE_KEY = '@chatic/log.upload.queue';

/**
 * When this run last saw a log entry.
 *
 * A separate key rather than a field inside the queue record, because it has to
 * outlive the entries: `ack` removes what the server took, so on a healthy
 * device the store is usually empty and its newest entry is not the newest thing
 * that happened. Crash detection needs the latter.
 */
const LAST_LOG_AT_STORAGE_KEY = '@chatic/log.last-at';

/**
 * A log service that only ever reaches the console.
 *
 * `MmkvStorage` reports its own failures through `ILogService`, which is exactly
 * right for every other caller and exactly wrong for this one: a failed write
 * here would publish a log entry, the hub would hand it to the store's
 * subscription, the store would try to persist again, and the failure would
 * reproduce itself for as long as the disk stayed unhappy.
 *
 * So the storage backing the log path gets a service that does not publish. This
 * is principle 8's rule — the transport must not log through the thing it
 * transports — applied to the store rather than the sender. `debug`/`info` are
 * dropped outright: nothing is diagnosable from them here, and the two levels
 * worth seeing go to `console` where they cannot re-enter.
 */
const consoleOnlyLogService: ILogService = {
    subscribe: () => () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: (tag, message, data) => console.warn(`[${tag}] ${message}`, data ?? ''),
    error: (tag, message, options) => console.error(`[${tag}] ${message}`, options ?? ''),
};

/**
 * MMKV adapter for the app's log store, built on the shared `MmkvStorage` rather
 * than reaching for `createMMKV()` directly — one place owns how this app talks
 * to MMKV, including the JSON encoding and the swallowing of parse failures.
 *
 * Synchronous like the buffer's adapter was, so the store can be restored at
 * boot without an async boundary the process might not survive.
 */
export class MmkvLogUploadQueuePersistence implements LogUploadQueuePersistence {
    private readonly storage = new MmkvStorage(consoleOnlyLogService);

    load(): LogEntry[] {
        const parsed = this.storage.getSync<LogEntry[]>(UPLOAD_QUEUE_STORAGE_KEY);
        return Array.isArray(parsed) ? parsed : [];
    }

    save(entries: LogEntry[]): void {
        // Same shared caps as the buffer adapter (2k per field, 40k total), so
        // one oversized payload cannot grow the MMKV record without bound.
        this.storage.setSync(UPLOAD_QUEUE_STORAGE_KEY, serializeLogs(entries));
    }

    loadLastLogAt(): number | undefined {
        const stored = this.storage.getSync<number>(LAST_LOG_AT_STORAGE_KEY);
        // A zero timestamp is not a time anyone logged at; treat it as absent so
        // the caller falls back rather than reporting the epoch.
        return stored ? stored : undefined;
    }

    saveLastLogAt(timestamp: number): void {
        this.storage.setSync(LAST_LOG_AT_STORAGE_KEY, timestamp);
    }
}
