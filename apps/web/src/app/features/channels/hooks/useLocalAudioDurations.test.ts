import { act, renderHook } from '@testing-library/react';

import { useLocalAudioDurations } from './useLocalAudioDurations';

/** A stand-in `Audio` the test can make report a length or fail. */
class FakeAudio {
    static made: FakeAudio[] = [];
    preload = '';
    src = '';
    duration = Number.NaN;
    onloadedmetadata: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
        FakeAudio.made.push(this);
    }
    removeAttribute() {
        this.src = '';
    }
}

describe('useLocalAudioDurations', () => {
    const revoke = jest.fn();

    beforeEach(() => {
        FakeAudio.made = [];
        revoke.mockReset();
        (globalThis as unknown as { Audio: unknown }).Audio = FakeAudio;
        URL.createObjectURL = jest.fn(() => 'blob:local');
        URL.revokeObjectURL = revoke;
    });

    it('reads each page file’s length from its header and lets the object address go', () => {
        const file = new File(['x'], 'take.m4a', { type: 'audio/mp4' });
        const items = [file];
        const { result } = renderHook(() => useLocalAudioDurations(items));
        expect(FakeAudio.made).toHaveLength(1);
        expect(FakeAudio.made[0]?.src).toBe('blob:local');

        act(() => {
            const audio = FakeAudio.made[0]!;
            audio.duration = 42;
            audio.onloadedmetadata?.();
        });
        expect(result.current.get(file)).toBe(42);
        expect(revoke).toHaveBeenCalledWith('blob:local');
    });

    it('leaves a file it cannot read, and one the shell keeps, without a length', () => {
        const file = new File(['x'], 'broken.m4a', { type: 'audio/mp4' });
        const shellFile = {
            uri: 'file:///pick/a.m4a',
            name: 'a.m4a',
            type: 'audio/mp4',
            size: 10,
            kind: 'file' as const,
        };
        const items = [file, shellFile];
        const { result } = renderHook(() => useLocalAudioDurations(items));
        // The shell's file is not readable by the page: no element is made for it.
        expect(FakeAudio.made).toHaveLength(1);
        act(() => FakeAudio.made[0]?.onerror?.());
        expect(result.current.size).toBe(0);
        expect(revoke).toHaveBeenCalled();
    });
});
