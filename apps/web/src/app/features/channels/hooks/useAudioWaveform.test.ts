import { renderHook, waitFor } from '@testing-library/react';

import { MemoryStore } from '@chatic/storage';

import { WAVEFORM_BARS, type WaveformDeps } from '../lib/audioWaveform';
import { readWaveform, setLocalMediaPrefsStorage, writeWaveform } from '../lib/localMediaPrefs';
import { useAudioWaveform } from './useAudioWaveform';

const me = { cid: 'c1', uid: 'u1' };
const input = { scope: me, uploadId: 'up-1', url: 'https://cdn/a.m4a' };

/** A fetch and a decode the test controls: the decode answers with a rising ramp of samples. */
const fakeDeps = () => {
    const fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    const decode = jest.fn(async () => ({
        samples: Array.from({ length: 480 }, (_, i) => i / 480),
        duration: 12,
    }));
    return { fetch, decode } satisfies WaveformDeps;
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('useAudioWaveform', () => {
    beforeEach(() => setLocalMediaPrefsStorage(new MemoryStore()));
    afterAll(() => setLocalMediaPrefsStorage());

    it('computes the bars from the file and keeps them', async () => {
        const deps = fakeDeps();
        const { result } = renderHook(() => useAudioWaveform(input, deps));

        await waitFor(() => expect(result.current).toHaveLength(WAVEFORM_BARS));
        expect(deps.fetch).toHaveBeenCalledWith(
            'https://cdn/a.m4a',
            expect.objectContaining({ signal: expect.anything() })
        );
        expect(readWaveform(me, 'up-1')).toEqual(result.current);
    });

    it('draws kept bars at once without downloading or decoding', () => {
        const kept = [0.2, 0.5, 1];
        writeWaveform(me, 'up-1', kept);
        const deps = fakeDeps();
        const { result } = renderHook(() => useAudioWaveform(input, deps));

        expect(result.current).toEqual(kept);
        expect(deps.fetch).not.toHaveBeenCalled();
        expect(deps.decode).not.toHaveBeenCalled();
    });

    it('does not try again a file kept as decorative', async () => {
        writeWaveform(me, 'up-1', 'decorative');
        const deps = fakeDeps();
        const { result } = renderHook(() => useAudioWaveform(input, deps));

        await flush();
        expect(result.current).toBeUndefined();
        expect(deps.fetch).not.toHaveBeenCalled();
        expect(deps.decode).not.toHaveBeenCalled();
    });

    it('keeps a failed decode as decorative, so the next visit does not try again', async () => {
        const deps = fakeDeps();
        deps.decode.mockRejectedValueOnce(new Error('bad format'));
        const { result } = renderHook(() => useAudioWaveform(input, deps));

        await waitFor(() => expect(readWaveform(me, 'up-1')).toBe('decorative'));
        expect(result.current).toBeUndefined();
    });

    it('remembers nothing for a failed download, and tries the fresh address when it arrives', async () => {
        const deps = fakeDeps();
        deps.fetch.mockResolvedValueOnce({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) });
        const { result, rerender } = renderHook(props => useAudioWaveform(props, deps), { initialProps: input });

        await waitFor(() => expect(deps.fetch).toHaveBeenCalledTimes(1));
        await flush();
        expect(readWaveform(me, 'up-1')).toBeUndefined();

        // The server's copy of the message brings a new signed address for the same upload.
        rerender({ ...input, url: 'https://cdn/a-fresh.m4a' });
        await waitFor(() => expect(result.current).toHaveLength(WAVEFORM_BARS));
        expect(deps.fetch).toHaveBeenLastCalledWith('https://cdn/a-fresh.m4a', expect.anything());
    });

    it('keeps nothing when the screen is left before the download finishes', async () => {
        const deps = fakeDeps();
        let finish: (value: { ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }) => void = () => undefined;
        deps.fetch.mockImplementationOnce(() => new Promise(resolve => (finish = resolve)));
        const { unmount } = renderHook(() => useAudioWaveform(input, deps));

        unmount();
        finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
        await flush();
        await flush();

        expect(deps.decode).not.toHaveBeenCalled();
        expect(readWaveform(me, 'up-1')).toBeUndefined();
    });

    it.each([
        ['no scope', { ...input, scope: undefined }],
        ['no upload id', { ...input, uploadId: undefined }],
        ['no address', { ...input, url: undefined }],
    ])('does nothing with %s', async (_label, partial) => {
        const deps = fakeDeps();
        const { result } = renderHook(() => useAudioWaveform(partial, deps));

        await flush();
        expect(result.current).toBeUndefined();
        expect(deps.fetch).not.toHaveBeenCalled();
    });
});
