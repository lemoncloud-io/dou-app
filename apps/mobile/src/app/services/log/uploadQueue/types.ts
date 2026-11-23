import type { LogEntry } from '@chatic/logger';

export interface LogUploadQueuePersistence {
    load(): LogEntry[];
    save(entries: LogEntry[]): void;
    loadLastLogAt(): number | undefined;
    saveLastLogAt(timestamp: number): void;
}

export interface ILogUploadQueueService {
    init(): void;

    teardown(): void;

    fetch(limit?: number): LogEntry[];

    ack(ids: string[]): number;

    clear(): number;

    getSize(): number;

    getPreviousRunLastLogAt(): number | undefined;
}
