import type { BrowserSaveResult } from './browserSave';
import { downloadInBrowser, fetchInBrowser, type BrowserDownloadDeps } from './fileDownload';

// jsdom has no `Response`; the download reads only these three members.
const respond = (status: number, body = 'bytes') =>
    ({ status, ok: status >= 200 && status < 300, blob: async () => new Blob([body]) }) as unknown as Response;

const deps = (fetchImpl: BrowserDownloadDeps['fetch']) => {
    const save = jest.fn<Promise<BrowserSaveResult>, [Blob, string]>(async () => 'saved');
    return { save, deps: { fetch: fetchImpl, save } };
};

describe('downloadInBrowser', () => {
    it('saves the fetched bytes under the upload’s own name', async () => {
        const { save, deps: injected } = deps(async () => respond(200, '%PDF'));

        await expect(downloadInBrowser('https://s/1', '회의록 v1.2.pdf', { deps: injected })).resolves.toBe('saved');

        expect(save).toHaveBeenCalledTimes(1);
        const [blob, name] = save.mock.calls[0];
        expect(name).toBe('회의록 v1.2.pdf');
        expect(blob.size).toBe(4);
    });

    it('reports a 403 as an expired address and saves nothing', async () => {
        const { save, deps: injected } = deps(async () => respond(403));

        await expect(downloadInBrowser('https://s/1', 'a.pdf', { deps: injected })).resolves.toBe('expired');
        expect(save).not.toHaveBeenCalled();
    });

    it('reports any other status, or a network error, as failed', async () => {
        await expect(downloadInBrowser('u', 'a.pdf', { deps: deps(async () => respond(500)).deps })).resolves.toBe(
            'failed'
        );
        await expect(
            downloadInBrowser('u', 'a.pdf', {
                deps: deps(async () => {
                    throw new TypeError('offline');
                }).deps,
            })
        ).resolves.toBe('failed');
    });

    it('reports a download stopped by its caller as cancelled', async () => {
        const controller = new AbortController();
        const { deps: injected } = deps(async () => {
            controller.abort();
            throw new DOMException('aborted', 'AbortError');
        });

        await expect(downloadInBrowser('u', 'a.pdf', { signal: controller.signal, deps: injected })).resolves.toBe(
            'cancelled'
        );
    });
});

/** A response whose body arrives in `chunks`, with a length header when `length` is given. */
const streamed = (chunks: string[], length?: number) => {
    const encoded = chunks.map(chunk => new TextEncoder().encode(chunk));
    let at = 0;
    return {
        status: 200,
        ok: true,
        headers: { get: (name: string) => (name === 'content-length' && length ? String(length) : null) },
        body: {
            getReader: () => ({
                read: async () =>
                    at < encoded.length ? { done: false, value: encoded[at++] } : { done: true, value: undefined },
            }),
        },
        blob: async () => new Blob(chunks),
    } as unknown as Response;
};

describe('downloadInBrowser — the iOS share sheet', () => {
    it('hands back the bytes when the sheet wants a fresh press, and saves held bytes without fetching', async () => {
        const fetchSpy = jest.fn(async () => respond(200, '%PDF'));
        const save = jest
            .fn<Promise<BrowserSaveResult>, [Blob, string]>()
            .mockResolvedValueOnce('needs-gesture')
            .mockResolvedValueOnce('saved');
        const onHeld = jest.fn();

        await expect(downloadInBrowser('u', 'a.pdf', { onHeld, deps: { fetch: fetchSpy, save } })).resolves.toBe(
            'needs-gesture'
        );
        const [held] = onHeld.mock.calls[0] as [Blob];
        expect(held.size).toBe(4);

        await expect(downloadInBrowser('u', 'a.pdf', { held, deps: { fetch: fetchSpy, save } })).resolves.toBe('saved');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenLastCalledWith(held, 'a.pdf');
    });

    it('passes on a closed sheet as dismissed', async () => {
        const save = jest.fn<Promise<BrowserSaveResult>, [Blob, string]>(async () => 'dismissed');

        await expect(
            downloadInBrowser('u', 'a.pdf', { deps: { fetch: async () => respond(200), save } })
        ).resolves.toBe('dismissed');
    });
});

describe('fetchInBrowser', () => {
    afterEach(() => {
        delete (globalThis as { fetch?: unknown }).fetch;
    });

    it('always goes to the network, so a copy an image left in the HTTP cache is never used', async () => {
        const fetchSpy = jest.fn(async () => respond(200));
        (globalThis as { fetch?: unknown }).fetch = fetchSpy;

        await fetchInBrowser('https://s/1');

        expect(fetchSpy).toHaveBeenCalledWith(
            'https://s/1',
            expect.objectContaining({ cache: 'no-store', mode: 'cors', credentials: 'omit' })
        );
    });

    it('reports how far the body has got when its length is known', async () => {
        const progress: number[] = [];
        const result = await fetchInBrowser('u', {
            onProgress: fraction => progress.push(fraction),
            deps: { fetch: async () => streamed(['ab', 'cd'], 4) },
        });

        expect(result.kind).toBe('blob');
        expect(result.kind === 'blob' && result.blob.size).toBe(4);
        expect(progress).toEqual([0.5, 1]);
    });

    it('reports once per whole percent, however many chunks arrive', async () => {
        const progress: number[] = [];
        // 1,000 one-byte chunks: a thousand reads, and the whole percents 0 through 100.
        await fetchInBrowser('u', {
            onProgress: fraction => progress.push(fraction),
            deps: {
                fetch: async () =>
                    streamed(
                        Array.from({ length: 1000 }, () => 'x'),
                        1000
                    ),
            },
        });

        expect(progress).toHaveLength(101);
        expect(progress[progress.length - 1]).toBe(1);
    });

    it('reads the body whole without a length to measure against', async () => {
        const progress: number[] = [];
        const result = await fetchInBrowser('u', {
            onProgress: fraction => progress.push(fraction),
            deps: { fetch: async () => streamed(['abcd']) },
        });

        expect(result.kind === 'blob' && result.blob.size).toBe(4);
        expect(progress).toEqual([]);
    });

    it('reports a 403 as expired', async () => {
        await expect(fetchInBrowser('u', { deps: { fetch: async () => respond(403) } })).resolves.toEqual({
            kind: 'expired',
        });
    });
});
