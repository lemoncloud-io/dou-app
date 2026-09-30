import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { copyImageToClipboard, downloadImage } from './imageActions';

/** Every anchor the page clicked, as it was at the click. */
const clicked: { href: string; download: string }[] = [];

beforeEach(() => {
    clicked.length = 0;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({ href: this.href, download: this.download });
    });
    URL.createObjectURL = vi.fn(() => 'blob:saved');
    URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('downloadImage', () => {
    it('saves a local image straight from its object URL', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);

        await downloadImage({ url: 'blob:local', name: 'a.png' });

        expect(fetch).not.toHaveBeenCalled();
        expect(clicked).toEqual([{ href: 'blob:local', download: 'a.png' }]);
    });

    it('fetches a remote image first, so the save does not navigate away, and names it by its type', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }))
        );

        await downloadImage({ url: 'https://storage.example/o?sig=1', name: 'image-1' });

        expect(clicked).toEqual([{ href: 'blob:saved', download: 'image-1.jpg' }]);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:saved');
    });

    it('rejects without clicking anything when the remote image cannot be fetched', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: false, blob: async () => new Blob() }))
        );

        await expect(downloadImage({ url: 'https://storage.example/o', name: 'image-1' })).rejects.toThrow();
        expect(clicked).toEqual([]);
    });

    it('fetches without the page cookies', async () => {
        const fetch = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/png' }) }));
        vi.stubGlobal('fetch', fetch);

        await downloadImage({ url: 'https://storage.example/o', name: 'image-1' });

        expect(fetch).toHaveBeenCalledWith('https://storage.example/o', expect.objectContaining({ credentials: 'omit' }));
    });

    it('fetches past the HTTP cache, where the tile or viewer left a copy the save cannot read', async () => {
        const fetch = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/png' }) }));
        vi.stubGlobal('fetch', fetch);

        await downloadImage({ url: 'https://storage.example/o', name: 'image-1' });

        expect(fetch).toHaveBeenCalledWith('https://storage.example/o', expect.objectContaining({ cache: 'no-store' }));
    });

    it('refuses an address an image cannot come from, fetching nothing', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);

        await expect(downloadImage({ url: 'http://internal.example/o', name: 'image-1' })).rejects.toThrow();
        await expect(downloadImage({ url: 'data:text/html,<b>x</b>', name: 'image-1' })).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
        expect(clicked).toEqual([]);
    });
});

describe('copyImageToClipboard', () => {
    it('rejects on an error answer instead of decoding the error page', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: false, blob: async () => new Blob(['<html>']) }))
        );

        await expect(copyImageToClipboard('https://storage.example/o')).rejects.toThrow('image fetch failed');
    });
});
