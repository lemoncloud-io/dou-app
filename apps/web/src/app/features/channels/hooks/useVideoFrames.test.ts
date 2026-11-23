import { act, renderHook } from '@testing-library/react';

import { ImageCache } from '../lib/imageCache';
import type { FrameOutcome, VideoFrameRequest, VideoFrames } from '../lib/videoFrames';

import { setImageCacheForTest } from './useCachedImages';
import { getVideoFrames, setVideoFramesForTest, useVideoFrames } from './useVideoFrames';

const readVideoFrame = jest.fn();
let appMovesFiles = true;
jest.mock('@chatic/runtime', () => {
    const testing = require('@chatic/runtime/testing');
    return testing.fakeRuntimeModule({
        get files() {
            const files = testing.browserFiles();
            return appMovesFiles ? { ...files, kind: 'shell', transfers: { readVideoFrame } } : files;
        },
    });
});

const madeWith: Array<{ fromApp: () => boolean; readShellFrame: (url: string) => Promise<Blob> }> = [];
jest.mock('../lib/videoFrames', () => ({
    VideoFrames: class {
        constructor(deps: (typeof madeWith)[number]) {
            madeWith.push(deps);
        }
    },
}));

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

    it('keeps its requests when another entry leaves the cache', async () => {
        renderHook(() => useVideoFrames([v1], true));
        await cache.put('c/other/thumb', 'thumb', new Blob(['x'], { type: 'image/jpeg' }));

        act(() => cache.invalidate('c/other/thumb'));

        expect(frames.request).toHaveBeenCalledTimes(1);
        expect(cancels).toEqual([]);
    });
});

describe('getVideoFrames — the frame maker the page hands the host', () => {
    beforeEach(() => {
        madeWith.length = 0;
        readVideoFrame.mockReset();
        setVideoFramesForTest(null);
    });
    afterEach(() => {
        appMovesFiles = true;
        setVideoFramesForTest(frames);
    });

    it("reads a frame through the app's transfer module, as the poster rule asks", async () => {
        readVideoFrame.mockResolvedValue({ base64: btoa('jpg'), contentType: 'image/jpeg', width: 4, height: 3 });
        getVideoFrames();
        const [deps] = madeWith;

        expect(deps.fromApp()).toBe(true);
        const frame = await deps.readShellFrame('https://s3/v1');

        expect(readVideoFrame).toHaveBeenCalledWith({ url: 'https://s3/v1', atMs: 500, maxEdge: 400 });
        expect(frame.type).toBe('image/jpeg');
        expect(frame.size).toBe(3);
    });

    it('leaves the frame to the page where the host has no transfer module, asked at call time', async () => {
        getVideoFrames();
        const [deps] = madeWith;
        appMovesFiles = false;

        expect(deps.fromApp()).toBe(false);
        await expect(deps.readShellFrame('https://s3/v1')).rejects.toThrow();
        expect(readVideoFrame).not.toHaveBeenCalled();
    });
});
