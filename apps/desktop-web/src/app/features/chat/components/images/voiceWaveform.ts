import { useEffect, useState } from 'react';

import { fetchFileBytes } from '../../utils';

const FLOOR = 15;

interface DecodedAudio {
    numberOfChannels: number;
    getChannelData(channel: number): Float32Array;
}

export interface WaveformDeps {
    fetchBytes: (url: string) => Promise<ArrayBuffer>;
    decode: (bytes: ArrayBuffer) => Promise<DecodedAudio>;
}

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

export const WAVEFORM_MAX_BYTES = 10 * 1024 * 1024;

export const WAVEFORM_MAX_SECONDS = 10 * 60;

const DECODE_SAMPLE_RATE = 8_000;

const decodeOffline = (bytes: ArrayBuffer): Promise<DecodedAudio> =>
    new OfflineAudioContext(1, 1, DECODE_SAMPLE_RATE).decodeAudioData(bytes);

export const fetchWaveformBytes = async (url: string): Promise<ArrayBuffer> => {
    const bytes = await fetchFileBytes(url, undefined, WAVEFORM_MAX_BYTES + 1);
    if (bytes.size > WAVEFORM_MAX_BYTES) throw new Error('voice file too large to draw');
    return bytes.arrayBuffer();
};

const DEFAULT_DEPS: WaveformDeps = { fetchBytes: fetchWaveformBytes, decode: decodeOffline };

const waveforms = new Map<string, Promise<number[]>>();

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

export const forgetWaveforms = () => waveforms.clear();

export const useWaveform = (
    src: string,
    fallback: number[],
    { size, duration }: { size?: number; duration?: number },
    deps: WaveformDeps = DEFAULT_DEPS
): number[] => {
    const [decoded, setDecoded] = useState<{ src: string; bars: number[] } | null>(null);
    const count = fallback.length;
    const decodable =
        duration !== undefined &&
        duration <= WAVEFORM_MAX_SECONDS &&
        (size === undefined || size <= WAVEFORM_MAX_BYTES);
    useEffect(() => {
        if (!decodable) return;
        let active = true;
        loadWaveform(src, count, deps).then(
            bars => active && bars.length > 0 && setDecoded({ src, bars }),
            () => undefined
        );
        return () => {
            active = false;
        };
    }, [src, count, deps, decodable]);
    return decoded?.src === src ? decoded.bars : fallback;
};
