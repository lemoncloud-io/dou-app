import { createMMKV } from 'react-native-mmkv';
import { serializeLogs } from '@chatic/logger';
import type { LogEntry, LogPersistence } from '@chatic/logger';

const LOG_QUEUE_STORAGE_KEY = '@chatic/log.queue';

/**
 * MMKV adapter for the core `LogPersistence` port (ADR-0047). Reads/writes
 * synchronously on the default MMKV instance (the same store `MmkvStorage`
 * wraps) so the core can restore the buffer at attach time without an async
 * boundary.
 */
export class MmkvLogPersistence implements LogPersistence {
    private readonly mmkv = createMMKV();

    load(): LogEntry[] {
        const raw = this.mmkv.getString(LOG_QUEUE_STORAGE_KEY);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw) as Partial<LogEntry>[];
            if (!Array.isArray(parsed)) return [];
            // Normalize pre-ADR-0047 AppLogInfo records whose fields were all
            // optional, so restored entries always satisfy LogEntry.
            return parsed.map(item => ({
                level: item.level ?? 'info',
                tag: item.tag ?? 'APP',
                message: item.message ?? '',
                timestamp: item.timestamp ?? 0,
                ...(item.data !== undefined ? { data: item.data } : {}),
                ...(item.error !== undefined ? { error: item.error } : {}),
                ...(item.source !== undefined ? { source: item.source } : {}),
            }));
        } catch {
            return [];
        }
    }

    save(entries: LogEntry[]): void {
        // serializeLogs applies the shared caps (2k per field, 40k total,
        // oldest dropped first) and flattens circular payloads, so one
        // oversized `data` cannot grow the MMKV record without bound — this
        // runs on every error-level flush.
        this.mmkv.set(LOG_QUEUE_STORAGE_KEY, JSON.stringify(serializeLogs(entries)));
    }
}
