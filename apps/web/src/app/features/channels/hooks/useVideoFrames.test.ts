import { act, renderHook } from '@testing-library/react';

import { ImageCache } from '../lib/imageCache';
import type { FrameOutcome, VideoFrameRequest, VideoFrames } from '../lib/videoFrames';

import { setImageCacheForTest } from './useCachedImages';
import { setVideoFramesForTest, useVideoFrames } from './useVideoFrames';

jest.mock('@chatic/bridges', () => ({ isNative: () => true }));

const cache = new ImageCache({
    store: null,
    fetch: jest.fn(),
    createObjectURL: () => 'blob:kept',
    revokeObjectURL: jest.fn(),
});

const settled = new Map<string, Exclude<FrameOutcome, { kind: 'image' }>>();
const cancels: string[] = [];
let answer: (key: string, outcome: FrameOutcome) => void = () => undefined;
const frames = {
    settled: (request: VideoFrameRequest) => settled.get(request.key),
    request: jest.fn((request: VideoFrameRequest) => ({
        result: new Promise<FrameOutcome | null>(resolve => {
            answer = (key, outcome) => {
                if (key !== request.key) return;
                if (outcome.kind !== 'image') settled.set(key, outcome);
                resolve(outcome);
            };
        }),
        cancel: () => void cancels.push(request.key),
    })),
} as unknown as VideoFrames;

const v1 = { key: 'c/v1/frame', url: 'https://s3/v1' };

beforeAll(() => {
    setImageCacheForTest(cache);
    setVideoFramesForTest(frames);
});
afterAll(() => {
    setImageCacheForTest(null);
    setVideoFramesForTest(null);
});
beforeEach(() => {
    settled.clear();
    cancels.length = 0;
    (frames.request as jest.Mock).mockClear();
});

describe('useVideoFrames', () => {
    it('asks for nothing while the message is off screen', () => {
        const { result } = renderHook(() => useVideoFrames([v1, undefined], false));

        expect(frames.request).not.toHaveBeenCalled();
        expect(result.current).toEqual([{ status: 'pending' }, undefined]);
    });

    it('asks once the message is on screen and withdraws the request when it leaves', () => {
        const { rerender } = renderHook(({ visible }) => useVideoFrames([v1], visible), {
            initialProps: { visible: true },
        });
        expect(frames.request).toHaveBeenCalledWith(v1);

        rerender({ visible: false });
        expect(cancels).toEqual(['c/v1/frame']);
    });

    it('draws the element outcome with the video address, and asks no more for it', async () => {
        const { result, rerender } = renderHook(({ visible }) => useVideoFrames([v1], visible), {
            initialProps: { visible: true },
        });

        await act(async () => answer('c/v1/frame', { kind: 'element' }));
        expect(result.current).toEqual([{ status: 'element', url: 'https://s3/v1' }]);

        rerender({ visible: false });
        rerender({ visible: true });
        expect(frames.request).toHaveBeenCalledTimes(1);
    });

    it('draws a frame already in memory without asking', async () => {
        await cache.put('c/v1/frame', 'frame', new Blob(['jpeg'], { type: 'image/jpeg' }));

        const { result } = renderHook(() => useVideoFrames([v1], true));

        expect(result.current).toEqual([{ status: 'image', src: 'blob:kept' }]);
        expect(frames.request).not.toHaveBeenCalled();
        act(() => cache.invalidate('c/v1/frame'));
    });

    // Someone else's eviction is not a reason to send this row's queued requests to the back.
    it('keeps its requests when another entry leaves the cache', async () => {
        renderHook(() => useVideoFrames([v1], true));
        await cache.put('c/other/thumb', 'thumb', new Blob(['x'], { type: 'image/jpeg' }));

        act(() => cache.invalidate('c/other/thumb'));

        expect(frames.request).toHaveBeenCalledTimes(1);
        expect(cancels).toEqual([]);
    });
});
