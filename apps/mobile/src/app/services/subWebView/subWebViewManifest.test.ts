import {
    createSubWebViewManifestStore,
    DEFAULT_SUB_WEBVIEW_MANIFEST,
    fetchSubWebViewManifest,
    parseSubWebViewManifest,
    SUB_WEBVIEW_MANIFEST_LIMIT,
    type ManifestFetch,
} from './subWebViewManifest';

const ORIGIN = 'https://foo.apps.chatic.io';
const MANIFEST_URL = `${ORIGIN}/.well-known/chatic-app.json`;

const respond = (body: string, init: { ok?: boolean; status?: number; url?: string } = {}) =>
    jest.fn<ReturnType<ManifestFetch>, Parameters<ManifestFetch>>(async () => ({
        ok: init.ok ?? true,
        status: init.status ?? 200,
        url: init.url ?? MANIFEST_URL,
        text: async () => body,
    }));

const logger = () => ({ warn: jest.fn() });

describe('parseSubWebViewManifest', () => {
    it('reads every field it knows', () => {
        const manifest = parseSubWebViewManifest(
            JSON.stringify({
                manifestVersion: 1,
                name: ' DoU Quiz ',
                permissions: ['share', 'userKey'],
                display: 'fullscreen',
                orientation: 'landscape',
            })
        );

        expect(manifest).toEqual({
            name: 'DoU Quiz',
            permissions: new Set(['share', 'userKey']),
            display: 'fullscreen',
            orientation: 'landscape',
        });
    });

    it('drops an unknown permission and a wrong value, and keeps the rest', () => {
        const manifest = parseSubWebViewManifest(
            JSON.stringify({
                manifestVersion: 1,
                name: 'x'.repeat(101),
                permissions: ['share', 'camera', 3],
                display: 'immersive',
                orientation: 'sideways',
                extra: true,
            })
        );

        expect(manifest).toEqual({
            permissions: new Set(['share']),
            display: 'standard',
            orientation: 'any',
        });
    });

    it.each([
        ['not JSON', '{'],
        ['an array', '[]'],
        ['no version', JSON.stringify({ permissions: ['share'] })],
        ['a later version', JSON.stringify({ manifestVersion: 2, permissions: ['share'] })],
    ])('is no manifest at all when it is %s', (_label, text) => {
        expect(parseSubWebViewManifest(text)).toBeNull();
    });
});

describe('fetchSubWebViewManifest', () => {
    it("reads the manifest from the origin's well-known path", async () => {
        const fetch = respond(JSON.stringify({ manifestVersion: 1, permissions: ['clipboard'] }));

        const { manifest, transient } = await fetchSubWebViewManifest(ORIGIN, { fetch, logger: logger() });

        expect(fetch).toHaveBeenCalledWith(MANIFEST_URL, expect.objectContaining({ signal: expect.anything() }));
        expect(manifest.permissions).toEqual(new Set(['clipboard']));
        expect(transient).toBe(false);
    });

    // The origin's own answer is authoritative; a failure to reach it says nothing about the manifest.
    it.each([
        ['a missing file', respond('', { ok: false, status: 404 }), false],
        ['a redirect off the origin', respond('{"manifestVersion":1}', { url: 'https://evil.example/m.json' }), false],
        ['an oversized body', respond(' '.repeat(SUB_WEBVIEW_MANIFEST_LIMIT + 1)), false],
        ['a broken body', respond('nope'), false],
        [
            'a network failure',
            jest.fn(async () => {
                throw new Error('offline');
            }),
            true,
        ],
    ])('falls back to the default on %s, and says why', async (_label, fetch, transient) => {
        const log = logger();

        const outcome = await fetchSubWebViewManifest(ORIGIN, { fetch: fetch as ManifestFetch, logger: log });

        expect(outcome).toEqual({ manifest: DEFAULT_SUB_WEBVIEW_MANIFEST, transient });
        expect(log.warn).toHaveBeenCalledWith(
            'WEBVIEW',
            expect.stringContaining('manifest not used'),
            expect.anything()
        );
    });

    it('gives up after the timeout and opens with the default', async () => {
        jest.useFakeTimers();
        const log = logger();
        const fetch: ManifestFetch = (_url, init) =>
            new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('abort'))));

        const pending = fetchSubWebViewManifest(ORIGIN, { fetch, logger: log, timeoutMs: 3000 });
        jest.advanceTimersByTime(3000);

        await expect(pending).resolves.toEqual({ manifest: DEFAULT_SUB_WEBVIEW_MANIFEST, transient: true });
        expect(log.warn).toHaveBeenCalledWith('WEBVIEW', '[sub] manifest not used: timed out', expect.anything());
        jest.useRealTimers();
    });
});

describe('createSubWebViewManifestStore', () => {
    const body = (permissions: string[]) => JSON.stringify({ manifestVersion: 1, permissions });
    /** Lets a refresh started behind an answer settle. */
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));
    const serve = (text: string) => async () => ({ ok: true, status: 200, url: MANIFEST_URL, text: async () => text });
    const offline = async () => {
        throw new Error('offline');
    };

    it('waits for the first fetch, then answers from memory and refreshes behind it', async () => {
        const fetch = respond(body(['share']));
        const store = createSubWebViewManifestStore({ fetch, logger: logger() });

        const first = await store.get(ORIGIN);
        fetch.mockImplementation(async () => ({
            ok: true,
            status: 200,
            url: MANIFEST_URL,
            text: async () => body([]),
        }));
        const second = await store.get(ORIGIN);
        await settle();
        const third = await store.get(ORIGIN);

        expect(first.permissions).toEqual(new Set(['share']));
        // The second open used the first manifest; the refresh it started is what the third gets.
        expect(second.permissions).toEqual(new Set(['share']));
        expect(third.permissions).toEqual(new Set());
    });

    it('shares one fetch between opens that ask at once', async () => {
        const fetch = respond(body(['share']));
        const store = createSubWebViewManifestStore({ fetch, logger: logger() });

        await Promise.all([store.get(ORIGIN), store.get(ORIGIN)]);

        expect(fetch).toHaveBeenCalledTimes(1);
    });

    // Opened once offline, a page keeps what it was granted for the rest of the run.
    it('keeps the manifest it read when a later refresh cannot reach the origin', async () => {
        const fetch = respond(body(['share']));
        const store = createSubWebViewManifestStore({ fetch, logger: logger() });
        await store.get(ORIGIN);

        fetch.mockImplementation(offline);
        await store.get(ORIGIN);
        await settle();
        const later = await store.get(ORIGIN);

        expect(later.permissions).toEqual(new Set(['share']));
    });

    it('takes a withdrawn manifest as the answer, since the origin itself gave it', async () => {
        const fetch = respond(body(['share']));
        const store = createSubWebViewManifestStore({ fetch, logger: logger() });
        await store.get(ORIGIN);

        fetch.mockImplementation(async () => ({ ok: false, status: 404, url: MANIFEST_URL, text: async () => '' }));
        await store.get(ORIGIN);
        await settle();
        const later = await store.get(ORIGIN);

        expect(later).toBe(DEFAULT_SUB_WEBVIEW_MANIFEST);
    });

    it('opens with the default but tries again when the first fetch cannot reach the origin', async () => {
        const fetch = jest.fn<ReturnType<ManifestFetch>, Parameters<ManifestFetch>>(offline);
        const store = createSubWebViewManifestStore({ fetch, logger: logger() });

        const first = await store.get(ORIGIN);
        fetch.mockImplementation(serve(body(['share'])));
        const second = await store.get(ORIGIN);

        expect(first).toBe(DEFAULT_SUB_WEBVIEW_MANIFEST);
        expect(second.permissions).toEqual(new Set(['share']));
    });

    it('recovers from a fetch that rejects instead of answering', async () => {
        const store = createSubWebViewManifestStore({
            fetch: respond(body(['share'])),
            logger: {
                warn: () => {
                    throw new Error('logger broke');
                },
            },
        });
        const broken = createSubWebViewManifestStore({
            fetch: async () => {
                throw new Error('offline');
            },
            logger: {
                warn: () => {
                    throw new Error('logger broke');
                },
            },
        });

        await expect(broken.get(ORIGIN)).resolves.toBe(DEFAULT_SUB_WEBVIEW_MANIFEST);
        await expect(broken.get(ORIGIN)).resolves.toBe(DEFAULT_SUB_WEBVIEW_MANIFEST);
        await expect(store.get(ORIGIN)).resolves.toEqual(expect.objectContaining({ permissions: new Set(['share']) }));
    });
});
