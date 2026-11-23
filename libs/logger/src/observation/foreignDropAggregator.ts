import type { ObservationData } from '../core';
import { logger } from '../runtime';

export type ForeignDropSource =
    | 'channel-refresh'
    | 'channel-sync'
    | 'channel-self'
    | 'channel-one'
    | 'channel-start-dm'
    | 'place-refresh';

export interface ForeignDropInput {
    source: ForeignDropSource;
    cid: string;
    socketCid: string;
}

export interface IForeignDropAggregator {
    record(input: ForeignDropInput): void;
    flushNow(): void;
    reset(): void;
}

class ForeignDropAggregator implements IForeignDropAggregator {
    private static readonly WINDOW_MS = 5_000;

    private readonly counts = new Map<string, { input: ForeignDropInput; count: number }>();

    private timer: ReturnType<typeof setTimeout> | undefined;

    record(input: ForeignDropInput): void {
        const key = `${input.source}|${input.cid}|${input.socketCid}`;
        const existing = this.counts.get(key);
        if (existing) existing.count += 1;
        else this.counts.set(key, { input, count: 1 });

        if (this.timer === undefined) {
            this.timer = setTimeout(() => this.flush(), ForeignDropAggregator.WINDOW_MS);
        }
    }

    flushNow(): void {
        this.flush();
    }

    reset(): void {
        this.clearTimer();
        this.counts.clear();
    }

    private flush(): void {
        this.clearTimer();
        const groups = [...this.counts.values()];
        this.counts.clear();

        for (const { input, count } of groups) {
            logger.warn('CACHE', `dropped ${count} write(s) from a foreign cloud — ${input.source}`, {
                observation: 'foreign-drop',
                source: input.source,
                cid: input.cid,
                socketCid: input.socketCid,
                count,
            } satisfies ObservationData);
        }
    }

    private clearTimer(): void {
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }
}

export const foreignDropAggregator: IForeignDropAggregator = new ForeignDropAggregator();
