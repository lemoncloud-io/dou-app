import { logAreaOf } from '../core/areas';
import { isTelemetryEntry } from '../core/kind';
import { pickLogContext } from '../core/logContext';
import { redactText } from '../redaction/valuePatterns';
import { safeStringify } from './safeStringify';
import { truncateText } from './truncateText';

import type { LogContext, LogEntry, LogKind } from '../core/types';

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
 *
 * **Statistics do not go through the string step.** `data` becomes a capped string, which the server
 * cannot look inside — fine for a log, fatal for a measurement whose whole point is to be aggregated.
 * So `durationMs`, `attrs`, `metrics`, `sr`, `pv` and `seq` leave as numbers and objects, and only on
 * a statistics entry: a log carrying one by accident does not grow a numeric field on the server.
 * Each is checked for shape here once more — the recorder already enforced the catalogue, but this
 * file is the last thing that sees an entry before storage, and the server keeps whatever arrives.
 *
 * `area` is derived here and nowhere else, from `tag` ({@link logAreaOf}). `kind` is left off a log
 * so the server's log list, which reads "no kind or `log`", is unchanged for every log entry.
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
    /** Derived from `tag` — never set by a caller. */
    area?: string;
    /** Absent on a log. */
    kind?: Exclude<LogKind, 'log'>;
    httpStatus?: number;
    errorCode?: string;
    durationMs?: number;
    attrs?: Record<string, string>;
    metrics?: Record<string, number>;
    sr?: number;
    pv?: number;
    seq?: number;
}

/** Shape limits for the statistics fields — the same numbers the catalogue validation enforces. */
export const WIRE_MAX_ATTRS = 16;
export const WIRE_MAX_METRICS = 32;
export const WIRE_ATTR_VALUE_CHAR_LIMIT = 100;
const DIMENSION_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/** Request body for `POST /hello/report-bulk`. */
export interface WireLogBatch {
    list: WireLogEntry[];
}

const cap = (value: string): string => truncateText(value, WIRE_FIELD_CHAR_LIMIT);

const asWireText = (value: unknown): string | undefined => {
    const serialized = safeStringify(value);
    return serialized === undefined ? undefined : cap(serialized);
};

const finiteNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const integer = (value: unknown): number | undefined => {
    const n = finiteNumber(value);
    return n !== undefined && Number.isInteger(n) ? n : undefined;
};

/** A rate in `0..1`; anything else would turn into a nonsense weight on the server. */
const rate = (value: unknown): number | undefined => {
    const n = finiteNumber(value);
    return n !== undefined && n >= 0 && n <= 1 ? n : undefined;
};

const asWireAttrs = (attrs: unknown): Record<string, string> | undefined => {
    if (!attrs || typeof attrs !== 'object') return undefined;
    const out: Record<string, string> = {};
    let count = 0;
    for (const [key, value] of Object.entries(attrs)) {
        if (count >= WIRE_MAX_ATTRS) break;
        if (!DIMENSION_KEY.test(key) || typeof value !== 'string') continue;
        out[key] = value.slice(0, WIRE_ATTR_VALUE_CHAR_LIMIT);
        count += 1;
    }
    return count ? out : undefined;
};

const asWireMetrics = (metrics: unknown): Record<string, number> | undefined => {
    if (!metrics || typeof metrics !== 'object') return undefined;
    const out: Record<string, number> = {};
    let count = 0;
    for (const [key, value] of Object.entries(metrics)) {
        if (count >= WIRE_MAX_METRICS) break;
        // Rounded, not refused: a native record never passed the recorder, which rounds the same way.
        const n = finiteNumber(value);
        if (!DIMENSION_KEY.test(key) || n === undefined) continue;
        out[key] = Math.round(n);
        count += 1;
    }
    return count ? out : undefined;
};

/** The structured fields, for a statistics entry only. A log gets none of them. */
const statisticsFields = (entry: LogEntry): Partial<WireLogEntry> => {
    if (!isTelemetryEntry(entry)) return {};
    return {
        kind: entry.kind as Exclude<LogKind, 'log'>,
        durationMs: finiteNumber(entry.durationMs),
        attrs: asWireAttrs(entry.attrs),
        metrics: asWireMetrics(entry.metrics),
        sr: rate(entry.sr),
        pv: integer(entry.pv),
        seq: integer(entry.seq),
    };
};

/** Drops undefined keys so the payload carries only what was actually set. */
const compact = (entry: WireLogEntry): WireLogEntry =>
    Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as WireLogEntry;

export const toWireLogEntry = (entry: LogEntry): WireLogEntry =>
    compact({
        // Still an allowlist — `pickLogContext` copies the known context
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
        area: typeof entry.tag === 'string' ? logAreaOf(entry.tag) : undefined,
        httpStatus: integer(entry.httpStatus),
        errorCode: typeof entry.errorCode === 'string' && entry.errorCode ? cap(entry.errorCode) : undefined,
        ...statisticsFields(entry),
    });

export const toWireLogBatch = (entries: LogEntry[]): WireLogBatch => ({
    list: entries.map(toWireLogEntry),
});
