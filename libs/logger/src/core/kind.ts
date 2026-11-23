import type { LogEntry } from './types';

export const isTelemetryEntry = (entry: Pick<LogEntry, 'kind'>): boolean =>
    entry.kind !== undefined && entry.kind !== 'log';
