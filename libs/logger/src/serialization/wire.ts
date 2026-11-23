import { logAreaOf } from '../core/areas';
import { isTelemetryEntry } from '../core/kind';
import { pickLogContext } from '../core/logContext';
import { redactText } from '../redaction/valuePatterns';
import { safeStringify } from './safeStringify';
import { truncateText } from './truncateText';

import type { LogContext, LogEntry, LogKind } from '../core/types';

export const WIRE_FIELD_CHAR_LIMIT = 2_000;

export interface WireLogEntry extends LogContext {
    id?: string;
    level?: string;
    tag?: string;
    message?: string;
    data?: string;
    error?: string;
    timestamp?: number;
    source?: string;
    area?: string;
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

export const WIRE_MAX_ATTRS = 16;
export const WIRE_MAX_METRICS = 32;
export const WIRE_ATTR_VALUE_CHAR_LIMIT = 100;
const DIMENSION_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

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
        const n = finiteNumber(value);
        if (!DIMENSION_KEY.test(key) || n === undefined) continue;
        out[key] = Math.round(n);
        count += 1;
    }
    return count ? out : undefined;
};

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

const compact = (entry: WireLogEntry): WireLogEntry =>
    Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as WireLogEntry;

export const toWireLogEntry = (entry: LogEntry): WireLogEntry =>
    compact({
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
