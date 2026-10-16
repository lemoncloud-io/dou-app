import type { LogEntry } from '../shell/logStore';

const compact = (value: unknown): string => {
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
};

/**
 * A console line as the page wrote it: its arguments side by side, text as text and anything else as
 * compact JSON — the way a browser console shows a call, rather than the array it was recorded as. A
 * format string is applied as the console applies it: `%c` takes its CSS argument and shows nothing
 * (some libraries style every line), `%s` `%d` `%i` `%f` `%o` `%O` take one argument each.
 */
export const consoleText = (data: unknown): string => {
    if (!Array.isArray(data)) return compact(data ?? '');
    const [first, ...rest] = data;
    if (typeof first !== 'string' || !/%[csdifoO%]/.test(first)) return data.map(compact).join(' ');
    const args = [...rest];
    const formatted = first
        .replace(/%([csdifoO%])/g, (_, token: string) => {
            if (token === '%') return '%';
            const value = args.shift();
            return token === 'c' ? '' : compact(value);
        })
        .replace(/\s{2,}/g, ' ')
        .trim();
    return [formatted, ...args.map(compact)].filter(Boolean).join(' ');
};

/** One line standing for a message's data, cut to `max` characters. Empty when there is no data. */
export const dataPreview = (data: unknown, max = 160): string => {
    if (data === undefined) return '';
    const text = compact(data);
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** What a log row shows under its heading: the console text, or a preview of the data. */
export const lineSummary = (entry: LogEntry, max = 160): string =>
    entry.source === 'console' ? dataPreview(consoleText(entry.data), max) : dataPreview(entry.data, max);

/** The time a line was recorded, on this machine's clock, to the millisecond. */
export const localTime = (iso: string): string => {
    const date = new Date(iso);
    const pad = (value: number, width = 2) => String(value).padStart(width, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};
