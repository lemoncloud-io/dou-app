import {
    ImageCache,
    imageCacheKey,
    type ImageCacheDeps,
    type ImageCacheRecord,
    type ImageCacheStore,
    type ImageVariant,
} from './imageCache';

const answer = (bytes: number, { ok = true, type = 'image/jpeg' } = {}) =>
    ({
        ok,
        headers: { get: (name: string) => (name === 'content-type' ? type : null) },
        arrayBuffer: async () => new ArrayBuffer(bytes),
    }) as unknown as Response;

/** A store in a map, so a test can see what was kept and fail an operation on demand. */
const memoryStore = () => {
    const records = new Map<string, ImageCacheRecord>();
    const store: jest.Mocked<ImageCacheStore> = {
        get: jest.fn(async key => records.get(key)),
        put: jest.fn(async record => {
            records.set(record.key, record);
        }),
        touch: jest.fn(async (key, usedAt) => {
            const record = records.get(key);
            if (record) records.set(key, { ...record, usedAt });
        }),
        delete: jest.fn(async key => {
            records.delete(key);
        }),
        trim: jest.fn<Promise<void>, [ImageVariant, number]>(async () => undefined),
    };
    return { store, records };
};

const setup = (overrides: Partial<ImageCacheDeps> = {}) => {
    const { store, records } = memoryStore();
    let next = 0;
    const deps = {
        store,
        fetch: jest.fn(async () => answer(10)),
        createObjectURL: jest.fn(() => `blob:${++next}`),
        revokeObjectURL: jest.fn(),
        now: () => 1_000_000,
        ...overrides,
    } satisfies ImageCacheDeps;
    return { cache: new ImageCache(deps), deps, store, records };
};

// Stored writes are fire-and-forget; let their promise chain settle.
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('imageCacheKey', () => {
    it('names the cloud, the upload and the variant', () => {
        expect(imageCacheKey('cloud-a', 'u1', 'thumb')).toBe('cloud-a/u1/thumb');
    });
});

describe('ImageCache', () => {
    it('fetches a miss once, keeps it, and answers the next load from memory', async () => {
        const { cache, deps, records } = setup();

        const first = await cache.load('k', 'thumb', 'https://s3/k?sig=1');
        await flush();
        const second = await cache.load('k', 'thumb', 'https://s3/k?sig=2');

        expect(first).toBe('blob:1');
        expect(second).toBe('blob:1');
        expect(cache.peek('k')).toBe('blob:1');
        expect(deps.fetch).toHaveBeenCalledTimes(1);
        expect(records.get('k')).toMatchObject({ variant: 'thumb', type: 'image/jpeg', size: 10 });
    });

    // The point of the cache: a new signed address for a kept image is not a new download.
    it('answers from the store on a fresh page, without fetching', async () => {
        const { cache: before, records } = setup();
        await before.load('k', 'thumb', 'https://s3/k?sig=1');
        await flush();

        const { cache: after, deps, store } = setup();
        store.get.mockResolvedValue(records.get('k') as ImageCacheRecord);

        expect(await after.load('k', 'thumb', 'https://s3/k?sig=2')).toBe('blob:1');
        expect(deps.fetch).not.toHaveBeenCalled();
    });

    it('shares one fetch between loads of the same key', async () => {
        const { cache, deps } = setup();

        const [a, b] = await Promise.all([cache.load('k', 'thumb', 'u1'), cache.load('k', 'thumb', 'u2')]);

        expect(a).toBe(b);
        expect(deps.fetch).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['an expired address (403)', () => answer(10, { ok: false })],
        ['a body that is not an image', () => answer(10, { type: 'application/xml' })],
    ])('answers null and keeps nothing for %s', async (_, response) => {
        const { cache, deps, records } = setup({ fetch: jest.fn(async () => response()) });

        expect(await cache.load('k', 'thumb', 'u')).toBeNull();
        await flush();
        expect(records.size).toBe(0);
        expect(deps.createObjectURL).not.toHaveBeenCalled();
    });

    // No CORS on the bucket, or offline: the caller draws the signed address as before, and the next
    // images do not each wait for the same failure.
    it('answers null when the fetch gets no answer, and skips fetching for a minute', async () => {
        let clock = 0;
        const fetch = jest.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));
        fetch.mockResolvedValue(answer(10));
        const { cache } = setup({ fetch, now: () => clock });

        expect(await cache.load('a', 'thumb', 'u')).toBeNull();
        expect(await cache.load('b', 'thumb', 'u')).toBeNull();
        expect(fetch).toHaveBeenCalledTimes(1);

        clock = 60 * 1000;
        expect(await cache.load('b', 'thumb', 'u')).toBe('blob:1');
    });

    // A 403 is an answer about one address, not about the bucket.
    it('keeps fetching after an address is refused', async () => {
        const fetch = jest.fn().mockResolvedValueOnce(answer(10, { ok: false }));
        fetch.mockResolvedValue(answer(10));
        const { cache } = setup({ fetch });

        expect(await cache.load('a', 'thumb', 'u')).toBeNull();
        expect(await cache.load('b', 'thumb', 'u')).toBe('blob:1');
    });

    // The refreshed address arrives while the expired one is still on its way.
    it('tries its own address when the load it joined answers null', async () => {
        const fetch = jest.fn(async (url: string) => (url === 'old' ? answer(10, { ok: false }) : answer(10)));
        const { cache } = setup({ fetch });

        const [stale, fresh] = await Promise.all([cache.load('k', 'thumb', 'old'), cache.load('k', 'thumb', 'new')]);

        expect(stale).toBeNull();
        expect(fresh).toBe('blob:1');
    });

    // A hung IndexedDB open would otherwise hold every tile blank.
    it('treats a store read slower than a second as a miss', async () => {
        jest.useFakeTimers();
        try {
            const { cache, store, deps } = setup();
            store.get.mockReturnValue(new Promise(() => undefined));

            const loading = cache.load('k', 'thumb', 'u');
            await jest.advanceTimersByTimeAsync(1000);

            expect(await loading).toBe('blob:1');
            expect(deps.fetch).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });

    it('still works from memory when the store fails', async () => {
        const { cache, store } = setup();
        store.get.mockRejectedValue(new Error('quota'));
        store.put.mockRejectedValue(new Error('quota'));

        expect(await cache.load('k', 'thumb', 'u')).toBe('blob:1');
        await flush();
        expect(cache.peek('k')).toBe('blob:1');
    });

    it('works with no store at all', async () => {
        const { cache } = setup({ store: null });
        expect(await cache.load('k', 'thumb', 'u')).toBe('blob:1');
    });

    it('moves a stored hit up the eviction order only when its last move is old', async () => {
        const { cache, store } = setup({ now: () => 10 * 60 * 60 * 1000 });
        store.get.mockImplementation(async key => ({
            key,
            variant: 'thumb',
            type: 'image/jpeg',
            bytes: new ArrayBuffer(1),
            size: 1,
            usedAt: key === 'stale' ? 0 : 10 * 60 * 60 * 1000 - 1,
        }));

        await cache.load('stale', 'thumb', 'u');
        await cache.load('recent', 'thumb', 'u');

        expect(store.touch).toHaveBeenCalledTimes(1);
        expect(store.touch).toHaveBeenCalledWith('stale', 10 * 60 * 60 * 1000);
    });

    it('trims the variant it wrote to, once for puts close together', async () => {
        jest.useFakeTimers();
        try {
            const { cache, store } = setup({ budgets: { thumb: 100, org: 1000 } });
            await cache.load('a', 'thumb', 'u');
            await cache.load('b', 'thumb', 'u');
            // Let the fire-and-forget puts land before the timer is checked.
            await jest.advanceTimersByTimeAsync(0);
            expect(store.trim).not.toHaveBeenCalled();

            await jest.advanceTimersByTimeAsync(2000);

            expect(store.trim).toHaveBeenCalledTimes(1);
            expect(store.trim).toHaveBeenCalledWith('thumb', 100);
        } finally {
            jest.useRealTimers();
        }
    });

    describe('memory', () => {
        let clock: number;
        // Each image is 10 bytes; the budget holds two. The clock moves per load, so the order is clear.
        const small = () => setup({ memoryMaxBytes: 20, store: null, now: () => ++clock });
        const sweep = () => jest.advanceTimersByTimeAsync(1000);

        beforeEach(() => {
            clock = 0;
            jest.useFakeTimers();
        });
        afterEach(() => jest.useRealTimers());

        it('revokes the least recently used image no one draws once over budget', async () => {
            const { cache, deps } = small();
            await cache.load('a', 'thumb', 'u');
            await cache.load('b', 'thumb', 'u');
            await cache.load('c', 'thumb', 'u');
            // Not at the load: only once the sweep runs.
            expect(deps.revokeObjectURL).not.toHaveBeenCalled();

            await sweep();

            expect(deps.revokeObjectURL).toHaveBeenCalledWith('blob:1');
            expect(cache.peek('a')).toBeUndefined();
            expect(cache.peek('c')).toBe('blob:3');
        });

        // An <img> holding a revoked object URL would go blank under the user.
        it('never revokes an image that is drawn', async () => {
            const { cache, deps } = small();
            cache.retain('a');
            await cache.load('a', 'thumb', 'u');
            await cache.load('b', 'thumb', 'u');
            await cache.load('c', 'thumb', 'u');
            await sweep();

            expect(cache.peek('a')).toBe('blob:1');
            expect(deps.revokeObjectURL).toHaveBeenCalledWith('blob:2');

            // Let go, it is evictable like any other: two drawn images fill the budget on their own.
            cache.release('a');
            cache.retain('d');
            cache.retain('e');
            await cache.load('d', 'thumb', 'u');
            await cache.load('e', 'thumb', 'u');
            await sweep();
            expect(cache.peek('a')).toBeUndefined();
        });

        // A redraw with new addresses lets go of its images and takes them again in the same commit.
        it('keeps an image released and retained again before the sweep', async () => {
            const { cache, deps } = small();
            await cache.load('a', 'thumb', 'u');
            await cache.load('b', 'thumb', 'u');
            cache.retain('a');
            cache.retain('b');
            await cache.load('c', 'thumb', 'u');

            cache.release('a');
            cache.retain('a');
            await sweep();

            expect(cache.peek('a')).toBe('blob:1');
            expect(deps.revokeObjectURL).toHaveBeenCalledWith('blob:3');
            expect(deps.revokeObjectURL).not.toHaveBeenCalledWith('blob:1');
        });

        // Loaded first, drawn longest: its place in the order is when it was last drawn.
        it('orders by the last draw, not by the load', async () => {
            const { cache, deps } = small();
            await cache.load('a', 'thumb', 'u');
            await cache.load('b', 'thumb', 'u');
            cache.retain('a');
            cache.release('a');
            await cache.load('c', 'thumb', 'u');

            await sweep();

            expect(deps.revokeObjectURL).toHaveBeenCalledWith('blob:2');
            expect(cache.peek('a')).toBe('blob:1');
        });

        it('tells its subscribers when an image leaves memory', async () => {
            const { cache } = small();
            const listener = jest.fn();
            cache.subscribe(listener);
            await cache.load('a', 'thumb', 'u');
            await cache.load('b', 'thumb', 'u');
            await cache.load('c', 'thumb', 'u');

            await sweep();

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('forgets an invalidated entry everywhere, revoking it at the sweep', async () => {
            const { cache, deps } = setup({ now: () => ++clock });
            const listener = jest.fn();
            cache.subscribe(listener);
            await cache.load('k', 'thumb', 'u');

            cache.invalidate('k');

            expect(cache.peek('k')).toBeUndefined();
            expect(listener).toHaveBeenCalledTimes(1);
            expect(deps.store.delete).toHaveBeenCalledWith('k');
            expect(deps.revokeObjectURL).not.toHaveBeenCalled();
            await sweep();
            expect(deps.revokeObjectURL).toHaveBeenCalledWith('blob:1');

            await cache.load('k', 'thumb', 'u');
            expect(deps.fetch).toHaveBeenCalledTimes(2);
        });

        // The room and its thread draw the same image; one rejecting it must not unhold the other.
        it('keeps other holders counted through an invalidate', async () => {
            const { cache, deps } = small();
            cache.retain('k');
            cache.retain('k');
            await cache.load('k', 'thumb', 'u');

            cache.invalidate('k');
            cache.release('k');
            await cache.load('k', 'thumb', 'u');
            await cache.load('b', 'thumb', 'u');
            await cache.load('c', 'thumb', 'u');
            await sweep();

            expect(cache.peek('k')).toBe('blob:2');
            expect(deps.revokeObjectURL).not.toHaveBeenCalledWith('blob:2');
        });
    });
});
