/** An inclusive run of chat numbers, `[low, high]`. */
export type FeedRange = readonly [low: number, high: number];

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
    private readonly ranges = new Map<string, FeedRange[]>();

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
        this.ranges.set(key, merged);
    }

    /** The parts of `[low, high]` not yet answered for, oldest first. */
    uncovered(key: string, low: number, high: number): FeedRange[] {
        if (high < low) return [];
        const gaps: FeedRange[] = [];
        let cursor = low;
        for (const [rangeLow, rangeHigh] of this.ranges.get(key) ?? []) {
            if (rangeHigh < cursor) continue;
            if (rangeLow > high) break;
            if (rangeLow > cursor) gaps.push([cursor, rangeLow - 1]);
            cursor = Math.max(cursor, rangeHigh + 1);
            if (cursor > high) break;
        }
        if (cursor <= high) gaps.push([cursor, high]);
        return gaps;
    }

    /**
     * Drops what is recorded under the matching keys. Whoever clears cached rows has to clear this with
     * them: a range left behind would read the holes the clear opened as deleted messages — no divider,
     * no re-check — for the rest of the run.
     */
    forget(matches: (key: string) => boolean): void {
        for (const key of [...this.ranges.keys()]) if (matches(key)) this.ranges.delete(key);
    }

    clear(): void {
        this.ranges.clear();
    }
}

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
