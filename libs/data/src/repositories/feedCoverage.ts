/** An inclusive run of chat numbers, `[low, high]`. */
export type FeedRange = readonly [low: number, high: number];

/** No range answered for. One array, so a channel with nothing covered reads the same value each time. */
const NOTHING_COVERED: readonly FeedRange[] = Object.freeze([]);

/**
 * The parts of `[low, high]` that `covered` — answered-for ranges, oldest first, merged — leaves out,
 * oldest first. Pure, so a reader holding a channel's ranges (`observeFeedCoverage`) asks it without
 * reaching the record.
 */
export const uncoveredIn = (covered: readonly FeedRange[], low: number, high: number): FeedRange[] => {
    if (high < low) return [];
    const gaps: FeedRange[] = [];
    let cursor = low;
    for (const [rangeLow, rangeHigh] of covered) {
        if (rangeHigh < cursor) continue;
        if (rangeLow > high) break;
        if (rangeLow > cursor) gaps.push([cursor, rangeLow - 1]);
        cursor = Math.max(cursor, rangeHigh + 1);
        if (cursor > high) break;
    }
    if (cursor <= high) gaps.push([cursor, high]);
    return gaps;
};

/**
 * The chat-number ranges of each channel the server has answered for in full, kept for the life of
 * the page (the app run).
 *
 * A feed page proves more than the rows it brings: the server answers a page by looking up every
 * chat number in its range and leaving out only the soft-deleted ones, so a number the page skipped
 * is a deleted message, not one still to fetch. Rows alone cannot tell the two apart — a deleted
 * message leaves the same hole in the cache as history nobody has fetched yet — so this is what lets
 * a reader tell a gap worth filling from a hole worth ignoring.
 *
 * Memory only, deliberately. Persisting it would put a second store beside the cache that has to
 * agree with it through every clear and cloud switch; forgetting it on relaunch costs one request per
 * page of old history the reader looks at again, and that request also brings back edits made while
 * the device was away.
 */
export class FeedCoverage {
    private readonly ranges = new Map<string, readonly FeedRange[]>();
    private readonly listeners = new Map<string, Set<(covered: readonly FeedRange[]) => void>>();

    /**
     * The ranges recorded under `key`, oldest first and merged. The same array until they change, so a
     * reader can compare it by identity.
     */
    covered(key: string): readonly FeedRange[] {
        return this.ranges.get(key) ?? NOTHING_COVERED;
    }

    /** Hears each change of `key`'s ranges, with the ranges after it. Returns the unsubscribe. */
    subscribe(key: string, listener: (covered: readonly FeedRange[]) => void): () => void {
        const listeners = this.listeners.get(key) ?? new Set();
        this.listeners.set(key, listeners);
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
            // A second call after the set emptied must not drop a later subscriber's set for the key.
            if (listeners.size === 0 && this.listeners.get(key) === listeners) this.listeners.delete(key);
        };
    }

    private notify(key: string): void {
        const covered = this.covered(key);
        this.listeners.get(key)?.forEach(listener => listener(covered));
    }

    /** Records `[low, high]` as answered for. Overlapping and touching ranges merge. */
    add(key: string, low: number, high: number): void {
        if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) return;
        const merged: FeedRange[] = [];
        let next: [number, number] = [low, high];
        for (const range of this.ranges.get(key) ?? []) {
            if (range[1] + 1 < next[0] || next[1] + 1 < range[0]) merged.push(range);
            else next = [Math.min(range[0], next[0]), Math.max(range[1], next[1])];
        }
        merged.push(next);
        merged.sort((a, b) => a[0] - b[0]);
        const previous = this.covered(key);
        // A range already inside what was recorded changes nothing, and tells no one.
        if (merged.length === previous.length && merged.every((range, index) => sameRange(range, previous[index]))) {
            return;
        }
        this.ranges.set(key, merged);
        this.notify(key);
    }

    /** The parts of `[low, high]` not yet answered for, oldest first. */
    uncovered(key: string, low: number, high: number): FeedRange[] {
        return uncoveredIn(this.covered(key), low, high);
    }

    /**
     * Drops what is recorded under the matching keys. Whoever clears cached rows has to clear this with
     * them: a range left behind would read the holes the clear opened as deleted messages — no divider,
     * no re-check — for the rest of the run.
     */
    forget(matches: (key: string) => boolean): void {
        for (const key of [...this.ranges.keys()]) {
            if (!matches(key)) continue;
            this.ranges.delete(key);
            this.notify(key);
        }
    }

    clear(): void {
        const keys = [...this.ranges.keys()];
        this.ranges.clear();
        keys.forEach(key => this.notify(key));
    }
}

const sameRange = (a: FeedRange, b: FeedRange | undefined): boolean => !!b && a[0] === b[0] && a[1] === b[1];

/**
 * The one record for the page. Repositories are built per scope and may be rebuilt on a cloud switch;
 * the key carries the scope, so they all write to and read from the same memory.
 */
export const feedCoverage = new FeedCoverage();

/** The coverage key for one channel in one scope. */
export const feedCoverageKey = (cid: string | undefined, uid: string | undefined, channelId: string): string =>
    `${feedCoverageScope(cid, uid)}${channelId}`;

/** Forgets one channel's ranges in one scope — for every path that clears a channel's cached chats. */
export const forgetChannelCoverage = (channelId: string, scope: { cid?: string; uid?: string }): void => {
    const key = feedCoverageKey(scope.cid, scope.uid, channelId);
    feedCoverage.forget(candidate => candidate === key);
};

/** The part of every key in one scope — what a scope-wide cache clear forgets. */
export const feedCoverageScope = (cid: string | undefined, uid: string | undefined): string =>
    `${cid || 'default'}|${uid || ''}|`;
