import { redactCredentials } from './redact';

export type LogSource = 'web→shell' | 'shell→web' | 'console' | 'tool' | 'unsupported' | 'lifecycle';

export interface LogEntry {
    /** From 1, increasing. A caller keeps the last one it saw and asks for what came `since`. */
    seq: number;
    at: string;
    source: LogSource;
    /** The message type; a console line's level. */
    type?: string;
    refId?: string;
    data?: unknown;
    truncated?: true;
}

export interface LogFilter {
    since?: number;
    source?: LogSource[];
    type?: string;
    text?: string;
}

/** Lines kept; the oldest go first. */
export const LOG_CAPACITY = 2_000;
/** The size a line's `data` may take as JSON before it is cut. */
export const LOG_DATA_LIMIT = 16 * 1024;

const serialize = (value: unknown): string => {
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
};

/**
 * Everything that crossed the shell, in memory only.
 *
 * Never written to a file: in prod a reply carrying a session passes through here. Every line is
 * masked as it is recorded (`redactCredentials`) and no unmasked copy is kept, here or in the bridge
 * core — so what the panel, `logs()` and "Copy JSON" hold is what the masking let through.
 */
export class LogStore {
    private entries: LogEntry[] = [];
    private nextSeq = 1;
    private changes = 0;
    /**
     * Each line's searchable text, made once: a text filter is applied to every line on every redraw,
     * and serialising 2,000 lines of up to 16 KB each time would stall the panel.
     */
    private readonly searchText = new WeakMap<LogEntry, string>();
    private readonly listeners = new Set<(entry: LogEntry) => void>();

    append(entry: Omit<LogEntry, 'seq' | 'at' | 'truncated'>): LogEntry {
        const line: LogEntry = { seq: this.nextSeq++, at: new Date().toISOString(), source: entry.source };
        if (entry.type !== undefined) line.type = entry.type;
        if (entry.refId !== undefined) line.refId = entry.refId;
        if (entry.data !== undefined) {
            const data = redactCredentials(entry.data);
            const json = serialize(data);
            if (json.length > LOG_DATA_LIMIT) {
                line.data = json.slice(0, LOG_DATA_LIMIT);
                line.truncated = true;
            } else {
                line.data = data;
            }
        }
        this.entries.push(line);
        this.changes++;
        if (this.entries.length > LOG_CAPACITY) this.entries.splice(0, this.entries.length - LOG_CAPACITY);
        for (const listener of [...this.listeners]) listener(line);
        return line;
    }

    query(filter: LogFilter = {}): LogEntry[] {
        const text = filter.text?.toLowerCase();
        return this.entries.filter(
            entry =>
                (filter.since === undefined || entry.seq > filter.since) &&
                (!filter.source?.length || filter.source.includes(entry.source)) &&
                (filter.type === undefined || entry.type === filter.type) &&
                (!text || this.textOf(entry).includes(text))
        );
    }

    private textOf(entry: LogEntry): string {
        let text = this.searchText.get(entry);
        if (text === undefined) {
            text = serialize(entry).toLowerCase();
            this.searchText.set(entry, text);
        }
        return text;
    }

    /** Changes with every line recorded and every clear: what a view memoises the log on. */
    get version(): number {
        return this.changes;
    }

    /** The newest line's `seq`, or 0 before anything was recorded. */
    get lastSeq(): number {
        return this.nextSeq - 1;
    }

    /** Forgets every line. `seq` keeps counting, so a cursor taken before still means "after that". */
    clear(): void {
        this.entries = [];
        this.changes++;
    }

    subscribe(listener: (entry: LogEntry) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}
