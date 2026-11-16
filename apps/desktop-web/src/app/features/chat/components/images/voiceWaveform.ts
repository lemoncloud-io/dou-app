import { useEffect, useState } from 'react';

import { fetchFileBytes } from '../../utils';

/** The lowest a bar is drawn, in percent: a silent stretch still shows as a stub, not a gap. */
const FLOOR = 15;

/** What `decodeAudioData` hands back, as far as the bars need it. */
interface DecodedAudio {
    numberOfChannels: number;
    getChannelData(channel: number): Float32Array;
}

export interface WaveformDeps {
    fetchBytes: (url: string) => Promise<ArrayBuffer>;
    decode: (bytes: ArrayBuffer) => Promise<DecodedAudio>;
}

/**
 * Bar heights (percent) for decoded audio: the samples cut into `count` even slices, each drawn by its
 * loudest sample on any channel, and scaled so the loudest slice is full height. A file shorter than
 * `count` samples draws one bar per sample.
 */
export const waveformPeaks = (channels: readonly Float32Array[], count: number): number[] => {
    if (channels.length === 0) return [];
    const length = Math.min(...channels.map(channel => channel.length));
    const bars = Math.max(0, Math.min(count, length));
    const peaks = Array.from({ length: bars }, (_, bar) => {
        const start = Math.floor((bar * length) / bars);
        const end = Math.floor(((bar + 1) * length) / bars);
        let peak = 0;
        for (const channel of channels) {
            for (let index = start; index < end; index++) peak = Math.max(peak, Math.abs(channel[index]));
        }
        return peak;
    });
    const loudest = Math.max(0, ...peaks);
    return peaks.map(peak => Math.round(FLOOR + (100 - FLOOR) * (loudest > 0 ? peak / loudest : 0)));
};

/**
 * The largest file decoded for its bars, counted on the bytes that arrive — the size a message declares
 * is not trusted for it.
 */
export const WAVEFORM_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The longest file decoded. A decode holds every sample at the file's own rate before anything is
 * resampled, so memory follows the length, not the file size: a low-bitrate hour is gigabytes of samples.
 * Ten minutes of 48 kHz stereo is about 230 MB, briefly.
 */
export const WAVEFORM_MAX_SECONDS = 10 * 60;

// The decoded buffer kept is resampled to this; 48 bars need no more. An offline context also holds no
// audio device.
const DECODE_SAMPLE_RATE = 8_000;

const decodeOffline = (bytes: ArrayBuffer): Promise<DecodedAudio> =>
    new OfflineAudioContext(1, 1, DECODE_SAMPLE_RATE).decodeAudioData(bytes);

// One byte past the cap is asked for, so a file over it is told from one exactly at it.
export const fetchWaveformBytes = async (url: string): Promise<ArrayBuffer> => {
    const bytes = await fetchFileBytes(url, undefined, WAVEFORM_MAX_BYTES + 1);
    if (bytes.size > WAVEFORM_MAX_BYTES) throw new Error('voice file too large to draw');
    return bytes.arrayBuffer();
};

const DEFAULT_DEPS: WaveformDeps = { fetchBytes: fetchWaveformBytes, decode: decodeOffline };

// One decode per file and bar count while the page is open: the dialog opens again and again on the same
// file, and a decode is the whole file fetched and expanded to samples.
const waveforms = new Map<string, Promise<number[]>>();

/**
 * The file's own waveform as `count` bar heights. Fetches and decodes it once; a failed load is
 * forgotten, so the next ask tries again.
 */
export const loadWaveform = (src: string, count: number, deps: WaveformDeps = DEFAULT_DEPS): Promise<number[]> => {
    const key = `${count}:${src}`;
    const cached = waveforms.get(key);
    if (cached) return cached;
    const loading = (async () => {
        const audio = await deps.decode(await deps.fetchBytes(src));
        const channels = Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel));
        return waveformPeaks(channels, count);
    })();
    waveforms.set(key, loading);
    loading.catch(() => waveforms.delete(key));
    return loading;
};

/** Forgets every decoded waveform. For tests. */
export const forgetWaveforms = () => waveforms.clear();

/**
 * The bars for a voice file: `fallback` until its waveform is decoded, and for good when it cannot be
 * (a format the browser does not decode, a file that will not load) or is too large or long to decode.
 * Closing the dialog does not stop a load under way: the result is kept for the next open.
 */
export const useWaveform = (
    src: string,
    fallback: number[],
    { size, duration }: { size?: number; duration?: number },
    deps: WaveformDeps = DEFAULT_DEPS
): number[] => {
    const [decoded, setDecoded] = useState<{ src: string; bars: number[] } | null>(null);
    const count = fallback.length;
    // Waits for the player's length: until it is known, the decode's cost is not. A declared size over the
    // cap spares the fetch; one under it is checked again on the bytes.
    const decodable =
        duration !== undefined &&
        duration <= WAVEFORM_MAX_SECONDS &&
        (size === undefined || size <= WAVEFORM_MAX_BYTES);
    useEffect(() => {
        if (!decodable) return;
        let active = true;
        loadWaveform(src, count, deps).then(
            bars => active && bars.length > 0 && setDecoded({ src, bars }),
            // Not decoded is not an error the reader can act on: the pattern stays, and the file still plays.
            () => undefined
        );
        return () => {
            active = false;
        };
    }, [src, count, deps, decodable]);
    return decoded?.src === src ? decoded.bars : fallback;
};
