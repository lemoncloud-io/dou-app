import { renameForType } from './package';
import type { PreparedFile } from './types';

/**
 * The poster rule, the same one the app's shells apply to a video they prepare — so a tile looks the
 * same whichever side made its poster, and the server, which drops a thumbnail over 200,000 bytes
 * without saying so, keeps every one of them.
 */
export const VIDEO_POSTER = {
    /** Long edge in pixels. Never upscaled. */
    maxEdge: 400,
    /** The server's thumbnail ceiling — decimal, not 200 KiB. */
    maxBytes: 200_000,
    /** Half a second in: the very first frame of a phone recording is often black. */
    atSeconds: 0.5,
    /** Tried in turn until one fits `maxBytes`. */
    qualities: [0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
    /**
     * How long to wait after the frame is reported ready before drawing it, and again before the one
     * retry. Android's WebView reports `seeked` before the frame reaches what a canvas can read, and
     * drawn at once it was blank in 10 of 17 tries; 300 ms later it was right 17 of 17.
     */
    settleMs: 300,
    /** A decode that has not produced a frame by then is not going to. */
    timeoutMs: 10_000,
} as const;

export interface VideoFrame {
    blob: Blob;
    width: number;
    height: number;
}

export interface VideoFrameOptions {
    /** Default `VIDEO_POSTER.timeoutMs`. */
    timeoutMs?: number;
}

/**
 * Whether sampled RGBA pixels are a frame that was never drawn: dark and flat. A blank canvas reads as
 * all zeros, and so does a frame the decoder had not delivered yet. A fade from black is caught too,
 * which is fine — a black tile is no better than a grey one.
 *
 * Exported for its tests: the thresholds are the part worth pinning.
 */
export const isBlankFrame = (rgba: Uint8ClampedArray): boolean => {
    const pixels = Math.floor(rgba.length / 4);
    if (pixels === 0) return true;
    // Every eighth pixel is plenty to tell a picture from nothing, and keeps a 400px frame cheap.
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

/** The first quality in `qualities` whose JPEG fits `maxBytes`, or null when none does. */
const encodeWithin = async (canvas: HTMLCanvasElement): Promise<Blob | null> => {
    for (const quality of VIDEO_POSTER.qualities) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (!blob) return null;
        if (blob.size <= VIDEO_POSTER.maxBytes) return blob;
    }
    return null;
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A JPEG of the frame half a second into `source`, or `null` when this browser cannot draw it — a codec
 * it cannot decode (HEVC in most Chromium builds fails within milliseconds), a file with no video, a
 * frame still blank after one retry, or no frame within `timeoutMs`.
 *
 * `source` is read through an object URL, so it is always same-origin and the canvas can be exported.
 * The caller decides where the bytes came from: a picked `File`, or a received video's first bytes
 * fetched with CORS.
 *
 * **The seek is a URL fragment**, `#t=0.5`, set before anything loads. Setting `currentTime` on a paused
 * element instead never completes on iOS WebKit: `seeking` arrives and `seeked` does not. A video shorter
 * than that is read from its first frame (`#t=0`).
 */
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
            // Let go of the decoder now rather than whenever the element is collected.
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
                    // One more wait for a frame the decoder was still delivering; a second blank is a
                    // frame this browser is not going to give (a 4K HEVC whose first GOP lies past what
                    // was read).
                    await wait(VIDEO_POSTER.settleMs);
                    if (settled) return;
                    canvas = capture();
                }
                if (!canvas) return finish(null);
                const blob = await encodeWithin(canvas);
                finish(blob ? { blob, width: canvas.width, height: canvas.height } : null);
            } catch {
                // A canvas the browser will not read back, an encoder that throws: no poster, now, rather
                // than at the deadline.
                finish(null);
            }
        };

        video.onloadedmetadata = () => {
            // Shorter than the fragment: start over at the first frame. The loads so far are discarded
            // with the old source, so no event of theirs can start a draw.
            if (fragment > 0 && Number.isFinite(video.duration) && video.duration < VIDEO_POSTER.atSeconds) {
                fragment = 0;
                video.src = `${url}#t=0`;
            }
        };
        // Whichever comes first: a fragment seek reports `seeked` on some engines and only `loadeddata`
        // on others, and the settle wait covers the gap either way.
        video.onseeked = () => void draw();
        video.onloadeddata = () => void draw();
        video.onerror = () => finish(null);

        video.src = `${url}#t=${fragment}`;
    });

/**
 * The poster of a picked video, for its upload's thumbnail slot: `<name>-poster.jpg` at the shells'
 * poster rule (`VIDEO_POSTER`). `null` when this browser cannot draw it, and the video then goes up
 * without one — a poster is never a reason not to send.
 */
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
