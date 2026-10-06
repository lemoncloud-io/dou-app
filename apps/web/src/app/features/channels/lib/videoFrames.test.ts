import { FRAME_RANGE, VideoFrames, type VideoFramesDeps } from './videoFrames';

const jpeg = () => new Blob(['jpeg'], { type: 'image/jpeg' });
const notFound = () => Object.assign(new Error('no handler'), { code: 'NOT_FOUND' });

const setup = (over: Partial<VideoFramesDeps> = {}) => {
    const kept = new Map<string, string>();
    let next = 0;
    const deps = {
        cache: {
            lookup: jest.fn(async (key: string) => kept.get(key) ?? null),
            put: jest.fn(async (key: string) => {
                const src = `blob:${++next}`;
                kept.set(key, src);
                return src;
            }),
        },
        isNative: jest.fn(() => true),
        isAppleTouch: jest.fn(() => false),
        readShellFrame: jest.fn(async () => jpeg()),
        fetch: jest.fn(
            async () => ({ ok: true, status: 206, blob: async () => new Blob(['mp4']) }) as unknown as Response
        ),
        drawFrame: jest.fn(async () => ({ blob: jpeg(), width: 400, height: 225 })),
        ...over,
    } satisfies VideoFramesDeps;
    return { frames: new VideoFrames(deps), deps, kept };
};

const video = (n = 1) => ({ key: `c/u${n}/frame`, url: `https://bucket.example/v${n}.mp4?sig=a` });

describe('VideoFrames — order', () => {
    it('draws a frame kept earlier without reading the video', async () => {
        const { frames, deps, kept } = setup();
        kept.set('c/u1/frame', 'blob:kept');

        await expect(frames.request(video()).result).resolves.toEqual({ kind: 'image', src: 'blob:kept' });
        expect(deps.readShellFrame).not.toHaveBeenCalled();
        expect(deps.fetch).not.toHaveBeenCalled();
    });

    it('makes a missing frame and keeps it under the frame variant', async () => {
        const { frames, deps } = setup();

        await expect(frames.request(video()).result).resolves.toEqual({ kind: 'image', src: 'blob:1' });
        expect(deps.cache.put).toHaveBeenCalledWith('c/u1/frame', 'frame', expect.any(Blob));
    });
});

describe('VideoFrames — in the app', () => {
    it('asks the shell for the frame from the video address', async () => {
        const { frames, deps } = setup();

        await frames.request(video()).result;

        expect(deps.readShellFrame).toHaveBeenCalledWith('https://bucket.example/v1.mp4?sig=a');
        expect(deps.fetch).not.toHaveBeenCalled();
    });

    it('leaves the panel grey when the shell cannot read this video, and does not ask again for it', async () => {
        const { frames, deps } = setup({
            readShellFrame: jest.fn(async () =>
                Promise.reject(Object.assign(new Error('403'), { code: 'UNREADABLE' }))
            ),
        });

        await expect(frames.request(video()).result).resolves.toEqual({ kind: 'none' });
        await expect(frames.request(video()).result).resolves.toEqual({ kind: 'none' });
        expect(frames.settled(video())).toEqual({ kind: 'none' });
        expect(deps.readShellFrame).toHaveBeenCalledTimes(1);
    });

    it('tries a refreshed address of the same video again', async () => {
        const { frames, deps } = setup({
            readShellFrame: jest
                .fn()
                .mockRejectedValueOnce(Object.assign(new Error('403'), { code: 'UNREADABLE' }))
                .mockResolvedValueOnce(jpeg()),
        });

        await frames.request(video()).result;
        const fresh = { ...video(), url: 'https://bucket.example/v1.mp4?sig=b' };

        await expect(frames.request(fresh).result).resolves.toMatchObject({ kind: 'image' });
        expect(deps.readShellFrame).toHaveBeenCalledTimes(2);
    });

    it('lets an older Android app draw the frame in the tile once it says it has no ReadVideoFrame', async () => {
        const { frames, deps } = setup({ readShellFrame: jest.fn(async () => Promise.reject(notFound())) });

        await expect(frames.request(video(1)).result).resolves.toEqual({ kind: 'element' });
        await expect(frames.request(video(2)).result).resolves.toEqual({ kind: 'element' });
        // Learned once for the page.
        expect(deps.readShellFrame).toHaveBeenCalledTimes(1);
    });

    // Its WebView loads no media before a tap, so a video element would stay as grey as the panel.
    it('leaves an older iOS app grey', async () => {
        const { frames } = setup({
            readShellFrame: jest.fn(async () => Promise.reject(notFound())),
            isAppleTouch: jest.fn(() => true),
        });

        await expect(frames.request(video()).result).resolves.toEqual({ kind: 'none' });
    });
});

describe('VideoFrames — in a browser', () => {
    const browser = (over: Partial<VideoFramesDeps> = {}) => setup({ isNative: jest.fn(() => false), ...over });

    it('draws the frame from the first 2 MiB, fetched with CORS and never from the HTTP cache', async () => {
        const { frames, deps } = browser();

        await expect(frames.request(video()).result).resolves.toMatchObject({ kind: 'image' });
        expect(deps.fetch).toHaveBeenCalledWith('https://bucket.example/v1.mp4?sig=a', {
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store',
            headers: { Range: FRAME_RANGE },
        });
        expect(FRAME_RANGE).toBe('bytes=0-2097151');
        expect(deps.readShellFrame).not.toHaveBeenCalled();
    });

    it('falls back to the tile’s own video when the first bytes do not draw', async () => {
        const { frames } = browser({ drawFrame: jest.fn(async () => null) });

        await expect(frames.request(video()).result).resolves.toEqual({ kind: 'element' });
    });

    it('remembers a video that does not draw from its first bytes by upload, across new addresses', async () => {
        const { frames, deps } = browser({ drawFrame: jest.fn(async () => null) });

        await frames.request(video()).result;
        const fresh = { ...video(), url: 'https://bucket.example/v1.mp4?sig=b' };

        await expect(frames.request(fresh).result).resolves.toEqual({ kind: 'element' });
        expect(frames.settled(fresh)).toEqual({ kind: 'element' });
        expect(deps.fetch).toHaveBeenCalledTimes(1);
    });

    // A server that ignores the range sends the whole video; reading it would be the download this avoids.
    it('reads no body from an answer that is not a partial one', async () => {
        const blob = jest.fn();
        const cancel = jest.fn(async () => undefined);
        const { frames, deps } = browser({
            fetch: jest.fn(async () => ({ ok: true, status: 200, blob, body: { cancel } }) as unknown as Response),
        });

        await expect(frames.request(video()).result).resolves.toEqual({ kind: 'element' });
        expect(blob).not.toHaveBeenCalled();
        expect(cancel).toHaveBeenCalled();
        expect(deps.drawFrame).not.toHaveBeenCalled();
    });

    it('fetches again for a refreshed address after the old one was refused', async () => {
        const { frames, deps } = browser({
            fetch: jest
                .fn()
                .mockResolvedValueOnce({ ok: false, status: 403 })
                .mockResolvedValueOnce({ ok: true, status: 206, blob: async () => new Blob(['mp4']) }),
        });

        await frames.request(video()).result;
        const fresh = { ...video(), url: 'https://bucket.example/v1.mp4?sig=b' };

        await expect(frames.request(fresh).result).resolves.toMatchObject({ kind: 'image' });
        expect(deps.fetch).toHaveBeenCalledTimes(2);
    });

    it('falls back to the tile’s own video when the bucket refuses the read', async () => {
        const { frames } = browser({
            fetch: jest.fn(async () => ({ ok: false, status: 403 }) as unknown as Response),
        });

        await expect(frames.request(video()).result).resolves.toEqual({ kind: 'element' });
    });

    it('learns a bucket without CORS from the first fetch and stops fetching for the session', async () => {
        const { frames, deps } = browser({
            fetch: jest.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
        });

        await expect(frames.request(video(1)).result).resolves.toEqual({ kind: 'element' });
        await expect(frames.request(video(2)).result).resolves.toEqual({ kind: 'element' });
        expect(deps.fetch).toHaveBeenCalledTimes(1);
    });
});

describe('VideoFrames — queue', () => {
    const gate = () => {
        const waiting: (() => void)[] = [];
        const readShellFrame = jest.fn(
            () =>
                new Promise<Blob>(resolve => {
                    waiting.push(() => resolve(jpeg()));
                })
        );
        return { readShellFrame, release: () => waiting.shift()?.() };
    };
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));

    it('makes two frames at a time', async () => {
        const { readShellFrame, release } = gate();
        const { frames } = setup({ readShellFrame });

        const jobs = [1, 2, 3].map(n => frames.request(video(n)));
        await tick();
        expect(readShellFrame).toHaveBeenCalledTimes(2);

        release();
        await tick();
        expect(readShellFrame).toHaveBeenCalledTimes(3);
        release();
        release();
        await Promise.all(jobs.map(job => job.result));
    });

    it('drops a request still waiting when its tile leaves the screen', async () => {
        const { readShellFrame, release } = gate();
        const { frames } = setup({ readShellFrame });

        const first = frames.request(video(1));
        const second = frames.request(video(2));
        const third = frames.request(video(3));
        await tick();
        third.cancel();

        await expect(third.result).resolves.toBeNull();
        release();
        release();
        await Promise.all([first.result, second.result]);
        await tick();
        expect(readShellFrame).toHaveBeenCalledTimes(2);
    });

    it('lets a started frame finish and keeps it, though nobody waits for it any more', async () => {
        const { readShellFrame, release } = gate();
        const { frames, kept } = setup({ readShellFrame });

        const job = frames.request(video(1));
        await tick();
        job.cancel();
        release();
        await job.result;

        expect(kept.get('c/u1/frame')).toBe('blob:1');
    });

    it('shares one read between two requests for the same video', async () => {
        const { readShellFrame, release } = gate();
        const { frames } = setup({ readShellFrame });

        const a = frames.request(video(1));
        const b = frames.request(video(1));
        await tick();
        a.cancel();
        release();

        await expect(b.result).resolves.toMatchObject({ kind: 'image' });
        expect(readShellFrame).toHaveBeenCalledTimes(1);
    });
});
