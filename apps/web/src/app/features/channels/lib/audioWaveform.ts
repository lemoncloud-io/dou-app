/**
 * A waveform for the audio detail screen, computed on this device from the file itself — the server
 * stores none.
 *
 * The file is fetched once more (the player streams it on its own), decoded down to 8 kHz mono — a
 * fifteen-minute file is then about 29 MB of samples rather than the hundreds a full-rate decode takes —
 * and cut into bars by RMS. Only the bars are kept (`localMediaPrefs`); the bytes and the decoded
 * buffer are dropped as soon as the bars exist.
 *
 * What is not attempted, or fails, is drawn as a decorative waveform instead: a file over the limits
 * below, a format this system cannot decode (iOS has no Ogg Vorbis), a failed download. A failure is
 * remembered as such so it is not tried again on every visit; leaving the screen mid-way is not.
 */

/** Files above this are not downloaded for a waveform. */
export const WAVEFORM_MAX_BYTES = 20 * 1024 * 1024;
/** Files longer than this are not decoded (or their result is dropped when the length was not known before). */
export const WAVEFORM_MAX_SECONDS = 15 * 60;
/** The decode rate: enough for an envelope, a sixth of a 48 kHz decode's memory. */
export const WAVEFORM_SAMPLE_RATE = 8000;
/** Bars on the detail screen (Figma 6072:22440). */
export const WAVEFORM_BARS = 48;

/**
 * `samples` cut into `count` equal stretches, each the RMS of its samples, scaled so the loudest
 * stretch is 1. Silence reads as a row of the smallest bar rather than nothing, so the shape is still
 * there to seek on.
 */
export const waveformBars = (samples: ArrayLike<number>, count = WAVEFORM_BARS): number[] => {
    const floor = 0.04;
    if (samples.length === 0 || count <= 0) return Array.from({ length: Math.max(count, 0) }, () => floor);
    const rms: number[] = [];
    for (let bar = 0; bar < count; bar += 1) {
        const start = Math.floor((bar * samples.length) / count);
        const end = Math.max(start + 1, Math.floor(((bar + 1) * samples.length) / count));
        let sum = 0;
        for (let i = start; i < end && i < samples.length; i += 1) {
            const value = samples[i] ?? 0;
            sum += value * value;
        }
        rms.push(Math.sqrt(sum / (end - start)));
    }
    const peak = Math.max(...rms);
    if (!(peak > 0)) return rms.map(() => floor);
    return rms.map(value => Math.max(floor, Math.min(1, value / peak)));
};

export type WaveformOutcome =
    | { kind: 'bars'; bars: number[] }
    /** Not computable — remember it, draw the decorative shape. */
    | { kind: 'decorative'; reason: 'too-large' | 'too-long' | 'download' | 'decode' | 'unsupported' }
    /** The screen went away first — nothing to remember. */
    | { kind: 'aborted' };

export interface WaveformInput {
    url: string;
    /** The upload's size, when the message says it — checked before anything is downloaded. */
    sizeBytes?: number;
    /** The length, when the player already knows it — checked before anything is downloaded. */
    durationSeconds?: number;
    signal: AbortSignal;
}

export interface WaveformDeps {
    fetch: (
        url: string,
        init: { signal: AbortSignal }
    ) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>;
    /** Decodes to mono at `sampleRate`; throws when the format cannot be decoded. */
    decode: (bytes: ArrayBuffer, sampleRate: number) => Promise<{ samples: ArrayLike<number>; duration: number }>;
}

/** The browser's decoder, run in an offline context at the low rate so the buffer it builds is small. */
export const decodeWithOfflineContext: WaveformDeps['decode'] = async (bytes, sampleRate) => {
    const Context =
        globalThis.OfflineAudioContext ??
        (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Context) throw new Error('no OfflineAudioContext');
    // The length only sizes a render this never runs; decodeAudioData resamples to the context's rate.
    const context = new Context(1, sampleRate, sampleRate);
    const buffer = await context.decodeAudioData(bytes);
    return { samples: buffer.getChannelData(0), duration: buffer.duration };
};

const isAbort = (error: unknown, signal: AbortSignal) =>
    signal.aborted || (error instanceof Error && error.name === 'AbortError');

/** Computes a file's bars, or says why it will not. */
export const computeWaveform = async (
    { url, sizeBytes, durationSeconds, signal }: WaveformInput,
    deps: WaveformDeps
): Promise<WaveformOutcome> => {
    if (sizeBytes !== undefined && sizeBytes > WAVEFORM_MAX_BYTES) return { kind: 'decorative', reason: 'too-large' };
    if (durationSeconds !== undefined && durationSeconds > WAVEFORM_MAX_SECONDS) {
        return { kind: 'decorative', reason: 'too-long' };
    }
    let bytes: ArrayBuffer;
    try {
        const response = await deps.fetch(url, { signal });
        if (!response.ok) return { kind: 'decorative', reason: 'download' };
        bytes = await response.arrayBuffer();
    } catch (error) {
        return isAbort(error, signal) ? { kind: 'aborted' } : { kind: 'decorative', reason: 'download' };
    }
    if (signal.aborted) return { kind: 'aborted' };
    if (bytes.byteLength > WAVEFORM_MAX_BYTES) return { kind: 'decorative', reason: 'too-large' };
    let decoded: { samples: ArrayLike<number>; duration: number };
    try {
        decoded = await deps.decode(bytes, WAVEFORM_SAMPLE_RATE);
    } catch (error) {
        if (signal.aborted) return { kind: 'aborted' };
        return {
            kind: 'decorative',
            reason: error instanceof Error && /OfflineAudioContext/.test(error.message) ? 'unsupported' : 'decode',
        };
    }
    if (signal.aborted) return { kind: 'aborted' };
    if (decoded.duration > WAVEFORM_MAX_SECONDS) return { kind: 'decorative', reason: 'too-long' };
    return { kind: 'bars', bars: waveformBars(decoded.samples) };
};
