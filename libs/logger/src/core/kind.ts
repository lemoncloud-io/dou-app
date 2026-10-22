import type { LogEntry } from './types';

/**
 * Whether an entry is a statistic (`trace` · `sample` · `event`) rather than a log.
 *
 * An absent `kind` is a log. Everything that treats the two differently — the queue's separate
 * shares, the wire's structured fields, sampling — asks this one question, so they cannot disagree
 * about an entry from an older runtime that never heard of `kind`.
 */
export const isTelemetryEntry = (entry: Pick<LogEntry, 'kind'>): boolean =>
    entry.kind !== undefined && entry.kind !== 'log';
