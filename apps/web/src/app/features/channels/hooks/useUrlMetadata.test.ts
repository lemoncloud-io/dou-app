import { renderHook, waitFor } from '@testing-library/react';

import { isNative } from '@chatic/bridges';

import { appBridge } from '../../../bridge';
import { __resetUrlMetadataCache, requestUrlMetadata, useUrlMetadata } from './useUrlMetadata';

jest.mock('@chatic/bridges', () => ({
    isNative: jest.fn(),
}));

jest.mock('../../../bridge', () => ({
    appBridge: { fetchUrlMetadata: jest.fn() },
}));

const fetchUrlMetadata = appBridge.fetchUrlMetadata as jest.Mock;

const ok = (url: string, overrides: Record<string, unknown> = {}) => ({
    data: { success: true, url, title: 'Title', ...overrides },
});

describe('requestUrlMetadata', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        __resetUrlMetadataCache();
    });

    it('maps a successful response to the preview fields', async () => {
        fetchUrlMetadata.mockResolvedValue(
            ok('https://example.com/a', {
                description: 'D',
                imageUrl: 'https://cdn.example.com/a.png',
                siteName: 'Example',
            })
        );

        await expect(requestUrlMetadata('https://example.com/a')).resolves.toEqual({
            url: 'https://example.com/a',
            title: 'Title',
            description: 'D',
            imageUrl: 'https://cdn.example.com/a.png',
            siteName: 'Example',
        });
    });

    it('serves a repeat lookup from cache without asking the bridge again', async () => {
        fetchUrlMetadata.mockResolvedValue(ok('https://example.com/a'));

        await requestUrlMetadata('https://example.com/a');
        await requestUrlMetadata('https://example.com/a');

        expect(fetchUrlMetadata).toHaveBeenCalledTimes(1);
    });

    it('caches failures too, so scrolling never re-asks for a page with no preview', async () => {
        fetchUrlMetadata.mockResolvedValue({ data: { success: false, url: 'https://example.com/a' } });

        await expect(requestUrlMetadata('https://example.com/a')).resolves.toBeNull();
        await expect(requestUrlMetadata('https://example.com/a')).resolves.toBeNull();
        expect(fetchUrlMetadata).toHaveBeenCalledTimes(1);
    });

    it('treats a titleless response as no preview', async () => {
        fetchUrlMetadata.mockResolvedValue({ data: { success: true, url: 'https://example.com/a' } });

        await expect(requestUrlMetadata('https://example.com/a')).resolves.toBeNull();
    });

    it('treats a rejected request as no preview — this is the old-shell NOT_FOUND path', async () => {
        fetchUrlMetadata.mockRejectedValue(new Error('NOT_FOUND'));

        await expect(requestUrlMetadata('https://example.com/a')).resolves.toBeNull();
    });

    it('collapses concurrent lookups of the same URL into one request', async () => {
        fetchUrlMetadata.mockResolvedValue(ok('https://example.com/a'));

        const [first, second] = await Promise.all([
            requestUrlMetadata('https://example.com/a'),
            requestUrlMetadata('https://example.com/a'),
        ]);

        expect(fetchUrlMetadata).toHaveBeenCalledTimes(1);
        expect(first).toBe(second);
    });

    it('asks again for a different URL', async () => {
        fetchUrlMetadata.mockImplementation((url: string) => Promise.resolve(ok(url)));

        await requestUrlMetadata('https://example.com/a');
        await requestUrlMetadata('https://example.com/b');

        expect(fetchUrlMetadata).toHaveBeenCalledTimes(2);
    });

    it('evicts the oldest entry past the cap', async () => {
        fetchUrlMetadata.mockImplementation((url: string) => Promise.resolve(ok(url)));

        for (let i = 0; i < 500; i++) {
            await requestUrlMetadata(`https://example.com/${i}`);
        }
        expect(fetchUrlMetadata).toHaveBeenCalledTimes(500);

        // Fills the cap, pushing out /0.
        await requestUrlMetadata('https://example.com/500');
        // /499 is still cached...
        await requestUrlMetadata('https://example.com/499');
        expect(fetchUrlMetadata).toHaveBeenCalledTimes(501);
        // ...but /0 was evicted and has to be fetched again.
        await requestUrlMetadata('https://example.com/0');
        expect(fetchUrlMetadata).toHaveBeenCalledTimes(502);
    });
});

describe('useUrlMetadata', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        __resetUrlMetadataCache();
        (isNative as jest.Mock).mockReturnValue(true);
    });

    it('resolves the metadata inside the native shell', async () => {
        fetchUrlMetadata.mockResolvedValue(ok('https://example.com/a', { siteName: 'Example' }));

        const { result } = renderHook(() => useUrlMetadata('https://example.com/a'));

        expect(result.current).toBeNull();
        await waitFor(() => expect(result.current).toMatchObject({ title: 'Title', siteName: 'Example' }));
    });

    it('never asks in a plain browser — the shell is the only thing that can parse a page', async () => {
        (isNative as jest.Mock).mockReturnValue(false);

        const { result } = renderHook(() => useUrlMetadata('https://example.com/a'));

        expect(result.current).toBeNull();
        expect(fetchUrlMetadata).not.toHaveBeenCalled();
    });

    it('shows a cached preview on the first render, so a re-mounted row does not flash', async () => {
        fetchUrlMetadata.mockResolvedValue(ok('https://example.com/a'));
        await requestUrlMetadata('https://example.com/a');

        const { result } = renderHook(() => useUrlMetadata('https://example.com/a'));

        expect(result.current).toMatchObject({ title: 'Title' });
    });

    it('does not set state after unmounting', async () => {
        let resolve: (value: unknown) => void = () => undefined;
        fetchUrlMetadata.mockReturnValue(new Promise(r => (resolve = r)));

        const { unmount } = renderHook(() => useUrlMetadata('https://example.com/a'));
        unmount();
        resolve(ok('https://example.com/a'));

        // An update after unmount would surface as a console error from React.
        await waitFor(() => expect(fetchUrlMetadata).toHaveBeenCalled());
    });
});
