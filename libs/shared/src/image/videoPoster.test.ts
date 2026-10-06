import { drawVideoFrame, isBlankFrame, makeVideoPoster, VIDEO_POSTER } from './videoPoster';

// jsdom has neither a media pipeline nor a canvas, so both elements are stubbed. What is under test is
// the routine around them: which fragment is loaded, when a frame is drawn, the blank-frame retry, the
// size steps, and that every way out lets go of the object URL.

type Scenario = {
    duration: number;
    width: number;
    height: number;
    /** Which event a load reports once its metadata is in. `error` fails the load instead. */
    ready: 'seeked' | 'loadeddata' | 'error' | 'never';
    /** One entry per capture, in order: whether that capture reads blank. The last repeats. */
    blank: boolean[];
    /** The JPEG size `toBlob` produces at each quality, by quality. Default: always small. */
    sizeAt?: (quality: number) => number | null;
};

let scenario: Scenario;
let sources: string[];
let captures: number;
let draws: { width: number; height: number }[];
let qualities: number[];
let revoked: string[];

const opaque = (pixels: number) => {
    const data = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = (i * 7) % 255;
        data[i + 1] = 120;
        data[i + 2] = 60;
        data[i + 3] = 255;
    }
    return data;
};

const fakeVideo = () => {
    const video = {
        muted: false,
        playsInline: false,
        preload: '',
        duration: NaN,
        videoWidth: 0,
        videoHeight: 0,
        onloadedmetadata: null as null | (() => void),
        onloadeddata: null as null | (() => void),
        onseeked: null as null | (() => void),
        onerror: null as null | (() => void),
        removeAttribute: jest.fn(),
        load: jest.fn(),
        set src(value: string) {
            sources.push(value);
            // A real element reports asynchronously, and a new source discards the old load's events.
            const generation = sources.length;
            setTimeout(() => {
                if (generation !== sources.length) return;
                if (scenario.ready === 'error') return video.onerror?.();
                video.duration = scenario.duration;
                video.videoWidth = scenario.width;
                video.videoHeight = scenario.height;
                video.onloadedmetadata?.();
                if (generation !== sources.length || scenario.ready === 'never') return;
                (scenario.ready === 'seeked' ? video.onseeked : video.onloadeddata)?.();
            }, 5);
        },
    };
    return video;
};

const fakeCanvas = () => ({
    width: 0,
    height: 0,
    getContext: () => ({
        drawImage: (_v: unknown, _x: number, _y: number, width: number, height: number) =>
            draws.push({ width, height }),
        getImageData: (_x: number, _y: number, width: number, height: number) => {
            const blank = scenario.blank[Math.min(captures, scenario.blank.length - 1)];
            captures += 1;
            return { data: blank ? new Uint8ClampedArray(width * height * 4) : opaque(width * height) };
        },
    }),
    toBlob: (callback: (blob: Blob | null) => void, _type: string, quality: number) => {
        qualities.push(quality);
        const size = scenario.sizeAt ? scenario.sizeAt(quality) : 30_000;
        callback(size === null ? null : new Blob([new Uint8Array(size)], { type: 'image/jpeg' }));
    },
});

beforeEach(() => {
    jest.useFakeTimers();
    scenario = { duration: 12, width: 1920, height: 1080, ready: 'seeked', blank: [false] };
    sources = [];
    captures = 0;
    draws = [];
    qualities = [];
    revoked = [];
    URL.createObjectURL = jest.fn(() => 'blob:poster');
    URL.revokeObjectURL = jest.fn((url: string) => void revoked.push(url));
    const createElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'video') return fakeVideo() as unknown as HTMLElement;
        if (tag === 'canvas') return fakeCanvas() as unknown as HTMLElement;
        return createElement(tag);
    });
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

/** Runs the routine to completion under fake timers. */
const settle = async <T>(promise: Promise<T>): Promise<T> => {
    for (let i = 0; i < 50; i += 1) await jest.advanceTimersByTimeAsync(100);
    return promise;
};

const file = (name = 'clip.mp4') => new File([new Uint8Array(16)], name, { type: 'video/mp4', lastModified: 42 });

describe('isBlankFrame', () => {
    it('treats an all-zero canvas as blank', () => {
        expect(isBlankFrame(new Uint8ClampedArray(400 * 4))).toBe(true);
    });

    it('treats a dark but varied frame as a picture', () => {
        const data = new Uint8ClampedArray(400 * 4);
        for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = i % 64 === 0 ? 40 : 0;
        expect(isBlankFrame(data)).toBe(false);
    });

    it('treats a flat mid-grey frame as a picture', () => {
        expect(isBlankFrame(new Uint8ClampedArray(400 * 4).fill(128))).toBe(false);
    });

    it('treats an empty sample as blank', () => {
        expect(isBlankFrame(new Uint8ClampedArray(0))).toBe(true);
    });
});

describe('drawVideoFrame', () => {
    it('seeks with a 0.5 s URL fragment and draws the frame 400px on its long edge', async () => {
        const frame = await settle(drawVideoFrame(file()));

        expect(sources).toEqual(['blob:poster#t=0.5']);
        expect(draws).toEqual([{ width: 400, height: 225 }]);
        expect(frame).toMatchObject({ width: 400, height: 225 });
        expect(revoked).toEqual(['blob:poster']);
    });

    it('waits the settle time after the frame is reported before drawing it', async () => {
        const pending = drawVideoFrame(file());
        await jest.advanceTimersByTimeAsync(5 + VIDEO_POSTER.settleMs - 1);
        expect(draws).toHaveLength(0);
        await jest.advanceTimersByTimeAsync(1);
        expect(draws).toHaveLength(1);
        await settle(pending);
    });

    it('also starts from loadeddata when the engine reports no seeked', async () => {
        scenario.ready = 'loadeddata';
        expect(await settle(drawVideoFrame(file()))).not.toBeNull();
    });

    it('reads a video shorter than half a second from its first frame', async () => {
        scenario.duration = 0.3;
        const frame = await settle(drawVideoFrame(file()));

        expect(sources).toEqual(['blob:poster#t=0.5', 'blob:poster#t=0']);
        expect(frame).not.toBeNull();
        expect(draws).toHaveLength(1);
    });

    it('never upscales a frame smaller than the long edge', async () => {
        scenario.width = 320;
        scenario.height = 240;
        expect(await settle(drawVideoFrame(file()))).toMatchObject({ width: 320, height: 240 });
    });

    it('draws once more after a blank frame and keeps the second', async () => {
        scenario.blank = [true, false];
        const frame = await settle(drawVideoFrame(file()));

        expect(captures).toBe(2);
        expect(frame).not.toBeNull();
    });

    it('gives up after a second blank frame', async () => {
        scenario.blank = [true, true];
        const frame = await settle(drawVideoFrame(file()));

        expect(captures).toBe(2);
        expect(frame).toBeNull();
        expect(revoked).toEqual(['blob:poster']);
    });

    it('steps the quality down from 0.7 until the JPEG fits 200,000 bytes', async () => {
        scenario.sizeAt = quality => (quality > 0.45 ? 250_000 : 150_000);
        const frame = await settle(drawVideoFrame(file()));

        expect(qualities).toEqual([0.7, 0.6, 0.5, 0.4]);
        expect(frame?.blob.size).toBe(150_000);
    });

    it('takes exactly 200,000 bytes as fitting', async () => {
        scenario.sizeAt = () => 200_000;
        expect(await settle(drawVideoFrame(file()))).not.toBeNull();
        expect(qualities).toEqual([0.7]);
    });

    it('gives up when no quality fits', async () => {
        scenario.sizeAt = () => 200_001;
        expect(await settle(drawVideoFrame(file()))).toBeNull();
        expect(qualities).toEqual([...VIDEO_POSTER.qualities]);
    });

    it('gives up when the encoder produces nothing', async () => {
        scenario.sizeAt = () => null;
        expect(await settle(drawVideoFrame(file()))).toBeNull();
    });

    it('gives up at once, not at the deadline, when reading the canvas back throws', async () => {
        const createElement = document.createElement.bind(document);
        (document.createElement as jest.Mock).mockImplementation((tag: string) => {
            if (tag === 'video') return fakeVideo() as unknown as HTMLElement;
            if (tag === 'canvas') {
                const canvas = fakeCanvas();
                return {
                    ...canvas,
                    getContext: () => ({
                        drawImage: jest.fn(),
                        getImageData: () => {
                            throw new DOMException('tainted', 'SecurityError');
                        },
                    }),
                } as unknown as HTMLElement;
            }
            return createElement(tag);
        });
        const pending = drawVideoFrame(file());
        await jest.advanceTimersByTimeAsync(5 + VIDEO_POSTER.settleMs);

        await expect(pending).resolves.toBeNull();
        expect(revoked).toEqual(['blob:poster']);
    });

    it('gives up at once on a decode error, as for a codec the browser cannot play', async () => {
        scenario.ready = 'error';
        const frame = await settle(drawVideoFrame(file()));

        expect(frame).toBeNull();
        expect(draws).toHaveLength(0);
        expect(revoked).toEqual(['blob:poster']);
    });

    it('gives up when no frame arrives within the timeout', async () => {
        scenario.ready = 'never';
        const pending = drawVideoFrame(file(), { timeoutMs: 1_000 });
        await jest.advanceTimersByTimeAsync(999);
        expect(revoked).toEqual([]);
        await jest.advanceTimersByTimeAsync(1);

        expect(await pending).toBeNull();
        expect(revoked).toEqual(['blob:poster']);
    });
});

describe('makeVideoPoster', () => {
    it('names the poster after the video and declares it a JPEG', async () => {
        const poster = await settle(makeVideoPoster(file('Trip 01.mov')));

        expect(poster?.file.name).toBe('Trip 01-poster.jpg');
        expect(poster?.file.type).toBe('image/jpeg');
        expect(poster?.file.lastModified).toBe(42);
        expect([poster?.width, poster?.height]).toEqual([400, 225]);
    });

    it('is null when no frame could be drawn, so the video goes without one', async () => {
        scenario.ready = 'error';
        expect(await settle(makeVideoPoster(file()))).toBeNull();
    });
});
