import type { LogEntry, LogListener } from './types';

export class LogHub {
    private readonly listeners = new Set<LogListener>();

    public subscribe(listener: LogListener): () => void {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }

    public publish(entry: LogEntry): void {
        this.listeners.forEach(listener => {
            try {
                listener(entry);
            } catch {
                /* noop */
            }
        });
    }

    public size(): number {
        return this.listeners.size;
    }
}
