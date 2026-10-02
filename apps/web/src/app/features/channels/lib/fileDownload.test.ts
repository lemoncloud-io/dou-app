import { downloadInBrowser, type BrowserDownloadDeps } from './fileDownload';

// jsdom has no `Response`; the download reads only these three members.
const respond = (status: number, body = 'bytes') =>
    ({ status, ok: status >= 200 && status < 300, blob: async () => new Blob([body]) }) as unknown as Response;

const deps = (fetchImpl: BrowserDownloadDeps['fetch']) => {
    const save = jest.fn<void, [Blob, string]>();
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
