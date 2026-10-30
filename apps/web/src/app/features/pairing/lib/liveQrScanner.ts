import { readQrText, toPairingCode, type QrInversion, type QrPixels } from './pairingQr';

/**
 * Why the camera could not be opened:
 *
 * - `unsupported` — no `getUserMedia` in this page (an old WebView, an insecure origin).
 * - `denied` — the person, or the OS, refused the camera.
 * - `failed` — anything else: no camera, a camera already in use, a stream that would not play.
 */
export type LiveQrOpenFailure = 'unsupported' | 'denied' | 'failed';

export class LiveQrOpenError extends Error {
    constructor(readonly reason: LiveQrOpenFailure) {
        super(`camera ${reason}`);
        this.name = 'LiveQrOpenError';
    }
}

export interface LiveQrHandlers {
    /** A pairing code was read. The scanner has already stopped. */
    onCode: (code: string) => void;
    /** A QR code was read that holds something else. Scanning goes on. */
    onNotOurs?: () => void;
}

/** A frame's pixels, or `null` while the video has none to give. */
export type FrameReader = (video: HTMLVideoElement) => QrPixels | null;

export interface LiveQrScannerDeps {
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    readFrame?: FrameReader;
    readText?: (pixels: QrPixels, inversion: Exclude<QrInversion, 'attemptBoth'>) => string | null;
    setTimer?: (run: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
}

/**
 * Time between two frames read. A QR held up to the camera is read within a few frames, and the decode
 * runs on the main thread, so reading every animation frame would only cost scrolling and battery.
 */
export const SCAN_INTERVAL_MS = 150;

/** Longest edge a frame is decoded at. A QR filling part of the guide stays well readable at 640 px. */
const FRAME_EDGE = 640;

/** `HTMLMediaElement.HAVE_CURRENT_DATA`, spelled out so the module does not read the DOM at import. */
const HAVE_CURRENT_DATA = 2;

const browserGetUserMedia = (): LiveQrScannerDeps['getUserMedia'] => {
    const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    return devices?.getUserMedia ? constraints => devices.getUserMedia(constraints) : undefined;
};

/** Whether this page can open a camera stream at all. When it cannot, take a photo instead. */
export const canScanLive = (): boolean => !!browserGetUserMedia();

let frameCanvas: HTMLCanvasElement | null = null;

/** Draws the current video frame on a reused canvas, scaled down to `FRAME_EDGE`. */
export const readVideoFrame: FrameReader = video => {
    if (video.readyState < HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return null;
    const scale = Math.min(1, FRAME_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    frameCanvas ??= document.createElement('canvas');
    if (frameCanvas.width !== width) frameCanvas.width = width;
    if (frameCanvas.height !== height) frameCanvas.height = height;
    const context = frameCanvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(video, 0, 0, width, height);
    return { data: context.getImageData(0, 0, width, height).data, width, height };
};

const failureOf = (error: unknown): LiveQrOpenFailure => {
    const name = (error as { name?: string } | null)?.name;
    return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed';
};

/**
 * Reads a pairing code off the camera's live picture, inside the page.
 *
 * The camera stream comes from `getUserMedia`, which both app WebViews already serve: Android's asks
 * for the app's camera permission and grants it, iOS's asks the person once per page. So this works on
 * app builds that predate it, unlike the photo bridge, whose base64 answer needs a newer shell.
 *
 * One scanner reads one code: `start` opens the camera and reads frames until a pairing code turns up
 * or `stop` is called, and either way the camera is released.
 */
export class LiveQrScanner {
    private readonly getUserMedia: LiveQrScannerDeps['getUserMedia'];
    private readonly readFrame: FrameReader;
    private readonly readText: NonNullable<LiveQrScannerDeps['readText']>;
    private readonly setTimer: NonNullable<LiveQrScannerDeps['setTimer']>;
    private readonly clearTimer: NonNullable<LiveQrScannerDeps['clearTimer']>;

    private stream: MediaStream | null = null;
    private timer: unknown = null;
    /** Bumped by `stop`, so a `start` still waiting on the camera knows it was called off. */
    private run = 0;
    private frame = 0;

    constructor(deps: LiveQrScannerDeps = {}) {
        this.getUserMedia = deps.getUserMedia ?? browserGetUserMedia();
        this.readFrame = deps.readFrame ?? readVideoFrame;
        this.readText = deps.readText ?? readQrText;
        this.setTimer = deps.setTimer ?? ((run, ms) => setTimeout(run, ms));
        this.clearTimer = deps.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
    }

    /** Opens the back camera into `video` and starts reading. Rejects with a `LiveQrOpenError`. */
    async start(video: HTMLVideoElement, handlers: LiveQrHandlers): Promise<void> {
        this.stop();
        const run = this.run;
        if (!this.getUserMedia) throw new LiveQrOpenError('unsupported');

        let stream: MediaStream;
        try {
            stream = await this.getUserMedia({
                audio: false,
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            });
        } catch (error) {
            throw new LiveQrOpenError(failureOf(error));
        }
        if (run !== this.run) {
            // Closed while the permission prompt was up: the stream arrived for nobody.
            stopTracks(stream);
            return;
        }
        this.stream = stream;

        video.srcObject = stream;
        try {
            await video.play();
        } catch {
            if (run !== this.run) return;
            this.stop();
            // A refused `play()` is an autoplay rule (iOS's WebView keeps one that wants a tap), not the
            // person turning the camera down — the camera was already granted — so it never reads as
            // `denied`.
            throw new LiveQrOpenError('failed');
        }
        if (run !== this.run) return;
        this.schedule(video, handlers, run);
    }

    /** Releases the camera and stops reading. Safe to call at any time, more than once. */
    stop(): void {
        this.run += 1;
        if (this.timer !== null) this.clearTimer(this.timer);
        this.timer = null;
        if (this.stream) stopTracks(this.stream);
        this.stream = null;
    }

    private schedule(video: HTMLVideoElement, handlers: LiveQrHandlers, run: number): void {
        this.timer = this.setTimer(() => {
            this.timer = null;
            if (run !== this.run) return;
            if (this.readOnce(video, handlers)) return;
            if (run === this.run) this.schedule(video, handlers, run);
        }, SCAN_INTERVAL_MS);
    }

    /** Reads one frame; `true` once a pairing code was found and the scanner stopped. */
    private readOnce(video: HTMLVideoElement, handlers: LiveQrHandlers): boolean {
        const pixels = this.readFrame(video);
        if (!pixels) return false;
        // A code shown light on dark (a screen in dark mode) needs the inverted image. Trying both on
        // every frame doubles the decode, so frames alternate between the two instead.
        this.frame += 1;
        const text = this.readText(pixels, this.frame % 2 ? 'dontInvert' : 'onlyInvert');
        if (text === null) return false;
        const code = toPairingCode(text);
        if (!code) {
            handlers.onNotOurs?.();
            return false;
        }
        this.stop();
        handlers.onCode(code);
        return true;
    }
}

const stopTracks = (stream: MediaStream) => stream.getTracks().forEach(track => track.stop());
