import { pickLogContext, safeSerializable } from '@chatic/logger';

import type { AppLogInfo, AppLogStructuredFields } from '@chatic/bridge-messages';
import type { LogContext, LogEntry } from '@chatic/logger';

export type AppLogInfoLogContext = Pick<AppLogInfo, keyof LogContext>;

const STRUCTURED_FIELDS = [
    'kind',
    'httpStatus',
    'errorCode',
    'durationMs',
    'attrs',
    'metrics',
    'sr',
    'pv',
    'seq',
] as const satisfies readonly (keyof AppLogStructuredFields & keyof LogEntry)[];

const KNOWN_KINDS: readonly unknown[] = ['log', 'trace', 'sample', 'event'];

const pickStructured = (
    source: Partial<Record<(typeof STRUCTURED_FIELDS)[number], unknown>>
): AppLogStructuredFields => {
    const picked: Record<string, unknown> = {};
    for (const field of STRUCTURED_FIELDS) {
        if (source[field] !== undefined) picked[field] = source[field];
    }
    if (picked.kind !== undefined && !KNOWN_KINDS.includes(picked.kind)) delete picked.kind;
    return picked as AppLogStructuredFields;
};

export const toAppLogInfo = (entry: LogEntry): AppLogInfo => ({
    ...pickLogContext(entry),
    ...pickStructured(entry),
    id: entry.id,
    level: entry.level,
    tag: entry.tag,
    message: entry.message,
    data: safeSerializable(entry.data),
    error: safeSerializable(entry.error),
    timestamp: entry.timestamp,
    source: 'web',
});

export const toLogEntry = (info: AppLogInfo): LogEntry => ({
    ...pickLogContext(info),
    ...(pickStructured(info) as Partial<LogEntry>),
    ...(info.id !== undefined ? { id: info.id } : {}),
    level: info.level ?? 'info',
    tag: info.tag ?? 'APP',
    message: info.message ?? '',
    timestamp: info.timestamp ?? 0,
    ...(info.data !== undefined ? { data: info.data } : {}),
    ...(info.error !== undefined ? { error: info.error } : {}),
    ...(info.source !== undefined ? { source: info.source } : {}),
});
