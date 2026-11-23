import type { AppLogInfo } from '@chatic/bridge-messages';

export const formatTimestamp = (timestamp?: number): string => {
    if (!timestamp) return '-';

    const normalizedTimestamp = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
    const date = new Date(normalizedTimestamp);

    if (Number.isNaN(date.getTime())) return String(timestamp);
    return date.toLocaleString();
};

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

export const hasErrorValue = (value: unknown): boolean => {
    if (value === undefined || value === null) return false;
    if (typeof value !== 'string') return true;

    const normalized = value.trim().toLowerCase().replace(/\.+$/, '');
    return normalized !== '' && normalized !== 'unknown error';
};

export const formatLogForCopy = (log: AppLogInfo): string => {
    const lines: string[] = [`[${log.level ?? 'unknown'}] ${log.tag ?? ''}`.trim(), log.message ?? ''];
    lines.push(`at ${formatTimestamp(log.timestamp)}`);

    const data = stringifyValue(log.data);
    if (data) lines.push('', 'data:', data);

    if (hasErrorValue(log.error)) lines.push('', 'error:', stringifyValue(log.error));

    return lines.join('\n');
};
