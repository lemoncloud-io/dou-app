import {
    CATCH_UP_MAX_OLDER_PAGES,
    CATCH_UP_OLDER_LIMIT,
    catchUpChannel,
    createPageGate,
    type CatchUpPage,
} from './chatCatchUp';

/** The server's page size when a request names none — what the newest page is counted with. */
const NEWEST_LIMIT = 20;

/**
 * A feed that counts down like the server: a page below `cursorNo` (or below the head) covers `limit`
 * numbers and answers with the lowest one it counted, or 0 once it reached the start.
 */
const feedWithHead = (head: number) => {
    const answer = (top: number, limit: number): CatchUpPage => {
        const low = top - limit;
        return { cursorNo: low <= 1 ? 0 : low };
    };
    return {
        fetchNewest: jest.fn(async () => answer(head + 1, NEWEST_LIMIT)),
        fetchOlder: jest.fn(async (cursorNo: number, limit: number) => answer(Math.min(cursorNo, head + 1), limit)),
    };
};

const always = () => true;

describe('catchUpChannel', () => {
    it('pulls only the newest page when it already meets what the cache holds', async () => {
        const feed = feedWithHead(110);

        const result = await catchUpChannel({ knownNo: 100, ...feed, shouldContinue: always });

        expect(feed.fetchNewest).toHaveBeenCalledTimes(1);
        expect(feed.fetchOlder).not.toHaveBeenCalled();
        expect(result).toEqual({ olderPages: 0, reachedCache: true });
    });

    it('pages older until the pages meet the newest cached row', async () => {
        // Head 200, cache up to 100: the newest page covers 181–200, then 131–180, then 81–130.
        const feed = feedWithHead(200);

        const result = await catchUpChannel({ knownNo: 100, ...feed, shouldContinue: always });

        expect(feed.fetchOlder.mock.calls).toEqual([
            [181, CATCH_UP_OLDER_LIMIT],
            [131, CATCH_UP_OLDER_LIMIT],
        ]);
        expect(result).toEqual({ olderPages: 2, reachedCache: true });
    });

    it('treats a page that starts right above the cached row as meeting it', async () => {
        // Head 120, cache up to 100: the newest page covers 101–120, nothing is missing.
        const feed = feedWithHead(120);

        const result = await catchUpChannel({ knownNo: 100, ...feed, shouldContinue: always });

        expect(feed.fetchOlder).not.toHaveBeenCalled();
        expect(result.reachedCache).toBe(true);
    });

    it('stops at the bound and reports the hole it left', async () => {
        const feed = feedWithHead(10_000);

        const result = await catchUpChannel({ knownNo: 100, ...feed, shouldContinue: always });

        expect(feed.fetchOlder).toHaveBeenCalledTimes(CATCH_UP_MAX_OLDER_PAGES);
        expect(result).toEqual({ olderPages: CATCH_UP_MAX_OLDER_PAGES, reachedCache: false });
    });

    it('stops at the start of history', async () => {
        // Head 60 with a cache that holds one old row: the first older page reaches number 1.
        const feed = feedWithHead(60);

        const result = await catchUpChannel({ knownNo: 1, ...feed, shouldContinue: always });

        expect(feed.fetchOlder).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ olderPages: 1, reachedCache: true });
    });

    it('does not walk a room the cache holds nothing of', async () => {
        const feed = feedWithHead(500);

        const result = await catchUpChannel({ knownNo: 0, ...feed, shouldContinue: always });

        expect(feed.fetchNewest).toHaveBeenCalledTimes(1);
        expect(feed.fetchOlder).not.toHaveBeenCalled();
        expect(result).toEqual({ olderPages: 0, reachedCache: false });
    });

    it('reads a newest page with no cursor as the start of history', async () => {
        const fetchNewest = jest.fn(async () => ({}));
        const fetchOlder = jest.fn();

        const result = await catchUpChannel({ knownNo: 100, fetchNewest, fetchOlder, shouldContinue: always });

        expect(fetchOlder).not.toHaveBeenCalled();
        expect(result).toEqual({ olderPages: 0, reachedCache: true });
    });

    it('asks before every older page and stops when told to', async () => {
        const feed = feedWithHead(1_000);
        const shouldContinue = jest.fn().mockReturnValueOnce(true).mockReturnValue(false);

        const result = await catchUpChannel({ knownNo: 100, ...feed, shouldContinue });

        expect(feed.fetchOlder).toHaveBeenCalledTimes(1);
        expect(shouldContinue).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ olderPages: 1, reachedCache: false });
    });

    it('stops when an answer does not move the cursor down', async () => {
        const fetchNewest = jest.fn(async () => ({ cursorNo: 500 }));
        const fetchOlder = jest.fn(async (cursorNo: number) => ({ cursorNo }));

        const result = await catchUpChannel({ knownNo: 100, fetchNewest, fetchOlder, shouldContinue: always });

        expect(fetchOlder).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ olderPages: 1, reachedCache: false });
    });

    it('lets a failed page reject, for the caller to drop', async () => {
        const fetchNewest = jest.fn(async () => ({ cursorNo: 300 }));
        const fetchOlder = jest.fn().mockRejectedValue(new Error('socket closed'));

        await expect(catchUpChannel({ knownNo: 100, fetchNewest, fetchOlder, shouldContinue: always })).rejects.toThrow(
            'socket closed'
        );
    });
});

describe('createPageGate', () => {
    /** Lets the gate's release, which runs after the caller's answer, take its turn. */
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));

    /** A task that stays open until `finish` is called. */
    const openTask = () => {
        let finish: (value: string) => void = () => undefined;
        let fail: (error: Error) => void = () => undefined;
        const promise = new Promise<string>((resolve, reject) => {
            finish = resolve;
            fail = reject;
        });
        return { task: jest.fn(() => promise), finish, fail };
    };

    it('runs at most the given number of tasks at once and starts the next as one ends', async () => {
        const gate = createPageGate(2);
        const [a, b, c] = [openTask(), openTask(), openTask()];

        const results = [gate(a.task), gate(b.task), gate(c.task)];
        expect(a.task).toHaveBeenCalled();
        expect(b.task).toHaveBeenCalled();
        expect(c.task).not.toHaveBeenCalled();

        a.finish('a');
        await results[0];
        await flush();
        expect(c.task).toHaveBeenCalled();

        b.finish('b');
        c.finish('c');
        await expect(Promise.all(results)).resolves.toEqual(['a', 'b', 'c']);
    });

    it('frees the slot of a task that failed and hands the failure to its caller', async () => {
        const gate = createPageGate(1);
        const failing = openTask();
        const next = openTask();

        const first = gate(failing.task);
        const second = gate(next.task);
        failing.fail(new Error('page failed'));

        await expect(first).rejects.toThrow('page failed');
        await flush();
        expect(next.task).toHaveBeenCalled();
        next.finish('ok');
        await expect(second).resolves.toBe('ok');
    });
});
