import type { ObservationData } from '../core';
import { logger } from '../runtime';

/**
 * Where a drop happened. A plain label, not a domain concept — it exists so the aggregate says which
 * of the ten skip sites produced the count rather than reporting an anonymous number.
 */
export type ForeignDropSource = 'channel-refresh' | 'channel-sync' | 'channel-self' | 'place-refresh' | 'sync-frame';

export interface ForeignDropInput {
    source: ForeignDropSource;
    /** The cache scope the write was aimed at. Treated as an opaque label here. */
    cid: string;
    /** The cloud the answering socket was actually bound to. Also opaque. */
    socketCid: string;
}

/**
 * Counts cache writes and socket frames dropped because the answering socket belonged to a
 * different cloud, and reports one entry per window instead of one per drop.
 *
 * **Why aggregate rather than log each.** These fire on the sync poll, which runs per registered
 * target every couple of seconds with dozens of targets live on the home screen. One entry per drop
 * would spend the device's whole log budget during a cloud switch — and the eviction order is
 * oldest-first, so the burst would push out the very entries explaining what preceded it. The
 * catalog forbids per-frame logging for exactly this reason.
 *
 * **Why it lives in the logging core.** Two libraries drop these — the repositories and the sync
 * plans — and both already see this package re-exported through `@chatic/bridges`, so a shared home
 * here costs no new dependency. One home also means one window: an aggregator per consumer would
 * split the same switch into two counts. The trade-off is that a domain word (`cid`) appears in the
 * core; it is carried as an opaque string and nothing here interprets it.
 *
 * **The timer only exists while drops do.** The first drop opens a window; closing it reports and
 * clears. An always-on interval would charge an idle device for a thing that is not happening.
 */
export interface IForeignDropAggregator {
    /** Records one drop. Reports nothing until the window closes. */
    record(input: ForeignDropInput): void;
    /** Closes any open window immediately (flushing what it holds). Tests only. */
    flushNow(): void;
    /** Drops the window and its counts without reporting. Tests only. */
    reset(): void;
}

class ForeignDropAggregator implements IForeignDropAggregator {
    /**
     * How long drops are collected before one entry is emitted.
     *
     * A switch's optimistic window is short, so a longer window would separate the entry from the
     * switch that caused it, and a shorter one would split a single switch across several lines.
     */
    private static readonly WINDOW_MS = 5_000;

    /** Counts keyed by `source|cid|socketCid` — the grouping the emitted entry reports on. */
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
