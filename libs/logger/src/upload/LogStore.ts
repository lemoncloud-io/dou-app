import type { LogEntry, LogListener } from '../core/types';

export interface LogStoreReader {
    peek(limit: number): Promise<LogEntry[]>;

    ack(entries: LogEntry[]): Promise<void>;

    clear(): Promise<void>;

    size(): number;
}

export interface LogStoreWriter {
    push(entry: LogEntry): void;
}

export interface LogStore extends LogStoreReader, LogStoreWriter {}

export const toLogListener =
    (writer: LogStoreWriter): LogListener =>
    entry =>
        writer.push(entry);
