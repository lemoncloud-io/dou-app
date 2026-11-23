export const WAVEFORM_MAX_BYTES = 20 * 1024 * 1024;
export const WAVEFORM_MAX_SECONDS = 15 * 60;
export const WAVEFORM_SAMPLE_RATE = 8000;
export const WAVEFORM_BARS = 48;

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
    | { kind: 'decorative'; reason: 'too-large' | 'too-long' | 'download' | 'decode' | 'unsupported' }
    | { kind: 'aborted' };

export interface WaveformInput {
    url: string;
    sizeBytes?: number;
    durationSeconds?: number;
    signal: AbortSignal;
}

export interface WaveformDeps {
    fetch: (
        url: string,
        init: { signal: AbortSignal }
    ) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>;
    decode: (bytes: ArrayBuffer, sampleRate: number) => Promise<{ samples: ArrayLike<number>; duration: number }>;
}

export const decodeWithOfflineContext: WaveformDeps['decode'] = async (bytes, sampleRate) => {
    const Context =
        globalThis.OfflineAudioContext ??
        (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Context) throw new Error('no OfflineAudioContext');
    const context = new Context(1, sampleRate, sampleRate);
    const buffer = await context.decodeAudioData(bytes);
    return { samples: buffer.getChannelData(0), duration: buffer.duration };
};

const isAbort = (error: unknown, signal: AbortSignal) =>
    signal.aborted || (error instanceof Error && error.name === 'AbortError');

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
