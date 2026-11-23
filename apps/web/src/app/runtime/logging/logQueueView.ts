import type { LogEntry } from '@chatic/bridges';

export interface LogQueueView {
    snapshot(): LogEntry[];
    clear(): void;
    flush(): Promise<void>;
    droppedCount(): number;
}

let view: LogQueueView | undefined;

export const registerLogQueueView = (registered: LogQueueView): (() => void) => {
    view = registered;
    return () => {
        if (view === registered) view = undefined;
    };
};

export const getLogQueueView = (): LogQueueView | undefined => view;
