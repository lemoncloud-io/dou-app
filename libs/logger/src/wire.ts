import { safeStringify } from './serialize';
import type { LogEntry } from './types';

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

/** One log entry as it goes over the wire (mirrors the server's `LogEntry`). */
export interface WireLogEntry {
    id?: string;
    runId?: string;
    sid?: string;
    uid?: string;
    cid?: string;
    appVersion?: string;
    webVersion?: string;
    route?: string;
    level?: string;
    tag?: string;
    message?: string;
    data?: string;
    error?: string;
    timestamp?: number;
    source?: string;
    os?: string;
    osVersion?: string;
    model?: string;
}

/** Request body for `POST /hello/report-bulk`. */
export interface WireLogBatch {
    list: WireLogEntry[];
}

const truncate = (value: string): string =>
    value.length > WIRE_FIELD_CHAR_LIMIT
        ? `${value.slice(0, WIRE_FIELD_CHAR_LIMIT)}…(+${value.length - WIRE_FIELD_CHAR_LIMIT})`
        : value;

const asWireText = (value: unknown): string | undefined => {
    const serialized = safeStringify(value);
    return serialized === undefined ? undefined : truncate(serialized);
};

/** Drops undefined keys so the payload carries only what was actually set. */
const compact = (entry: WireLogEntry): WireLogEntry =>
    Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as WireLogEntry;

export const toWireLogEntry = (entry: LogEntry): WireLogEntry =>
    compact({
        id: entry.id,
        runId: entry.runId,
        sid: entry.sid,
        uid: entry.uid,
        cid: entry.cid,
        appVersion: entry.appVersion,
        webVersion: entry.webVersion,
        route: entry.route,
        level: entry.level,
        tag: entry.tag,
        message: entry.message === undefined ? undefined : truncate(entry.message),
        data: asWireText(entry.data),
        error: asWireText(entry.error),
        timestamp: entry.timestamp,
        source: entry.source,
        os: entry.os,
        osVersion: entry.osVersion,
        model: entry.model,
    });

export const toWireLogBatch = (entries: LogEntry[]): WireLogBatch => ({
    list: entries.map(toWireLogEntry),
});
