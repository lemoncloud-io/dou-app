import {
    ImageCache,
    imageCacheKey,
    type ImageCacheDeps,
    type ImageCacheRecord,
    type ImageCacheStore,
    type ImageLoadReport,
    type ImageVariant,
} from './imageCache';

const answer = (
    bytes: number,
    { ok = true, type = 'image/jpeg', status = ok ? 200 : 403 }: { ok?: boolean; type?: string; status?: number } = {}
) =>
    ({
        ok,
        status,
        headers: { get: (name: string) => (name === 'content-type' ? type : null) },
        arrayBuffer: async () => new ArrayBuffer(bytes),
    }) as unknown as Response;

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
    const defaultFetch = jest.fn(async (_url: string, _signal: AbortSignal) => answer(10));
    const deps = {
        store,
        fetch: defaultFetch,
        createObjectURL: jest.fn(() => `blob:${++next}`),
        revokeObjectURL: jest.fn(),
        now: () => 1_000_000,
        ...overrides,
    } satisfies ImageCacheDeps;
    return { cache: new ImageCache(deps), deps, store, records, defaultFetch };
};

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

    it('keeps fetching after an address is refused', async () => {
        const fetch = jest.fn().mockResolvedValueOnce(answer(10, { ok: false }));
        fetch.mockResolvedValue(answer(10));
        const { cache } = setup({ fetch });

        expect(await cache.load('a', 'thumb', 'u')).toBeNull();
        expect(await cache.load('b', 'thumb', 'u')).toBe('blob:1');
    });

    it('tries its own address when the load it joined answers null', async () => {
        const fetch = jest.fn(async (url: string) => (url === 'old' ? answer(10, { ok: false }) : answer(10)));
        const { cache } = setup({ fetch });

        const [stale, fresh] = await Promise.all([cache.load('k', 'thumb', 'old'), cache.load('k', 'thumb', 'new')]);

        expect(stale).toBeNull();
        expect(fresh).toBe('blob:1');
    });

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
            const { cache, store } = setup({ budgets: { thumb: 100, org: 1000, frame: 1000 } });
            await cache.load('a', 'thumb', 'u');
            await cache.load('b', 'thumb', 'u');
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
            expect(deps.revokeObjectURL).not.toHaveBeenCalled();

            await sweep();

            expect(deps.revokeObjectURL).toHaveBeenCalledWith('blob:1');
            expect(cache.peek('a')).toBeUndefined();
            expect(cache.peek('c')).toBe('blob:3');
        });

        it('never revokes an image that is drawn', async () => {
            const { cache, deps } = small();
            cache.retain('a');
            await cache.load('a', 'thumb', 'u');
            await cache.load('b', 'thumb', 'u');
            await cache.load('c', 'thumb', 'u');
            await sweep();

            expect(cache.peek('a')).toBe('blob:1');
            expect(deps.revokeObjectURL).toHaveBeenCalledWith('blob:2');

            cache.release('a');
            cache.retain('d');
            cache.retain('e');
            await cache.load('d', 'thumb', 'u');
            await cache.load('e', 'thumb', 'u');
            await sweep();
            expect(cache.peek('a')).toBeUndefined();
        });

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
            const { cache, deps, store } = setup({ now: () => ++clock });
            const listener = jest.fn();
            cache.subscribe(listener);
            await cache.load('k', 'thumb', 'u');

            cache.invalidate('k');

            expect(cache.peek('k')).toBeUndefined();
            expect(listener).toHaveBeenCalledTimes(1);
            expect(store.delete).toHaveBeenCalledWith('k');
            expect(deps.revokeObjectURL).not.toHaveBeenCalled();
            await sweep();
            expect(deps.revokeObjectURL).toHaveBeenCalledWith('blob:1');

            await cache.load('k', 'thumb', 'u');
            expect(deps.fetch).toHaveBeenCalledTimes(2);
        });

        describe('a download nobody draws', () => {
            const hanging = () =>
                jest.fn(
                    (_url: string, signal: AbortSignal) =>
                        new Promise<Response>((_, reject) =>
                            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
                        )
                );

            it('is cancelled at the sweep once its last holder lets go', async () => {
                const fetch = hanging();
                const { cache } = setup({ store: null, fetch });
                cache.retain('k');
                const loading = cache.load('k', 'org', 'u');
                await jest.advanceTimersByTimeAsync(0);
                const signal = fetch.mock.calls[0][1];

                cache.release('k');
                expect(signal.aborted).toBe(false);
                await sweep();

                expect(signal.aborted).toBe(true);
                expect(await loading).toBeNull();
            });

            it('keeps running when taken again before the sweep', async () => {
                const fetch = hanging();
                const { cache } = setup({ store: null, fetch });
                cache.retain('k');
                void cache.load('k', 'org', 'u');
                await jest.advanceTimersByTimeAsync(0);

                cache.release('k');
                cache.retain('k');
                await sweep();

                expect(fetch.mock.calls[0][1].aborted).toBe(false);
            });

            it('keeps running while another holder draws it', async () => {
                const fetch = hanging();
                const { cache } = setup({ store: null, fetch });
                cache.retain('k');
                cache.retain('k');
                void cache.load('k', 'org', 'u');
                await jest.advanceTimersByTimeAsync(0);

                cache.release('k');
                await sweep();

                expect(fetch.mock.calls[0][1].aborted).toBe(false);
            });

            it('does not retry a cancelled download for the address that joined it', async () => {
                const fetch = hanging();
                const { cache } = setup({ store: null, fetch });
                cache.retain('k');
                const first = cache.load('k', 'org', 'old');
                const joined = cache.load('k', 'org', 'new');
                await jest.advanceTimersByTimeAsync(0);

                cache.release('k');
                await sweep();

                expect(await first).toBeNull();
                expect(await joined).toBeNull();
                expect(fetch).toHaveBeenCalledTimes(1);
            });

            it('starts a fresh download for a load that arrives after the cancel', async () => {
                const fetch = hanging();
                const { cache } = setup({ store: null, fetch });
                cache.retain('k');
                const cancelled = cache.load('k', 'org', 'u');
                await jest.advanceTimersByTimeAsync(0);
                cache.release('k');
                await sweep();

                fetch.mockResolvedValueOnce(answer(10));
                cache.retain('k');
                const fresh = cache.load('k', 'org', 'u');

                expect(await cancelled).toBeNull();
                expect(await fresh).toBe('blob:1');
                expect(fetch).toHaveBeenCalledTimes(2);
            });

            it('does not stop the next loads from fetching', async () => {
                const fetch = hanging();
                const { cache } = setup({ store: null, fetch, now: () => 0 });
                cache.retain('a');
                const cancelled = cache.load('a', 'org', 'u');
                await jest.advanceTimersByTimeAsync(0);
                cache.release('a');
                await sweep();
                await cancelled;

                fetch.mockResolvedValueOnce(answer(10));
                expect(await cache.load('b', 'org', 'u')).toBe('blob:1');
            });
        });

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

describe('ImageCache — frames made on this device', () => {
    const jpeg = (size = 12) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' });

    it('keeps a put frame in memory and in the store under its own variant', async () => {
        const { cache, records, store } = setup();
        const key = imageCacheKey('c', 'u1', 'frame');

        const src = await cache.put(key, 'frame', jpeg());
        await flush();

        expect(cache.peek(key)).toBe(src);
        expect(records.get(key)).toMatchObject({ key, variant: 'frame', type: 'image/jpeg', size: 12 });
        expect(store.put).toHaveBeenCalledTimes(1);
    });

    it('trims frames against their own budget', async () => {
        jest.useFakeTimers();
        try {
            const { cache, store } = setup({ budgets: { thumb: 1, org: 2, frame: 3 } });
            await cache.put(imageCacheKey('c', 'u1', 'frame'), 'frame', jpeg());
            await jest.advanceTimersByTimeAsync(5_000);

            expect(store.trim).toHaveBeenCalledWith('frame', 3);
        } finally {
            jest.useRealTimers();
        }
    });

    it('keeps the copy already in memory rather than replacing one an image may be drawing', async () => {
        const { cache, deps } = setup();
        const key = imageCacheKey('c', 'u1', 'frame');

        const first = await cache.put(key, 'frame', jpeg());
        const second = await cache.put(key, 'frame', jpeg(20));

        expect(second).toBe(first);
        expect(deps.createObjectURL).toHaveBeenCalledTimes(1);
    });

    it('finds a frame from an earlier launch in the store without any fetch', async () => {
        const { cache, deps, records } = setup();
        const key = imageCacheKey('c', 'u1', 'frame');
        records.set(key, {
            key,
            variant: 'frame',
            type: 'image/jpeg',
            bytes: new ArrayBuffer(8),
            size: 8,
            usedAt: 1_000_000,
        });

        const src = await cache.lookup(key);

        expect(src).toMatch(/^blob:/);
        expect(cache.peek(key)).toBe(src);
        expect(deps.fetch).not.toHaveBeenCalled();
    });

    it('answers null for a frame nobody made yet, without any fetch', async () => {
        const { cache, deps } = setup();

        await expect(cache.lookup(imageCacheKey('c', 'u1', 'frame'))).resolves.toBeNull();
        expect(deps.fetch).not.toHaveBeenCalled();
    });

    it('answers a frame already in memory without reading the store', async () => {
        const { cache, store } = setup();
        const key = imageCacheKey('c', 'u1', 'frame');
        const src = await cache.put(key, 'frame', jpeg());
        store.get.mockClear();

        await expect(cache.lookup(key)).resolves.toBe(src);
        expect(store.get).not.toHaveBeenCalled();
    });
});

describe('ImageCache — load reports', () => {
    const observed = (overrides: Partial<ImageCacheDeps> = {}) => {
        let elapsed = 0;
        const reports: ImageLoadReport[] = [];
        const result = setup({
            observe: () => report => reports.push(report),
            elapsed: () => elapsed,
            ...overrides,
        });
        return { ...result, reports, tick: (ms: number) => (elapsed += ms) };
    };

    it('reports a download it kept: the store missed, then the bucket answered', async () => {
        const { cache, defaultFetch, store, reports, tick } = observed();
        store.get.mockImplementation(async () => {
            tick(5);
            return undefined;
        });
        defaultFetch.mockImplementation(async () => {
            tick(120);
            return answer(4096);
        });

        await cache.load('k', 'thumb', 'u');

        expect(reports).toEqual([
            { variant: 'thumb', source: 'network', store: 'miss', storeMs: 5, fetchMs: 120, totalMs: 125, bytes: 4096 },
        ]);
    });

    it('reports a store hit with what the read cost, and nothing fetched', async () => {
        const { cache: before, records } = setup();
        await before.load('k', 'org', 'u');
        await flush();
        const { cache, store, reports, tick } = observed();
        store.get.mockImplementation(async () => {
            tick(30);
            return records.get('k');
        });

        await cache.load('k', 'org', 'u');

        expect(reports).toEqual([{ variant: 'org', source: 'store', store: 'hit', storeMs: 30, totalMs: 30 }]);
    });

    it('reports a joined load that retries with its own address after the running one answered nothing', async () => {
        const fetch = jest.fn(async (url: string) => (url === 'old' ? answer(10, { ok: false }) : answer(10)));
        const { cache, reports } = observed({ fetch });

        await Promise.all([cache.load('k', 'thumb', 'old'), cache.load('k', 'thumb', 'new')]);

        expect(reports.map(report => report.fallback ?? report.source)).toEqual(['expired', 'network']);
    });

    it('reports nothing for a memory hit or a load joined onto one already running', async () => {
        const { cache, reports } = observed();

        await Promise.all([cache.load('k', 'thumb', 'u1'), cache.load('k', 'thumb', 'u2')]);
        await cache.load('k', 'thumb', 'u3');

        expect(reports).toHaveLength(1);
    });

    it.each([
        ['a 403 as expired', answer(10, { ok: false, status: 403 }), 'expired'],
        ['another error status as http', answer(10, { ok: false, status: 500 }), 'http'],
        ['a body of another type as not_image', answer(10, { type: 'application/xml' }), 'not_image'],
    ] as const)('reports %s, with the address drawn instead', async (_, response, fallback) => {
        const { cache, reports } = observed({ fetch: jest.fn(async () => response) });

        await cache.load('k', 'thumb', 'u');

        expect(reports).toEqual([expect.objectContaining({ source: 'address', fallback, store: 'miss' })]);
        expect(reports[0]).not.toHaveProperty('bytes');
    });

    it('reports a fetch with no answer, then the loads its backoff skips', async () => {
        const fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        const { cache, reports } = observed({ fetch });

        await cache.load('a', 'thumb', 'u');
        await cache.load('b', 'thumb', 'u');

        expect(reports.map(report => report.fallback)).toEqual(['no_answer', 'backoff']);
        expect(reports[1]).not.toHaveProperty('fetchMs');
    });

    it('reports a body that broke off as no_answer, without starting the backoff', async () => {
        const broken = { ...answer(10), arrayBuffer: async () => Promise.reject(new TypeError('network')) };
        const fetch = jest.fn().mockResolvedValueOnce(broken as unknown as Response);
        fetch.mockResolvedValue(answer(10));
        const { cache, reports } = observed({ fetch });

        expect(await cache.load('a', 'thumb', 'u')).toBeNull();
        expect(await cache.load('b', 'thumb', 'u')).toBe('blob:1');

        expect(reports.map(report => report.fallback ?? report.source)).toEqual(['no_answer', 'network']);
    });

    it.each([
        [
            'a store that failed',
            (store: jest.Mocked<ImageCacheStore>) => store.get.mockRejectedValue(new Error('x')),
            'error',
        ],
        ['no store at all', null, 'none'],
    ] as const)('names %s in the report', async (_, arrange, outcome) => {
        const { store } = memoryStore();
        if (arrange) arrange(store);
        const { cache, reports } = observed({ store: arrange ? store : null });

        await cache.load('k', 'thumb', 'u');

        expect(reports[0]?.store).toBe(outcome);
    });

    it('reports a store read that timed out apart from a miss', async () => {
        jest.useFakeTimers();
        try {
            const { cache, store, reports } = observed();
            store.get.mockReturnValue(new Promise(() => undefined));

            const loading = cache.load('k', 'thumb', 'u');
            await jest.advanceTimersByTimeAsync(1000);
            await loading;

            expect(reports).toEqual([expect.objectContaining({ store: 'timeout', source: 'network' })]);
        } finally {
            jest.useRealTimers();
        }
    });

    it('reports nothing for a download that was cancelled', async () => {
        jest.useFakeTimers();
        try {
            const fetch = jest.fn(
                (_url: string, signal: AbortSignal) =>
                    new Promise<Response>((_, reject) =>
                        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
                    )
            );
            const { cache, reports } = observed({ store: null, fetch });
            cache.retain('k');
            const loading = cache.load('k', 'org', 'u');
            await jest.advanceTimersByTimeAsync(0);

            cache.release('k');
            await jest.advanceTimersByTimeAsync(1000);

            expect(await loading).toBeNull();
            expect(reports).toEqual([]);
        } finally {
            jest.useRealTimers();
        }
    });

    it.each([
        [
            'at the begin',
            () => {
                throw new Error('measurement broke');
            },
        ],
        [
            'at the end',
            () => () => {
                throw new Error('measurement broke');
            },
        ],
    ])('loads as usual when the observer throws %s', async (_, observe) => {
        const { cache } = observed({ observe });

        expect(await cache.load('k', 'thumb', 'u')).toBe('blob:1');
    });

    it('begins a report when the load starts, before the store answers', async () => {
        const order: string[] = [];
        const { cache, store } = observed({
            observe: () => {
                order.push('begin');
                return () => order.push('end');
            },
        });
        store.get.mockImplementation(async () => {
            order.push('store');
            return undefined;
        });

        await cache.load('k', 'thumb', 'u');

        expect(order).toEqual(['begin', 'store', 'end']);
    });
});
