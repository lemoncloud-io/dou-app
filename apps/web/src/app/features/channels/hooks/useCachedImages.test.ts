import { act, renderHook, waitFor } from '@testing-library/react';

import { ImageCache } from '../lib/imageCache';
import { setImageCacheForTest, useCachedImages, type CachedImageRequest } from './useCachedImages';

const answer = (ok = true) =>
    ({
        ok,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => new ArrayBuffer(4),
    }) as unknown as Response;

let fetch: jest.Mock;
let revoke: jest.Mock;
beforeEach(() => {
    let next = 0;
    fetch = jest.fn(async () => answer());
    revoke = jest.fn();
    setImageCacheForTest(
        new ImageCache({
            store: null,
            fetch,
            createObjectURL: () => `blob:${++next}`,
            revokeObjectURL: revoke,
            // Every entry is idle-evictable at once, so a revoke shows up as soon as a key is let go.
            memoryMaxBytes: 0,
        })
    );
});
afterEach(() => setImageCacheForTest(null));

const request = (key: string, url = `https://s3/${key}?sig=1`): CachedImageRequest => ({ key, variant: 'thumb', url });

describe('useCachedImages', () => {
    it('is pending first, then draws the kept copy', async () => {
        const { result } = renderHook(() => useCachedImages([request('a')]));

        expect(result.current.images).toEqual([{ status: 'pending' }]);
        await waitFor(() => expect(result.current.images).toEqual([{ status: 'cached', src: 'blob:1' }]));
    });

    it('costs nothing for an undefined request', () => {
        const { result } = renderHook(() => useCachedImages([undefined]));

        expect(result.current.images).toEqual([undefined]);
        expect(fetch).not.toHaveBeenCalled();
    });

    // The re-read that used to re-download every image on screen.
    it('keeps drawing the same copy when the signed address changes, without a pending frame', async () => {
        const { result, rerender } = renderHook(({ url }) => useCachedImages([request('a', url)]), {
            initialProps: { url: 'https://s3/a?sig=1' },
        });
        await waitFor(() => expect(result.current.images[0]).toEqual({ status: 'cached', src: 'blob:1' }));

        rerender({ url: 'https://s3/a?sig=2' });

        expect(result.current.images[0]).toEqual({ status: 'cached', src: 'blob:1' });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('falls back to the signed address when the fetch cannot be made', async () => {
        fetch.mockResolvedValue(answer(false));
        const { result } = renderHook(() => useCachedImages([request('a')]));

        await waitFor(() => expect(result.current.images[0]).toEqual({ status: 'direct', src: 'https://s3/a?sig=1' }));
    });

    // After a fallback, the refreshed address is worth one more try.
    it('tries again for a new address after falling back', async () => {
        fetch.mockResolvedValueOnce(answer(false));
        const { result, rerender } = renderHook(({ url }) => useCachedImages([request('a', url)]), {
            initialProps: { url: 'https://s3/a?sig=old' },
        });
        await waitFor(() => expect(result.current.images[0]?.status).toBe('direct'));

        rerender({ url: 'https://s3/a?sig=new' });

        await waitFor(() => expect(result.current.images[0]).toEqual({ status: 'cached', src: 'blob:1' }));
    });

    it('rejects a cached copy to its signed address, and ignores anything else', async () => {
        const { result } = renderHook(() => useCachedImages([request('a'), undefined]));
        await waitFor(() => expect(result.current.images[0]?.status).toBe('cached'));

        let handled: boolean[] = [];
        act(() => {
            handled = [result.current.reject(0), result.current.reject(1)];
        });

        expect(handled).toEqual([true, false]);
        expect(result.current.images[0]).toEqual({ status: 'direct', src: 'https://s3/a?sig=1' });
        expect(result.current.reject(0)).toBe(false);
        // Not fetched again on the way: the rejected address is drawn directly.
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    describe('with memory under pressure', () => {
        // The budget is zero, so whatever nobody holds is revoked at the next sweep.
        const sweep = () =>
            act(async () => {
                await jest.advanceTimersByTimeAsync(1000);
            });
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        // A drawn copy must survive memory pressure; one let go may be revoked.
        it('holds what it draws and lets it go on unmount', async () => {
            const { result, unmount } = renderHook(() => useCachedImages([request('a')]));
            await waitFor(() => expect(result.current.images[0]?.status).toBe('cached'));
            await sweep();
            expect(revoke).not.toHaveBeenCalled();

            unmount();
            await sweep();

            expect(revoke).toHaveBeenCalledWith('blob:1');
        });

        // The re-read hands a new address: the old request goes and the new one comes in one commit.
        it('does not revoke or reload a drawn image when its address changes', async () => {
            const { result, rerender } = renderHook(({ url }) => useCachedImages([request('a', url)]), {
                initialProps: { url: 'https://s3/a?sig=1' },
            });
            await waitFor(() => expect(result.current.images[0]?.status).toBe('cached'));

            rerender({ url: 'https://s3/a?sig=2' });
            await sweep();

            expect(result.current.images[0]).toEqual({ status: 'cached', src: 'blob:1' });
            expect(revoke).not.toHaveBeenCalled();
            expect(fetch).toHaveBeenCalledTimes(1);
        });

        // The viewer steps away from an image and back: the copy it drew was revoked meanwhile.
        it('never hands back an object URL that was revoked while nobody drew it', async () => {
            const { result, rerender } = renderHook(({ on }) => useCachedImages([on ? request('a') : undefined]), {
                initialProps: { on: true },
            });
            await waitFor(() => expect(result.current.images[0]?.status).toBe('cached'));
            rerender({ on: false });
            await sweep();
            expect(revoke).toHaveBeenCalledWith('blob:1');

            rerender({ on: true });

            expect(result.current.images[0]).toEqual({ status: 'pending' });
            await waitFor(() => expect(result.current.images[0]).toEqual({ status: 'cached', src: 'blob:2' }));
        });

        // The room and its thread draw the same image; one dropping it sends the other to look again.
        it('looks an image up again when another holder drops it', async () => {
            const room = renderHook(() => useCachedImages([request('a')]));
            const thread = renderHook(() => useCachedImages([request('a')]));
            await waitFor(() => expect(thread.result.current.images[0]?.status).toBe('cached'));

            act(() => {
                room.result.current.reject(0);
            });

            await waitFor(() => expect(thread.result.current.images[0]).toEqual({ status: 'cached', src: 'blob:2' }));
            expect(room.result.current.images[0]?.status).toBe('direct');
        });
    });
});
