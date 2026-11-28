import { serializeLogs } from '@chatic/logger';
import { MmkvStorage } from '@chatic/storage-mmkv';

import type { LogEntry } from '@chatic/logger';
import type { ILogService } from '../types';
import type { LogUploadQueuePersistence } from './types';

const UPLOAD_QUEUE_STORAGE_KEY = '@chatic/log.upload.queue';

const LAST_LOG_AT_STORAGE_KEY = '@chatic/log.last-at';

const consoleOnlyLogService: ILogService = {
    subscribe: () => () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: (tag, message, data) => console.warn(`[${tag}] ${message}`, data ?? ''),
    error: (tag, message, options) => console.error(`[${tag}] ${message}`, options ?? ''),
};

export class MmkvLogUploadQueuePersistence implements LogUploadQueuePersistence {
    private readonly storage = new MmkvStorage(consoleOnlyLogService);

    load(): LogEntry[] {
        const parsed = this.storage.getSync<LogEntry[]>(UPLOAD_QUEUE_STORAGE_KEY);
        return Array.isArray(parsed) ? parsed : [];
    }

    save(entries: LogEntry[]): void {
        this.storage.setSync(UPLOAD_QUEUE_STORAGE_KEY, serializeLogs(entries));
    }

    loadLastLogAt(): number | undefined {
        const stored = this.storage.getSync<number>(LAST_LOG_AT_STORAGE_KEY);
        return stored ? stored : undefined;
    }

    saveLastLogAt(timestamp: number): void {
        this.storage.setSync(LAST_LOG_AT_STORAGE_KEY, timestamp);
    }
}
