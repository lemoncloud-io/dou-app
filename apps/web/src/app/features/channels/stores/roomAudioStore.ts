import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export const PLAYBACK_RATES = [1, 1.5, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export const nextPlaybackRate = (rate: number): PlaybackRate => {
    const at = PLAYBACK_RATES.indexOf(rate as PlaybackRate);
    return PLAYBACK_RATES[(at + 1) % PLAYBACK_RATES.length] ?? 1;
};

export interface AudioTrack {
    key: string;
    cid: string;
    channelId: string;
    chatId: string;
    chatNo: number;
    idx: number;
    uploadId?: string;
    url: string;
    name?: string;
    size?: number;
    senderName?: string;
    sentAt?: number;
    threadRootNo?: string;
}

export type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused';

interface RoomAudioState {
    current: AudioTrack | null;
    status: AudioStatus;
    position: number;
    duration: number | undefined;
    positions: Record<string, number>;
    durations: Record<string, number>;
    rate: PlaybackRate;
    unplayable: Record<string, true>;
    refreshed: Record<string, true>;
}

interface RoomAudioActions {
    attach: (element: HTMLMediaElement | null) => void;
    play: (track: AudioTrack) => void;
    toggle: (track: AudioTrack) => void;
    pause: () => void;
    seek: (seconds: number) => void;
    seekTrack: (key: string, seconds: number) => void;
    skip: (delta: number) => void;
    cycleRate: () => void;
    stop: () => void;
    reset: () => void;
    updateUrl: (key: string, url: string) => void;
    markRefreshed: (url: string) => void;
    markUnplayable: (key: string) => void;

    onPlaying: () => void;
    onPause: () => void;
    onWaiting: () => void;
    onTimeUpdate: (seconds: number) => void;
    onDuration: (seconds: number) => void;
    onLoadedMetadata: () => void;
    onEnded: () => void;
    onFailed: () => void;
}

export type RoomAudioStore = RoomAudioState & RoomAudioActions;

let element: HTMLMediaElement | null = null;
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
            audio.defaultPlaybackRate = state.rate;
            audio.playbackRate = state.rate;
        } else {
            set({ status: 'loading' });
        }
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
        if (element) element.currentTime = 0;
        set(state => ({ status: 'paused', position: 0, positions: { ...state.positions, [current.key]: 0 } }));
    },
}));

export interface TrackView {
    status: AudioStatus;
    position: number;
    duration: number | undefined;
    unplayable: boolean;
    active: boolean;
}

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

export const useAudioTrack = (key: string | undefined): TrackView => useRoomAudioStore(useShallow(selectTrack(key)));

export const resetRoomAudioStore = (): void => {
    element = null;
    pendingSeek = null;
    useRoomAudioStore.setState(initial);
};
