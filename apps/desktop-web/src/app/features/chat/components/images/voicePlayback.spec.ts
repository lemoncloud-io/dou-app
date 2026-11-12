import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useVoicePlayback, voiceElementFor } from './voicePlayback';

// jsdom implements no playback: `play()` only logs. These stand in for the element's own methods,
// and the tests fire the events a browser would.
let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
        Object.defineProperty(this, 'paused', { configurable: true, value: false });
        fireEvent.play(this);
        return Promise.resolve();
    });
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
        Object.defineProperty(this, 'paused', { configurable: true, value: true });
        fireEvent.pause(this);
    });
});

afterEach(() => {
    cleanup();
    play.mockRestore();
    pause.mockRestore();
});

const elementOf = (src: string) => voiceElementFor(src) as HTMLAudioElement;

describe('useVoicePlayback', () => {
    it('shares position and speed between two views of one file', () => {
        const card = renderHook(() => useVoicePlayback('https://s/a'));
        const dialog = renderHook(() => useVoicePlayback('https://s/a'));

        act(() => card.result.current.toggle());
        expect(dialog.result.current.playing).toBe(true);

        act(() => dialog.result.current.seek(42));
        expect(card.result.current.time).toBe(42);

        act(() => dialog.result.current.cycleRate());
        expect(card.result.current.rate).toBe(1.5);
        expect(elementOf('https://s/a').playbackRate).toBe(1.5);
    });

    it('steps the speed 1x, 1.5x, 2x and back to 1x', () => {
        const { result } = renderHook(() => useVoicePlayback('https://s/a'));
        const rates = [1, 2, 3].map(() => {
            act(() => result.current.cycleRate());
            return result.current.rate;
        });
        expect(rates).toEqual([1.5, 2, 1]);
    });

    it('pauses the first file when another starts, and keeps where the first was', () => {
        const first = renderHook(() => useVoicePlayback('https://s/a'));
        const second = renderHook(() => useVoicePlayback('https://s/b'));

        act(() => first.result.current.toggle());
        act(() => first.result.current.seek(12));
        act(() => second.result.current.toggle());

        expect(first.result.current.playing).toBe(false);
        expect(first.result.current.time).toBe(12);
        expect(second.result.current.playing).toBe(true);
    });

    it('is paused by a video starting in the page', () => {
        const { result } = renderHook(() => useVoicePlayback('https://s/a'));
        act(() => result.current.toggle());

        const video = document.body.appendChild(document.createElement('video'));
        act(() => {
            fireEvent.play(video);
        });
        expect(result.current.playing).toBe(false);
        video.remove();
    });

    it('keeps playing while one view still holds the file, and stops when the last lets go', () => {
        const card = renderHook(() => useVoicePlayback('https://s/a'));
        const dialog = renderHook(() => useVoicePlayback('https://s/a'));
        act(() => card.result.current.toggle());
        const audio = elementOf('https://s/a');

        card.unmount();
        expect(audio.paused).toBe(false);
        expect(dialog.result.current.playing).toBe(true);

        dialog.unmount();
        expect(audio.paused).toBe(true);
        expect(voiceElementFor('https://s/a')).toBeUndefined();
    });

    it('moves fifteen seconds without leaving the file', () => {
        const { result } = renderHook(() => useVoicePlayback('https://s/a'));
        const audio = elementOf('https://s/a');
        Object.defineProperty(audio, 'duration', { configurable: true, value: 20 });
        act(() => {
            fireEvent.durationChange(audio);
        });

        act(() => result.current.skip(15));
        expect(result.current.time).toBe(15);
        act(() => result.current.skip(15));
        expect(result.current.time).toBe(20);
        act(() => result.current.skip(-60));
        expect(result.current.time).toBe(0);
    });

    it('stops waiting when the browser refuses to play', async () => {
        play.mockImplementationOnce(() => Promise.reject(new DOMException('no gesture', 'NotAllowedError')));
        const { result } = renderHook(() => useVoicePlayback('https://s/a'));
        await act(async () => result.current.toggle());
        expect(result.current.loading).toBe(false);
        expect(result.current.playing).toBe(false);
    });

    it('does not bring a released file back when its play is cut short afterwards', async () => {
        let refuse: (reason: unknown) => void = () => undefined;
        play.mockImplementationOnce(() => new Promise((_, reject) => (refuse = reject)));
        const { result, unmount } = renderHook(() => useVoicePlayback('https://s/a'));
        act(() => result.current.toggle());
        unmount();
        await act(async () => refuse(new DOMException('aborted', 'AbortError')));
        expect(voiceElementFor('https://s/a')).toBeUndefined();
    });

    it('says a failure interrupted the listener only when it came after playback started', () => {
        const idle = renderHook(() => useVoicePlayback('https://s/a'));
        act(() => {
            fireEvent.error(elementOf('https://s/a'));
        });
        expect(idle.result.current.failed).toBe(true);
        expect(idle.result.current.failedWhilePlaying).toBe(false);

        const playing = renderHook(() => useVoicePlayback('https://s/b'));
        act(() => playing.result.current.toggle());
        act(() => {
            fireEvent.error(elementOf('https://s/b'));
        });
        expect(playing.result.current.failedWhilePlaying).toBe(true);
        expect(playing.result.current.playing).toBe(false);
    });
});
