import { readQrText, toPairingCode, type QrInversion, type QrPixels } from './pairingQr';

export type LiveQrOpenFailure = 'unsupported' | 'denied' | 'failed';

export class LiveQrOpenError extends Error {
    constructor(readonly reason: LiveQrOpenFailure) {
        super(`camera ${reason}`);
        this.name = 'LiveQrOpenError';
    }
}

export interface LiveQrHandlers {
    onCode: (code: string) => void;
    onNotOurs?: () => void;
}

export type FrameReader = (video: HTMLVideoElement) => QrPixels | null;

export interface LiveQrScannerDeps {
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    readFrame?: FrameReader;
    readText?: (pixels: QrPixels, inversion: Exclude<QrInversion, 'attemptBoth'>) => string | null;
    setTimer?: (run: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
}

export const SCAN_INTERVAL_MS = 150;

const FRAME_EDGE = 640;

const HAVE_CURRENT_DATA = 2;

const browserGetUserMedia = (): LiveQrScannerDeps['getUserMedia'] => {
    const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    return devices?.getUserMedia ? constraints => devices.getUserMedia(constraints) : undefined;
};

export const canScanLive = (): boolean => !!browserGetUserMedia();

let frameCanvas: HTMLCanvasElement | null = null;

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

export class LiveQrScanner {
    private readonly getUserMedia: LiveQrScannerDeps['getUserMedia'];
    private readonly readFrame: FrameReader;
    private readonly readText: NonNullable<LiveQrScannerDeps['readText']>;
    private readonly setTimer: NonNullable<LiveQrScannerDeps['setTimer']>;
    private readonly clearTimer: NonNullable<LiveQrScannerDeps['clearTimer']>;

    private stream: MediaStream | null = null;
    private timer: unknown = null;
    private run = 0;
    private frame = 0;

    constructor(deps: LiveQrScannerDeps = {}) {
        this.getUserMedia = deps.getUserMedia ?? browserGetUserMedia();
        this.readFrame = deps.readFrame ?? readVideoFrame;
        this.readText = deps.readText ?? readQrText;
        this.setTimer = deps.setTimer ?? ((run, ms) => setTimeout(run, ms));
        this.clearTimer = deps.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
    }

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
            throw new LiveQrOpenError('failed');
        }
        if (run !== this.run) return;
        this.schedule(video, handlers, run);
    }

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

    private readOnce(video: HTMLVideoElement, handlers: LiveQrHandlers): boolean {
        const pixels = this.readFrame(video);
        if (!pixels) return false;
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
