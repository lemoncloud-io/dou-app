import { BACKGROUND_TOKEN_MARGIN_MS, BackgroundCloudTokens, isBackgroundCloudReady } from './backgroundCloudTokens';
import type { BackgroundCloudTokenDeps } from './backgroundCloudTokens';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const HOUR = 60 * 60_000;

/** A fake world: per-cloud cache entries with a remaining lifetime, bound slots, and a manual clock. */
const world = () => {
    const remaining = new Map<string, number | null>();
    const bound = new Set<string>();
    const timers: Array<{ run: () => void; at: number }> = [];
    const expired = new Set<string>();
    let now = 0;
    let online = true;
    const deps: BackgroundCloudTokenDeps = {
        issue: jest.fn(async (cid: string) => {
            remaining.set(cid, HOUR);
        }),
        hasEntry: cid => remaining.has(cid),
        timeToExpiry: cid => remaining.get(cid) ?? null,
        isSlotBound: cid => bound.has(cid),
        onIssued: jest.fn(),
        takeExpired: cid => expired.delete(cid),
        isOnline: () => online,
        now: () => now,
        setTimer: (run, ms) => {
            const timer = { run, at: now + ms };
            timers.push(timer);
            return timer;
        },
        clearTimer: handle => {
            const index = timers.indexOf(handle as (typeof timers)[number]);
            if (index >= 0) timers.splice(index, 1);
        },
    };
    return {
        deps,
        remaining,
        bound,
        timers,
        expired,
        setOnline: (value: boolean) => {
            online = value;
        },
        /** Moves the clock and fires the timers that came due. */
        advance: (ms: number) => {
            now += ms;
            for (const timer of timers.filter(t => t.at <= now)) {
                timers.splice(timers.indexOf(timer), 1);
                timer.run();
            }
        },
    };
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('isBackgroundCloudReady', () => {
    it('is ready with an entry that has more than the margin left', () => {
        const w = world();
        w.remaining.set('a', BACKGROUND_TOKEN_MARGIN_MS + 1);

        expect(isBackgroundCloudReady('a', w.deps)).toBe(true);
    });

    it('is not ready with an entry inside the margin — it is re-issued before a slot boots on it', () => {
        const w = world();
        w.remaining.set('a', BACKGROUND_TOKEN_MARGIN_MS);

        expect(isBackgroundCloudReady('a', w.deps)).toBe(false);
    });

    it('is not ready without an entry', () => {
        expect(isBackgroundCloudReady('a', world().deps)).toBe(false);
    });

    it('takes an entry with no measurable credential as it is', () => {
        const w = world();
        w.remaining.set('a', null);

        expect(isBackgroundCloudReady('a', w.deps)).toBe(true);
    });

    it('is ready once bound, however little is left — the guard owns a bound cloud', () => {
        const w = world();
        w.remaining.set('a', 1_000);
        w.bound.add('a');

        expect(isBackgroundCloudReady('a', w.deps)).toBe(true);
    });
});

describe('BackgroundCloudTokens', () => {
    it('issues for a cloud with no entry and announces when it lands', async () => {
        const w = world();
        const preparer = new BackgroundCloudTokens(w.deps);

        preparer.sync(['a']);
        await flush();

        expect(w.deps.issue).toHaveBeenCalledWith('a');
        expect(w.deps.onIssued).toHaveBeenCalledTimes(1);
    });

    it('leaves a ready cloud alone', () => {
        const w = world();
        w.remaining.set('a', HOUR);

        new BackgroundCloudTokens(w.deps).sync(['a']);

        expect(w.deps.issue).not.toHaveBeenCalled();
    });

    it('never re-issues for a bound cloud, even one nearly out — that would swap its token underneath it', () => {
        const w = world();
        w.remaining.set('a', 1_000);
        w.bound.add('a');

        new BackgroundCloudTokens(w.deps).sync(['a']);

        expect(w.deps.issue).not.toHaveBeenCalled();
    });

    it('issues once per cloud while an issue is in flight', () => {
        const w = world();
        (w.deps.issue as jest.Mock).mockReturnValue(new Promise(() => undefined));
        const preparer = new BackgroundCloudTokens(w.deps);

        preparer.sync(['a']);
        preparer.sync(['a']);

        expect(w.deps.issue).toHaveBeenCalledTimes(1);
    });

    it('backs off after a failure, doubling, and retries on its own timer', async () => {
        const w = world();
        (w.deps.issue as jest.Mock).mockRejectedValue(new Error('delegate failed'));
        const preparer = new BackgroundCloudTokens(w.deps);

        preparer.sync(['a']);
        await flush();
        expect(w.deps.issue).toHaveBeenCalledTimes(1);

        // A re-sync inside the back-off does not retry.
        preparer.sync(['a']);
        expect(w.deps.issue).toHaveBeenCalledTimes(1);

        w.advance(60_000);
        await flush();
        expect(w.deps.issue).toHaveBeenCalledTimes(2);

        // Second failure: 120s now, so 60s is not enough.
        w.advance(60_000);
        await flush();
        expect(w.deps.issue).toHaveBeenCalledTimes(2);
        w.advance(60_000);
        await flush();
        expect(w.deps.issue).toHaveBeenCalledTimes(3);
    });

    it('does not spend an attempt while offline, and tries again after one interval', async () => {
        const w = world();
        w.setOnline(false);
        const preparer = new BackgroundCloudTokens(w.deps);

        preparer.sync(['a']);
        expect(w.deps.issue).not.toHaveBeenCalled();

        w.setOnline(true);
        w.advance(60_000);
        await flush();
        expect(w.deps.issue).toHaveBeenCalledWith('a');
    });

    it('forgets a cloud that is no longer wanted, and its retry with it', async () => {
        const w = world();
        (w.deps.issue as jest.Mock).mockRejectedValue(new Error('delegate failed'));
        const preparer = new BackgroundCloudTokens(w.deps);
        preparer.sync(['a']);
        await flush();

        preparer.sync([]);

        expect(w.timers).toHaveLength(0);
    });

    it('backs off instead of looping when an issue lands but still leaves the cloud unusable', async () => {
        // A server answer with no wss, or a credential already inside the margin: re-issuing at once
        // would spin two HTTP calls per round forever.
        const w = world();
        (w.deps.issue as jest.Mock).mockImplementation(async (cid: string) => {
            w.remaining.set(cid, 1_000);
        });
        const preparer = new BackgroundCloudTokens(w.deps);

        preparer.sync(['a']);
        await flush();
        preparer.sync(['a']);
        await flush();

        expect(w.deps.issue).toHaveBeenCalledTimes(1);
        expect(w.deps.onIssued).not.toHaveBeenCalled();
        expect(w.timers).toHaveLength(1);
    });

    it('waits before re-issuing a cloud whose socket session just expired', async () => {
        // Its slot was torn down and its entry dropped; issuing at once would re-boot it into the
        // same expiry, in a loop.
        const w = world();
        w.expired.add('a');
        const preparer = new BackgroundCloudTokens(w.deps);

        preparer.sync(['a']);
        await flush();
        expect(w.deps.issue).not.toHaveBeenCalled();

        w.advance(60_000);
        await flush();
        expect(w.deps.issue).toHaveBeenCalledWith('a');
    });

    it('does nothing after dispose, and does not announce an issue that lands afterwards', async () => {
        const w = world();
        const preparer = new BackgroundCloudTokens(w.deps);
        preparer.sync(['a']);
        preparer.dispose();
        await flush();

        preparer.sync(['b']);

        expect(w.deps.issue).toHaveBeenCalledTimes(1);
        expect(w.deps.onIssued).not.toHaveBeenCalled();
    });
});
