import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

/** The speeds a press of the speed chip steps through, in order, back to the first. */
export const PLAYBACK_RATES = [1, 1.5, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

/** The speed after `rate` in the cycle. A speed outside the cycle starts it over. */
export const nextPlaybackRate = (rate: number): PlaybackRate => {
    const at = PLAYBACK_RATES.indexOf(rate as PlaybackRate);
    return PLAYBACK_RATES[(at + 1) % PLAYBACK_RATES.length] ?? 1;
};

/** One audio upload of one message — what the room's player can load. */
export interface AudioTrack {
    /** The upload's key as the message's cards have it — `<cid>/<uploadId>`. Positions are kept under it. */
    key: string;
    cid: string;
    channelId: string;
    chatId: string;
    chatNo: number;
    /** The upload's position in the message's `upload$$`. */
    idx: number;
    uploadId?: string;
    /** The signed address it plays from. */
    url: string;
    name?: string;
    size?: number;
    senderName?: string;
    /** When the message was sent, epoch ms. */
    sentAt?: number;
    /** Set for a reply: the root's chatNo, which names the thread page that draws it. */
    threadRootNo?: string;
}

/**
 * - `loading` — asked to play, nothing heard yet (or the network stalled it);
 * - `playing` / `paused` — the element said so;
 * - `idle` — nothing is loaded.
 */
export type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused';

interface RoomAudioState {
    current: AudioTrack | null;
    status: AudioStatus;
    /** Seconds into `current`. */
    position: number;
    /** `current`'s length once the file's header named a finite one. */
    duration: number | undefined;
    /** Where each track was left, by key — a track started again resumes there. */
    positions: Record<string, number>;
    /** Lengths learned so far, by key: a bubble shows one only after its file was loaded once. */
    durations: Record<string, number>;
    /** One speed for every track (and every room), applied at once to what is playing. */
    rate: PlaybackRate;
    /** Tracks the player could not play even from a fresh address — a format this system does not decode. */
    unplayable: Record<string, true>;
    /** Addresses already read again once after a failure (a fresh one is marked too). */
    refreshed: Record<string, true>;
}

interface RoomAudioActions {
    /** The page's one `<audio>`; `null` when the host unmounts. */
    attach: (element: HTMLMediaElement | null) => void;
    /** Play `track`, pausing whatever else was playing (and keeping where it was). Call it inside the tap. */
    play: (track: AudioTrack) => void;
    /** Pause when `track` is playing or loading, play it otherwise. */
    toggle: (track: AudioTrack) => void;
    pause: () => void;
    /** Move the current track to `seconds`. */
    seek: (seconds: number) => void;
    /** Move a track: the current one plays from there, any other starts there next time. */
    seekTrack: (key: string, seconds: number) => void;
    /** Jump by `delta` seconds within the current track. */
    skip: (delta: number) => void;
    cycleRate: () => void;
    /** Stop and unload — the mini player's ×, a deleted or hidden message. Positions stay. */
    stop: () => void;
    /** Stop, unload and forget every position — leaving the room. */
    reset: () => void;
    /** A fresh signed address for `key` after a failed play: the current track plays on from where it was. */
    updateUrl: (key: string, url: string) => void;
    /** Records that `url` was read again after an error, or is the fresh address that answered. */
    markRefreshed: (url: string) => void;
    /** Records that `key` cannot be played here, and unloads it if it is the current track. */
    markUnplayable: (key: string) => void;

    // What the element reports, wired by the host.
    onPlaying: () => void;
    onPause: () => void;
    onWaiting: () => void;
    onTimeUpdate: (seconds: number) => void;
    onDuration: (seconds: number) => void;
    onLoadedMetadata: () => void;
    onEnded: () => void;
    /** The element failed: nothing plays, and the press that comes next starts it again. */
    onFailed: () => void;
}

export type RoomAudioStore = RoomAudioState & RoomAudioActions;

let element: HTMLMediaElement | null = null;
// A position asked for before the element knew the file's length: applied once it does.
let pendingSeek: number | null = null;

const initial: RoomAudioState = {
    current: null,
    status: 'idle',
    position: 0,
    duration: undefined,
    positions: {},
    durations: {},
    rate: 1,
    unplayable: {},
    refreshed: {},
};

const finite = (value: number): number | undefined => (Number.isFinite(value) && value > 0 ? value : undefined);

/**
 * The room's audio player: one `<audio>` the room screens share, and what it is playing.
 *
 * Every surface that shows an audio file — the bubble in the room or a thread, the mini player, the
 * detail screen, the room's file list — reads this one state and asks this one player. A bubble that
 * owned its own element lost its position when the row unmounted (a shrunk message window, a thread
 * opened), and two surfaces could not agree on where the same file was. The element belongs to the
 * channel screens' host (`RoomAudioHost`), which outlives the room, thread and detail routes and stops
 * the player when the channel is left.
 *
 * `play` must run inside the tap that asked for it: the WebView lets only a gesture start sound.
 */
export const useRoomAudioStore = create<RoomAudioStore>((set, get) => ({
    ...initial,

    attach: next => {
        element = next;
        if (next) {
            next.playbackRate = get().rate;
            next.defaultPlaybackRate = get().rate;
        }
    },

    play: track => {
        const audio = element;
        if (!audio) return;
        const state = get();
        const switching = state.current?.key !== track.key;
        if (switching) {
            const positions = state.current
                ? { ...state.positions, [state.current.key]: state.position }
                : state.positions;
            const resumeAt = positions[track.key] ?? 0;
            pendingSeek = resumeAt > 0 ? resumeAt : null;
            set({
                current: track,
                status: 'loading',
                position: resumeAt,
                duration: state.durations[track.key],
                positions,
            });
            audio.src = track.url;
            // A new source resets the speed to the default one; both carry the chosen speed.
            audio.defaultPlaybackRate = state.rate;
            audio.playbackRate = state.rate;
        } else {
            set({ status: 'loading' });
        }
        // An address it cannot load lands as the element's `error`; the rejection only repeats that,
        // or is a play a pause cut short.
        void audio.play()?.catch(() => undefined);
    },

    toggle: track => {
        const { current, status } = get();
        if (current?.key === track.key && (status === 'playing' || status === 'loading')) {
            get().pause();
            return;
        }
        get().play(track);
    },

    pause: () => {
        element?.pause();
    },

    seek: seconds => {
        const { current, duration } = get();
        if (!current) return;
        const target = Math.max(0, duration ? Math.min(seconds, duration) : seconds);
        // Applied at once once the element has read the file's header, whatever length it reported
        // (a stream can report none); before that it waits for `loadedmetadata`, replacing any resume.
        if (element && element.readyState >= 1) {
            element.currentTime = target;
            pendingSeek = null;
        } else pendingSeek = target;
        set(state => ({ position: target, positions: { ...state.positions, [current.key]: target } }));
    },

    seekTrack: (key, seconds) => {
        if (get().current?.key === key) {
            get().seek(seconds);
            return;
        }
        set(state => ({ positions: { ...state.positions, [key]: Math.max(0, seconds) } }));
    },

    skip: delta => {
        get().seek(get().position + delta);
    },

    cycleRate: () => {
        const rate = nextPlaybackRate(get().rate);
        if (element) {
            element.playbackRate = rate;
            element.defaultPlaybackRate = rate;
        }
        set({ rate });
    },

    stop: () => {
        const { current, position } = get();
        if (element) {
            element.pause();
            element.removeAttribute('src');
            element.load?.();
        }
        pendingSeek = null;
        set(state => ({
            current: null,
            status: 'idle',
            position: 0,
            duration: undefined,
            positions: current ? { ...state.positions, [current.key]: position } : state.positions,
        }));
    },

    reset: () => {
        get().stop();
        set({ positions: {}, refreshed: {} });
    },

    updateUrl: (key, url) => {
        const { current, position } = get();
        if (!current || current.key !== key || current.url === url || !element) return;
        // Only a failed play asks for this, so it plays on from where it stopped.
        pendingSeek = position > 0 ? position : null;
        set({ current: { ...current, url }, status: 'loading' });
        element.src = url;
        element.defaultPlaybackRate = get().rate;
        element.playbackRate = get().rate;
        void element.play()?.catch(() => undefined);
    },

    markRefreshed: url => set(state => ({ refreshed: { ...state.refreshed, [url]: true } })),

    markUnplayable: key => {
        set(state => ({ unplayable: { ...state.unplayable, [key]: true } }));
        if (get().current?.key === key) get().stop();
    },

    onPlaying: () => {
        if (get().current) set({ status: 'playing' });
    },
    onPause: () => {
        const { current, position } = get();
        if (!current) return;
        set(state => ({ status: 'paused', positions: { ...state.positions, [current.key]: position } }));
    },
    onWaiting: () => {
        if (get().status === 'playing') set({ status: 'loading' });
    },
    onTimeUpdate: seconds => {
        if (get().current && pendingSeek === null) set({ position: seconds });
    },
    onDuration: seconds => {
        const { current } = get();
        const length = finite(seconds);
        if (!current || length === undefined) return;
        set(state => ({ duration: length, durations: { ...state.durations, [current.key]: length } }));
    },
    onLoadedMetadata: () => {
        if (pendingSeek === null || !element) return;
        element.currentTime = pendingSeek;
        set({ position: pendingSeek });
        pendingSeek = null;
    },
    onFailed: () => {
        if (get().current) set({ status: 'paused' });
    },
    onEnded: () => {
        const { current } = get();
        if (!current) return;
        // Finished: back to the start, so the next press plays it again from the top.
        if (element) element.currentTime = 0;
        set(state => ({ status: 'paused', position: 0, positions: { ...state.positions, [current.key]: 0 } }));
    },
}));

/** What a surface draws for one track: the player's state when it is the current one, else where it was left. */
export interface TrackView {
    status: AudioStatus;
    position: number;
    duration: number | undefined;
    unplayable: boolean;
    /** It is the loaded track — playing, paused or loading. */
    active: boolean;
}

/** Reads one track's view off the store. */
export const selectTrack =
    (key: string | undefined) =>
    (state: RoomAudioStore): TrackView => {
        const active = !!key && state.current?.key === key;
        return {
            status: active ? state.status : 'idle',
            position: active ? state.position : key ? (state.positions[key] ?? 0) : 0,
            duration: active ? (state.duration ?? state.durations[key ?? '']) : key ? state.durations[key] : undefined,
            unplayable: !!key && !!state.unplayable[key],
            active,
        };
    };

/** One track's view, re-rendering only when it changes. */
export const useAudioTrack = (key: string | undefined): TrackView => useRoomAudioStore(useShallow(selectTrack(key)));

/** Test seam: back to nothing loaded, the default speed and no element. */
export const resetRoomAudioStore = (): void => {
    element = null;
    pendingSeek = null;
    useRoomAudioStore.setState(initial);
};
