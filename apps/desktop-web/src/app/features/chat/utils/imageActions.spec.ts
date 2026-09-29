import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadImage } from './imageActions';

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
});
