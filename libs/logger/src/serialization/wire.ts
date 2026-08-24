import { pickLogContext } from '../core/logContext';
import { safeStringify } from './safeStringify';
import { truncateText } from './truncateText';

import type { LogContext, LogEntry } from '../core/types';

/**
 * Maps entries onto the shape the collector accepts.
 *
 * The server declares every field optional and stores whatever arrives, so it
 * will not reject a malformed entry — it will just keep it. That puts the whole
 * burden of the contract on this file: `data`/`error` are stringified and
 * capped here, and only known fields are copied, so an accidental payload
 * cannot ride along into storage.
 *
 * Masking is `safeStringify`'s job — it walks keys, unwraps Errors, breaks
 * cycles, and (see there) also looks inside strings that are themselves JSON.
 *
 * There is no batch envelope. The server stores one entry as one document and
 * hoists the query axes off the entry itself, so a flat list is all it wants.
 */

/** Max characters kept for a single stringified field. */
export const WIRE_FIELD_CHAR_LIMIT = 2_000;

/**
 * One log entry as it goes over the wire (mirrors the server's `LogEntry`).
 *
 * The occurrence-time context arrives by extending `LogContext` rather than by
 * relisting it, so the wire shape cannot fall behind the contract.
 */
export interface WireLogEntry extends LogContext {
    id?: string;
    level?: string;
    tag?: string;
    message?: string;
    data?: string;
    error?: string;
    timestamp?: number;
    source?: string;
}

/** Request body for `POST /hello/report-bulk`. */
export interface WireLogBatch {
    list: WireLogEntry[];
}

const cap = (value: string): string => truncateText(value, WIRE_FIELD_CHAR_LIMIT);

const asWireText = (value: unknown): string | undefined => {
    const serialized = safeStringify(value);
    return serialized === undefined ? undefined : cap(serialized);
};

/** Drops undefined keys so the payload carries only what was actually set. */
const compact = (entry: WireLogEntry): WireLogEntry =>
    Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as WireLogEntry;

export const toWireLogEntry = (entry: LogEntry): WireLogEntry =>
    compact({
        // Still an allowlist — `pickLogContext` copies the ten known context
        // fields and nothing else, so an accidental payload cannot ride along.
        ...pickLogContext(entry),
        id: entry.id,
        level: entry.level,
        tag: entry.tag,
        message: entry.message === undefined ? undefined : cap(entry.message),
        data: asWireText(entry.data),
        error: asWireText(entry.error),
        timestamp: entry.timestamp,
        source: entry.source,
    });

export const toWireLogBatch = (entries: LogEntry[]): WireLogBatch => ({
    list: entries.map(toWireLogEntry),
});
