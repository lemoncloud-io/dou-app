import { pickLogContext } from '../core/logContext';
import { redactText } from '../redaction/valuePatterns';
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
 * Masking of `data`/`error` is `safeStringify`'s job — it walks keys, unwraps Errors, breaks
 * cycles, and (see there) also looks inside strings that are themselves JSON.
 *
 * `message` is masked HERE, because nothing else can. It never reaches `safeStringify`: it is
 * already a string and goes straight to the field, so until this call it was the one part of an
 * entry that left the device with no masking at all. Key-based masking is no help either — a
 * message has no keys. What it does have is interpolated values, and a `message` is where a server's
 * own error text ends up verbatim (§2·§3 of the trigger catalog ask for the status in the message),
 * and what a server puts in that text is not the client's decision.
 *
 * Masked BEFORE the cap, not after: capping first would leave the tail of a long secret in place
 * once the placeholder no longer fit.
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
        message: entry.message === undefined ? undefined : cap(redactText(entry.message)),
        data: asWireText(entry.data),
        error: asWireText(entry.error),
        timestamp: entry.timestamp,
        source: entry.source,
    });

export const toWireLogBatch = (entries: LogEntry[]): WireLogBatch => ({
    list: entries.map(toWireLogEntry),
});
