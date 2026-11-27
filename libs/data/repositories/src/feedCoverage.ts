export type FeedRange = readonly [low: number, high: number];

const NOTHING_COVERED: readonly FeedRange[] = Object.freeze([]);

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

export class FeedCoverage {
    private readonly ranges = new Map<string, readonly FeedRange[]>();
    private readonly listeners = new Map<string, Set<(covered: readonly FeedRange[]) => void>>();

    covered(key: string): readonly FeedRange[] {
        return this.ranges.get(key) ?? NOTHING_COVERED;
    }

    subscribe(key: string, listener: (covered: readonly FeedRange[]) => void): () => void {
        const listeners = this.listeners.get(key) ?? new Set();
        this.listeners.set(key, listeners);
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0 && this.listeners.get(key) === listeners) this.listeners.delete(key);
        };
    }

    private notify(key: string): void {
        const covered = this.covered(key);
        this.listeners.get(key)?.forEach(listener => listener(covered));
    }

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
        if (merged.length === previous.length && merged.every((range, index) => sameRange(range, previous[index]))) {
            return;
        }
        this.ranges.set(key, merged);
        this.notify(key);
    }

    uncovered(key: string, low: number, high: number): FeedRange[] {
        return uncoveredIn(this.covered(key), low, high);
    }

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

export const feedCoverage = new FeedCoverage();

export const feedCoverageKey = (cid: string | undefined, uid: string | undefined, channelId: string): string =>
    `${feedCoverageScope(cid, uid)}${channelId}`;

export const forgetChannelCoverage = (channelId: string, scope: { cid?: string; uid?: string }): void => {
    const key = feedCoverageKey(scope.cid, scope.uid, channelId);
    feedCoverage.forget(candidate => candidate === key);
};

export const feedCoverageScope = (cid: string | undefined, uid: string | undefined): string =>
    `${cid || 'default'}|${uid || ''}|`;
