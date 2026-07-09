import type { AppLogInfo } from '@chatic/app-messages';

/** Normalizes a timestamp (seconds or ms) to a locale string for display. */
export const formatTimestamp = (timestamp?: number): string => {
    if (!timestamp) return '-';

    // Native buffers stamp seconds; the web buffer stamps ms. Anything below
    // the ~year-2286 ms threshold is treated as seconds and scaled up.
    const normalizedTimestamp = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
    const date = new Date(normalizedTimestamp);

    if (Number.isNaN(date.getTime())) return String(timestamp);
    return date.toLocaleString();
};

/** Renders any value as readable text; Errors and non-serializable values are handled. */
export const stringifyValue = (value: unknown): string => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Error) return `${value.name}: ${value.message}`;

    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

/** Whether an error value is worth surfacing (filters empty / "unknown error" noise). */
export const hasErrorValue = (value: unknown): boolean => {
    if (value === undefined || value === null) return false;
    if (typeof value !== 'string') return true;

    const normalized = value.trim().toLowerCase().replace(/\.+$/, '');
    return normalized !== '' && normalized !== 'unknown error';
};

/** Serializes a full log entry to copy-friendly text (header, message, data, error). */
export const formatLogForCopy = (log: AppLogInfo): string => {
    const lines: string[] = [`[${log.level ?? 'unknown'}] ${log.tag ?? ''}`.trim(), log.message ?? ''];
    lines.push(`at ${formatTimestamp(log.timestamp)}`);

    const data = stringifyValue(log.data);
    if (data) lines.push('', 'data:', data);

    if (hasErrorValue(log.error)) lines.push('', 'error:', stringifyValue(log.error));

    return lines.join('\n');
};
