import {
    computeWaveform,
    waveformBars,
    WAVEFORM_MAX_BYTES,
    WAVEFORM_MAX_SECONDS,
    WAVEFORM_SAMPLE_RATE,
} from './audioWaveform';

describe('waveformBars', () => {
    it('takes the RMS of each stretch and scales the loudest to 1', () => {
        const pcm = Float32Array.from([0, 0, 0.1, -0.1, 0.8, -0.8, 0.4, -0.4]);
        expect(waveformBars(pcm, 4).map(bar => Number(bar.toFixed(3)))).toEqual([0.04, 0.125, 1, 0.5]);
    });

    it('gives the asked number of bars, a floor for silence, and copes with fewer samples than bars', () => {
        expect(waveformBars(new Float32Array(1000), 48)).toEqual(Array(48).fill(0.04));
        expect(waveformBars(Float32Array.from([0.5, 0.5]), 4)).toHaveLength(4);
        expect(waveformBars(new Float32Array(0), 3)).toEqual([0.04, 0.04, 0.04]);
    });
});

describe('computeWaveform', () => {
    const okFetch = (bytes = 1000) =>
        jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(bytes) }));
    const decodeTo = (duration: number) => jest.fn(async () => ({ samples: Float32Array.from([0.2, 0.4]), duration }));
    const signal = () => new AbortController().signal;

    it('downloads, decodes at 8 kHz and returns the bars', async () => {
        const fetch = okFetch();
        const decode = decodeTo(30);
        const outcome = await computeWaveform({ url: 'u', sizeBytes: 1000, signal: signal() }, { fetch, decode });
        expect(outcome.kind).toBe('bars');
        expect(outcome.kind === 'bars' && outcome.bars).toHaveLength(48);
        expect(decode).toHaveBeenCalledWith(expect.any(ArrayBuffer), WAVEFORM_SAMPLE_RATE);
    });

    it('downloads nothing for a file over the size or length limit', async () => {
        const fetch = okFetch();
        const decode = decodeTo(1);
        await expect(
            computeWaveform({ url: 'u', sizeBytes: WAVEFORM_MAX_BYTES + 1, signal: signal() }, { fetch, decode })
        ).resolves.toEqual({ kind: 'decorative', reason: 'too-large' });
        await expect(
            computeWaveform(
                { url: 'u', durationSeconds: WAVEFORM_MAX_SECONDS + 1, signal: signal() },
                { fetch, decode }
            )
        ).resolves.toEqual({ kind: 'decorative', reason: 'too-long' });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('drops a result whose decoded length turns out past the limit', async () => {
        await expect(
            computeWaveform(
                { url: 'u', signal: signal() },
                { fetch: okFetch(), decode: decodeTo(WAVEFORM_MAX_SECONDS + 5) }
            )
        ).resolves.toEqual({ kind: 'decorative', reason: 'too-long' });
    });

    it('checks the downloaded size when the message did not say it', async () => {
        const decode = decodeTo(1);
        await expect(
            computeWaveform({ url: 'u', signal: signal() }, { fetch: okFetch(WAVEFORM_MAX_BYTES + 1), decode })
        ).resolves.toEqual({ kind: 'decorative', reason: 'too-large' });
        expect(decode).not.toHaveBeenCalled();
    });

    it('is decorative for a failed download or a format that does not decode', async () => {
        await expect(
            computeWaveform(
                { url: 'u', signal: signal() },
                {
                    fetch: jest.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })),
                    decode: decodeTo(1),
                }
            )
        ).resolves.toEqual({ kind: 'decorative', reason: 'download' });
        await expect(
            computeWaveform(
                { url: 'u', signal: signal() },
                {
                    fetch: okFetch(),
                    decode: jest.fn(async () => {
                        throw new DOMException('Unable to decode audio data', 'EncodingError');
                    }),
                }
            )
        ).resolves.toEqual({ kind: 'decorative', reason: 'decode' });
    });

    it('reports an abort as such, so nothing is remembered', async () => {
        const controller = new AbortController();
        const fetch = jest.fn(async () => {
            controller.abort();
            throw new DOMException('aborted', 'AbortError');
        });
        await expect(
            computeWaveform({ url: 'u', signal: controller.signal }, { fetch, decode: decodeTo(1) })
        ).resolves.toEqual({ kind: 'aborted' });

        const later = new AbortController();
        const decode = jest.fn(async () => {
            later.abort();
            return { samples: [0.1], duration: 1 };
        });
        await expect(
            computeWaveform({ url: 'u', signal: later.signal }, { fetch: okFetch(), decode })
        ).resolves.toEqual({
            kind: 'aborted',
        });
    });
});
