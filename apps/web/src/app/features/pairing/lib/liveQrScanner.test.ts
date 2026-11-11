import { LiveQrOpenError, LiveQrScanner, SCAN_INTERVAL_MS, type LiveQrScannerDeps } from './liveQrScanner';

const PIXELS = { data: new Uint8ClampedArray(4), width: 1, height: 1 };

const fakeStream = () => {
    const track = { stop: jest.fn() };
    return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
};

const fakeVideo = (play: () => Promise<void> = () => Promise.resolve()) =>
    ({ srcObject: null, play: jest.fn(play) }) as unknown as HTMLVideoElement & { play: jest.Mock };

/** A scanner whose timers run only when the test says so, reading the texts it is handed in order. */
const setup = (texts: Array<string | null>, overrides: Partial<LiveQrScannerDeps> = {}) => {
    const { stream, track } = fakeStream();
    const timers: Array<() => void> = [];
    const readText = jest.fn(() => (texts.length ? texts.shift()! : null));
    const scanner = new LiveQrScanner({
        getUserMedia: jest.fn().mockResolvedValue(stream),
        readFrame: () => PIXELS,
        readText,
        setTimer: (run, ms) => {
            expect(ms).toBe(SCAN_INTERVAL_MS);
            timers.push(run);
            return timers.length;
        },
        clearTimer: jest.fn(),
        ...overrides,
    });
    const tick = () => timers.shift()?.();
    return { scanner, track, readText, tick, pending: () => timers.length };
};

describe('LiveQrScanner', () => {
    it('opens the back camera without audio and plays it in the video', async () => {
        const getUserMedia = jest.fn().mockResolvedValue(fakeStream().stream);
        const { scanner } = setup([], { getUserMedia });
        const video = fakeVideo();

        await scanner.start(video, { onCode: jest.fn() });

        expect(getUserMedia).toHaveBeenCalledWith(
            expect.objectContaining({
                audio: false,
                video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
            })
        );
        expect(video.srcObject).not.toBeNull();
        expect(video.play).toHaveBeenCalled();
    });

    it('reads frames until a pairing code turns up, then stops and releases the camera', async () => {
        const { scanner, track, tick, pending } = setup([null, '07344168']);
        const onCode = jest.fn();
        await scanner.start(fakeVideo(), { onCode });

        tick();
        expect(onCode).not.toHaveBeenCalled();
        tick();

        expect(onCode).toHaveBeenCalledWith('07344168');
        expect(track.stop).toHaveBeenCalled();
        expect(pending()).toBe(0);
    });

    it('alternates the plain and the inverted image between frames', async () => {
        const { scanner, readText, tick } = setup([null, null]);
        await scanner.start(fakeVideo(), { onCode: jest.fn() });

        tick();
        tick();

        expect(readText.mock.calls.map(call => (call as unknown[])[1])).toEqual(['dontInvert', 'onlyInvert']);
    });

    it('says when a QR holds something else, and keeps scanning', async () => {
        const { scanner, track, tick, pending } = setup(['https://example.com']);
        const onNotOurs = jest.fn();
        await scanner.start(fakeVideo(), { onCode: jest.fn(), onNotOurs });

        tick();

        expect(onNotOurs).toHaveBeenCalledTimes(1);
        expect(track.stop).not.toHaveBeenCalled();
        expect(pending()).toBe(1);
    });

    it('skips a frame the video cannot give yet', async () => {
        const { scanner, readText, tick, pending } = setup(['07344168'], { readFrame: () => null });
        await scanner.start(fakeVideo(), { onCode: jest.fn() });

        tick();

        expect(readText).not.toHaveBeenCalled();
        expect(pending()).toBe(1);
    });

    it('releases the camera on stop and reads no more frames', async () => {
        const { scanner, track, tick, readText } = setup(['07344168']);
        const onCode = jest.fn();
        await scanner.start(fakeVideo(), { onCode });

        scanner.stop();
        tick();

        expect(track.stop).toHaveBeenCalled();
        expect(readText).not.toHaveBeenCalled();
        expect(onCode).not.toHaveBeenCalled();
    });

    it('drops a stream that arrives after it was stopped', async () => {
        const { stream, track } = fakeStream();
        let resolve!: (value: MediaStream) => void;
        const { scanner, pending } = setup([], { getUserMedia: () => new Promise(r => (resolve = r)) });
        const video = fakeVideo();

        const started = scanner.start(video, { onCode: jest.fn() });
        scanner.stop();
        resolve(stream);
        await started;

        expect(track.stop).toHaveBeenCalled();
        expect(video.play).not.toHaveBeenCalled();
        expect(pending()).toBe(0);
    });

    it.each([
        ['NotAllowedError', 'denied'],
        ['SecurityError', 'denied'],
        ['NotFoundError', 'failed'],
        ['NotReadableError', 'failed'],
    ])('reports a camera refused with %s as %s', async (name, reason) => {
        const error = Object.assign(new Error(name), { name });
        const { scanner } = setup([], { getUserMedia: jest.fn().mockRejectedValue(error) });

        await expect(scanner.start(fakeVideo(), { onCode: jest.fn() })).rejects.toEqual(
            new LiveQrOpenError(reason as never)
        );
    });

    it('reports a page with no getUserMedia as unsupported', async () => {
        const scanner = new LiveQrScanner({ getUserMedia: undefined, readFrame: () => PIXELS });
        // The default deps read `navigator.mediaDevices`, which jsdom does not have.
        await expect(scanner.start(fakeVideo(), { onCode: jest.fn() })).rejects.toMatchObject({
            reason: 'unsupported',
        });
    });

    it('releases the camera when the video will not play, and does not call that a refusal', async () => {
        const { scanner, track } = setup([]);
        const video = fakeVideo(() => Promise.reject(Object.assign(new Error('nope'), { name: 'NotAllowedError' })));

        await expect(scanner.start(video, { onCode: jest.fn() })).rejects.toMatchObject({ reason: 'failed' });
        expect(track.stop).toHaveBeenCalled();
    });
});
