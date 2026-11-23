import { renameForType } from './package';
import type { PreparedFile } from './types';

export const VIDEO_POSTER = {
    maxEdge: 400,
    maxBytes: 200_000,
    atSeconds: 0.5,
    qualities: [0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
    settleMs: 300,
    timeoutMs: 10_000,
} as const;

export interface VideoFrame {
    blob: Blob;
    width: number;
    height: number;
}

export interface VideoFrameOptions {
    timeoutMs?: number;
}

export const isBlankFrame = (rgba: Uint8ClampedArray): boolean => {
    const pixels = Math.floor(rgba.length / 4);
    if (pixels === 0) return true;
    const step = 8;
    let count = 0;
    let sum = 0;
    let sumOfSquares = 0;
    for (let pixel = 0; pixel < pixels; pixel += step) {
        const i = pixel * 4;
        const luma = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
        sum += luma;
        sumOfSquares += luma * luma;
        count += 1;
    }
    const mean = sum / count;
    const variance = sumOfSquares / count - mean * mean;
    return mean < 4 && variance < 4;
};

const encodeWithin = async (canvas: HTMLCanvasElement): Promise<Blob | null> => {
    for (const quality of VIDEO_POSTER.qualities) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (!blob) return null;
        if (blob.size <= VIDEO_POSTER.maxBytes) return blob;
    }
    return null;
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const drawVideoFrame = (source: Blob, options: VideoFrameOptions = {}): Promise<VideoFrame | null> =>
    new Promise(resolve => {
        const url = URL.createObjectURL(source);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';

        let settled = false;
        let drawing = false;
        let fragment: number = VIDEO_POSTER.atSeconds;

        const finish = (frame: VideoFrame | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(deadline);
            video.onloadedmetadata = null;
            video.onloadeddata = null;
            video.onseeked = null;
            video.onerror = null;
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(url);
            resolve(frame);
        };
        const deadline = setTimeout(() => finish(null), options.timeoutMs ?? VIDEO_POSTER.timeoutMs);

        const capture = (): HTMLCanvasElement | null => {
            const { videoWidth, videoHeight } = video;
            if (!videoWidth || !videoHeight) return null;
            const scale = Math.min(1, VIDEO_POSTER.maxEdge / Math.max(videoWidth, videoHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(videoWidth * scale));
            canvas.height = Math.max(1, Math.round(videoHeight * scale));
            const context = canvas.getContext('2d');
            if (!context) return null;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
            return isBlankFrame(data) ? null : canvas;
        };

        const draw = async () => {
            if (drawing || settled) return;
            drawing = true;
            try {
                await wait(VIDEO_POSTER.settleMs);
                if (settled) return;
                let canvas = capture();
                if (!canvas) {
                    await wait(VIDEO_POSTER.settleMs);
                    if (settled) return;
                    canvas = capture();
                }
                if (!canvas) return finish(null);
                const blob = await encodeWithin(canvas);
                finish(blob ? { blob, width: canvas.width, height: canvas.height } : null);
            } catch {
                finish(null);
            }
        };

        video.onloadedmetadata = () => {
            if (fragment > 0 && Number.isFinite(video.duration) && video.duration < VIDEO_POSTER.atSeconds) {
                fragment = 0;
                video.src = `${url}#t=0`;
            }
        };
        video.onseeked = () => void draw();
        video.onloadeddata = () => void draw();
        video.onerror = () => finish(null);

        video.src = `${url}#t=${fragment}`;
    });

export const makeVideoPoster = async (file: File, options?: VideoFrameOptions): Promise<PreparedFile | null> => {
    const frame = await drawVideoFrame(file, options);
    if (!frame) return null;
    return {
        file: new File([frame.blob], renameForType(file.name, 'image/jpeg', '-poster'), {
            type: 'image/jpeg',
            lastModified: file.lastModified,
        }),
        width: frame.width,
        height: frame.height,
    };
};
