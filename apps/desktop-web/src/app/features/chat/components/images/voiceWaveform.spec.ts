import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchFileBytes } from '../../utils';
import {
    fetchWaveformBytes,
    forgetWaveforms,
    loadWaveform,
    useWaveform,
    WAVEFORM_MAX_BYTES,
    WAVEFORM_MAX_SECONDS,
    waveformPeaks,
} from './voiceWaveform';

vi.mock('../../utils', () => ({ fetchFileBytes: vi.fn() }));

const samples = (...values: number[]) => Float32Array.from(values);

describe('waveformPeaks', () => {
    it('draws one bar per slice, the loudest at full height', () => {
        const peaks = waveformPeaks([samples(0.1, -0.1, 0.5, -0.5, 1, -1, 0.25, 0)], 4);
        expect(peaks).toHaveLength(4);
        expect(peaks[2]).toBe(100);
        expect(peaks[0]).toBeLessThan(peaks[1]);
        expect(peaks[3]).toBeLessThan(peaks[1]);
    });

    it('reads every channel, the louder one deciding', () => {
        const left = samples(0, 0, 0, 0);
        const right = samples(0, 0, 0.8, 0.8);
        const peaks = waveformPeaks([left, right], 2);
        expect(peaks[1]).toBe(100);
        expect(peaks[0]).toBeLessThan(peaks[1]);
    });

    // A silent slice still draws a stub, so the bar row keeps its shape.
    it('keeps a floor under silence, and a silent file is all floor', () => {
        const [quiet] = waveformPeaks([samples(0, 0, 1, 1)], 2);
        expect(quiet).toBeGreaterThan(0);
        expect(new Set(waveformPeaks([samples(0, 0, 0, 0)], 2))).toEqual(new Set([quiet]));
    });

    it('draws fewer bars than asked when the file has fewer samples', () => {
        expect(waveformPeaks([samples(1, 0.5)], 48)).toHaveLength(2);
    });
});

describe('loadWaveform', () => {
    afterEach(() => forgetWaveforms());

    const decoded = (channel: Float32Array) => ({
        numberOfChannels: 1,
        getChannelData: () => channel,
    });

    it('fetches and decodes a file once, however often it is asked for', async () => {
        const fetchBytes = vi.fn(async () => new ArrayBuffer(4));
        const decode = vi.fn(async () => decoded(samples(0.2, 1, 0.2, 0.5)));
        const first = await loadWaveform('https://s/a.m4a', 2, { fetchBytes, decode });
        const again = await loadWaveform('https://s/a.m4a', 2, { fetchBytes, decode });
        expect(first).toEqual(again);
        expect(first).toHaveLength(2);
        expect(fetchBytes).toHaveBeenCalledTimes(1);
        expect(decode).toHaveBeenCalledTimes(1);
    });

    it('rejects when the bytes cannot be decoded, and tries again on the next ask', async () => {
        const fetchBytes = vi.fn(async () => new ArrayBuffer(4));
        const decode = vi
            .fn()
            .mockRejectedValueOnce(new Error('EncodingError'))
            .mockResolvedValueOnce(decoded(samples(1, 1)));
        await expect(loadWaveform('https://s/b.m4a', 2, { fetchBytes, decode })).rejects.toThrow('EncodingError');
        await expect(loadWaveform('https://s/b.m4a', 2, { fetchBytes, decode })).resolves.toHaveLength(2);
    });
});

describe('useWaveform', () => {
    afterEach(() => forgetWaveforms());

    const pattern = [40, 60, 80, 20];

    it('draws the pattern until the file is decoded, then its own waveform', async () => {
        let finish: (bytes: ArrayBuffer) => void = () => undefined;
        const deps = {
            fetchBytes: () => new Promise<ArrayBuffer>(resolve => (finish = resolve)),
            decode: async () => ({ numberOfChannels: 1, getChannelData: () => samples(1, 0, 0, 0, 0, 0, 0, 0) }),
        };
        const { result } = renderHook(() =>
            useWaveform('https://s/c.m4a', pattern, { size: 1024, duration: 60 }, deps)
        );
        expect(result.current).toBe(pattern);
        finish(new ArrayBuffer(4));
        await waitFor(() => expect(result.current).not.toBe(pattern));
        expect(result.current).toHaveLength(4);
        expect(result.current[0]).toBe(100);
    });

    it('keeps the pattern when the file cannot be decoded', async () => {
        const decode = vi.fn(async () => {
            throw new Error('EncodingError');
        });
        const deps = { fetchBytes: async () => new ArrayBuffer(4), decode };
        const { result } = renderHook(() =>
            useWaveform('https://s/d.m4a', pattern, { size: 1024, duration: 60 }, deps)
        );
        await waitFor(() => expect(decode).toHaveBeenCalled());
        await Promise.resolve();
        expect(result.current).toBe(pattern);
    });

    it('does not fetch a file too large to decode', async () => {
        const fetchBytes = vi.fn(async () => new ArrayBuffer(4));
        const deps = { fetchBytes, decode: vi.fn() };
        const { result } = renderHook(() =>
            useWaveform('https://s/e.wav', pattern, { size: WAVEFORM_MAX_BYTES + 1, duration: 60 }, deps)
        );
        await Promise.resolve();
        expect(fetchBytes).not.toHaveBeenCalled();
        expect(result.current).toBe(pattern);
    });

    // A decode's memory follows the length, so nothing is fetched until the length is known and short.
    it('waits for the length, and does not decode a long file', async () => {
        const fetchBytes = vi.fn(async () => new ArrayBuffer(4));
        const deps = { fetchBytes, decode: vi.fn() };
        const { rerender } = renderHook(({ duration }) => useWaveform('https://s/f.m4a', pattern, { duration }, deps), {
            initialProps: { duration: undefined as number | undefined },
        });
        rerender({ duration: WAVEFORM_MAX_SECONDS + 1 });
        await Promise.resolve();
        expect(fetchBytes).not.toHaveBeenCalled();
    });
});

describe('fetchWaveformBytes', () => {
    // The declared size is the sender's word; the cap holds on what arrives.
    it('asks for one byte past the cap, and refuses a file that fills it', async () => {
        const fetched = vi.mocked(fetchFileBytes);
        fetched.mockResolvedValueOnce({ size: WAVEFORM_MAX_BYTES + 1 } as Blob);
        await expect(fetchWaveformBytes('https://s/g.m4a')).rejects.toThrow('too large');
        expect(fetched).toHaveBeenCalledWith('https://s/g.m4a', undefined, WAVEFORM_MAX_BYTES + 1);
        const bytes = new ArrayBuffer(8);
        fetched.mockResolvedValueOnce({ size: 8, arrayBuffer: async () => bytes } as Blob);
        await expect(fetchWaveformBytes('https://s/h.m4a')).resolves.toBe(bytes);
    });
});
