import { createMMKV } from 'react-native-mmkv';
import { serializeLogs } from '@chatic/logger';
import type { LogEntry, LogPersistence } from '@chatic/logger';

/**
 * Deliberately NOT the ring buffer's `@chatic/log.queue`. Two stores with two
 * lifetimes: that one is a diagnostic window that may be overwritten freely,
 * this one holds entries the server has not taken yet (ADR-0063).
 */
const UPLOAD_QUEUE_STORAGE_KEY = '@chatic/log.upload.queue';

/**
 * MMKV adapter for the app's server-bound log queue. Synchronous like the
 * buffer's adapter, so the queue can be restored at boot without an async
 * boundary the process might not survive.
 */
export class MmkvLogUploadQueuePersistence implements LogPersistence {
    private readonly mmkv = createMMKV();

    load(): LogEntry[] {
        const raw = this.mmkv.getString(UPLOAD_QUEUE_STORAGE_KEY);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw) as LogEntry[];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    save(entries: LogEntry[]): void {
        // Same shared caps as the buffer adapter (2k per field, 40k total), so
        // one oversized payload cannot grow the MMKV record without bound.
        this.mmkv.set(UPLOAD_QUEUE_STORAGE_KEY, JSON.stringify(serializeLogs(entries)));
    }
}
