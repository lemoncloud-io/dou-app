import { act } from '@testing-library/react';

import {
    nextPlaybackRate,
    resetRoomAudioStore,
    selectTrack,
    useRoomAudioStore,
    type AudioTrack,
} from './roomAudioStore';

/** A media element as the store drives it: what was set, and whether `play`/`pause` ran. */
const fakeAudio = () => {
    const element = {
        src: '',
        currentTime: 0,
        // HAVE_NOTHING until a test says the header was read.
        readyState: 0,
        playbackRate: 1,
        defaultPlaybackRate: 1,
        play: jest.fn(() => Promise.resolve()),
        pause: jest.fn(),
        load: jest.fn(),
        removeAttribute: jest.fn((name: string) => {
            if (name === 'src') element.src = '';
        }),
    };
    return element;
};

const track = (n: number, over: Partial<AudioTrack> = {}): AudioTrack => ({
    key: `c1/up-${n}`,
    cid: 'c1',
    channelId: 'ch-1',
    chatId: `ch-1:${n}`,
    chatNo: n,
    idx: 0,
    uploadId: `up-${n}`,
    url: `https://cdn/${n}.m4a`,
    name: `${n}.m4a`,
    ...over,
});

const store = () => useRoomAudioStore.getState();

describe('roomAudioStore', () => {
    let audio: ReturnType<typeof fakeAudio>;

    beforeEach(() => {
        resetRoomAudioStore();
        audio = fakeAudio();
        store().attach(audio as unknown as HTMLMediaElement);
    });

    it('loads and plays a track inside the call that asked', () => {
        act(() => store().play(track(1)));

        expect(audio.src).toBe('https://cdn/1.m4a');
        expect(audio.play).toHaveBeenCalledTimes(1);
        expect(store().status).toBe('loading');

        act(() => store().onPlaying());
        expect(store().status).toBe('playing');
    });

    it('pauses the first track and keeps its position when a second one plays, then resumes there', () => {
        act(() => {
            store().play(track(1));
            store().onPlaying();
            store().onDuration(120);
            store().onTimeUpdate(42);
        });

        act(() => store().play(track(2)));
        expect(store().current?.key).toBe('c1/up-2');
        expect(store().positions['c1/up-1']).toBe(42);
        expect(audio.src).toBe('https://cdn/2.m4a');

        act(() => store().play(track(1)));
        expect(store().position).toBe(42);
        // The element has not read the header yet: the position is applied once it has.
        expect(audio.currentTime).toBe(0);
        act(() => store().onLoadedMetadata());
        expect(audio.currentTime).toBe(42);
    });

    it('toggles: a press on the playing track pauses it, another plays it again', () => {
        act(() => {
            store().toggle(track(1));
            store().onPlaying();
        });
        act(() => store().toggle(track(1)));
        expect(audio.pause).toHaveBeenCalledTimes(1);
        act(() => store().onPause());
        expect(store().status).toBe('paused');
        act(() => store().toggle(track(1)));
        expect(audio.play).toHaveBeenCalledTimes(2);
    });

    it('keeps one speed for every track and applies a change at once', () => {
        act(() => {
            store().play(track(1));
            store().cycleRate();
        });
        expect(store().rate).toBe(1.5);
        expect(audio.playbackRate).toBe(1.5);

        act(() => store().play(track(2)));
        expect(audio.playbackRate).toBe(1.5);
        expect(audio.defaultPlaybackRate).toBe(1.5);
    });

    it('cycles 1x → 1.5x → 2x → 1x', () => {
        expect(nextPlaybackRate(1)).toBe(1.5);
        expect(nextPlaybackRate(1.5)).toBe(2);
        expect(nextPlaybackRate(2)).toBe(1);
        expect(nextPlaybackRate(3)).toBe(1);
    });

    it('seeks and skips within the length', () => {
        act(() => {
            store().play(track(1));
            audio.readyState = 1;
            store().onDuration(100);
            store().seek(30);
        });
        expect(audio.currentTime).toBe(30);
        act(() => store().skip(15));
        expect(store().position).toBe(45);
        act(() => store().skip(-60));
        expect(store().position).toBe(0);
        act(() => store().skip(500));
        expect(store().position).toBe(100);
    });

    it('seeks a stream that reports no length once its header is read, and the clock keeps running', () => {
        act(() => {
            store().play(track(1));
            audio.readyState = 1;
            store().onDuration(Number.POSITIVE_INFINITY);
            store().seek(30);
        });
        expect(audio.currentTime).toBe(30);
        act(() => store().onTimeUpdate(31));
        expect(store().position).toBe(31);
    });

    it('lets a seek made before the header replace the resume position', () => {
        act(() => {
            store().play(track(1));
            store().onDuration(100);
            store().onTimeUpdate(42);
            store().play(track(2));
            store().play(track(1));
            store().seek(10);
            store().onLoadedMetadata();
        });
        expect(audio.currentTime).toBe(10);
    });

    it('resumes from where it was on a fresh address, and settles to paused on a failure', () => {
        act(() => {
            store().play(track(1));
            store().onPlaying();
            store().onTimeUpdate(20);
            store().onFailed();
        });
        expect(store().status).toBe('paused');
        act(() => store().updateUrl('c1/up-1', 'https://cdn/1-fresh.m4a'));
        expect(store().status).toBe('loading');
        expect(audio.play).toHaveBeenCalledTimes(2);
    });

    it('moves a track that is not loaded without touching the element', () => {
        act(() => store().seekTrack('c1/up-9', 12));
        expect(store().positions['c1/up-9']).toBe(12);
        expect(audio.currentTime).toBe(0);
    });

    it('stops and unloads, keeping the position; reset forgets every position', () => {
        act(() => {
            store().play(track(1));
            store().onTimeUpdate(9);
            store().stop();
        });
        expect(store().current).toBeNull();
        expect(store().status).toBe('idle');
        expect(audio.removeAttribute).toHaveBeenCalledWith('src');
        expect(store().positions['c1/up-1']).toBe(9);

        act(() => store().reset());
        expect(store().positions).toEqual({});
    });

    it('swaps in a fresh address for the current track and plays on from where it was', () => {
        act(() => {
            store().play(track(1));
            store().onDuration(60);
            store().onTimeUpdate(20);
            store().updateUrl('c1/up-1', 'https://cdn/1-fresh.m4a');
        });
        expect(audio.src).toBe('https://cdn/1-fresh.m4a');
        act(() => store().onLoadedMetadata());
        expect(audio.currentTime).toBe(20);
        // Another track's new address is the bubble's business, not the player's.
        act(() => store().updateUrl('c1/up-2', 'https://cdn/2-fresh.m4a'));
        expect(audio.src).toBe('https://cdn/1-fresh.m4a');
    });

    it('unloads a track marked unplayable', () => {
        act(() => {
            store().play(track(1));
            store().markUnplayable('c1/up-1');
        });
        expect(store().current).toBeNull();
        expect(selectTrack('c1/up-1')(store()).unplayable).toBe(true);
    });

    it('rewinds a finished track to the start', () => {
        act(() => {
            store().play(track(1));
            store().onTimeUpdate(59);
            store().onEnded();
        });
        expect(store().status).toBe('paused');
        expect(store().position).toBe(0);
    });

    it('views a track that is not loaded as idle, at the position it was left', () => {
        act(() => {
            store().play(track(1));
            store().onDuration(80);
            store().onTimeUpdate(5);
            store().play(track(2));
        });
        expect(selectTrack('c1/up-1')(store())).toEqual({
            status: 'idle',
            position: 5,
            duration: 80,
            unplayable: false,
            active: false,
        });
        expect(selectTrack('c1/up-2')(store()).active).toBe(true);
    });

    it('does nothing without an element', () => {
        store().attach(null);
        act(() => store().play(track(1)));
        expect(store().current).toBeNull();
    });
});
