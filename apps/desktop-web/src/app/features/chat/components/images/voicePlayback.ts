import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import i18next from 'i18next';

import { toast } from '@chatic/ui-kit';

const PLAYBACK_RATES = [1, 1.5, 2] as const;

export interface VoiceSnapshot {
    playing: boolean;
    loading: boolean;
    time: number;
    duration: number | undefined;
    failed: boolean;
    rate: number;
}

interface Entry {
    audio: HTMLAudioElement;
    snapshot: VoiceSnapshot;
    listeners: Set<() => void>;
    holders: number;
    started: boolean;
    detach: () => void;
}

const INITIAL: VoiceSnapshot = {
    playing: false,
    loading: false,
    time: 0,
    duration: undefined,
    failed: false,
    rate: 1,
};

const entries = new Map<string, Entry>();

const update = (entry: Entry, patch: Partial<VoiceSnapshot>) => {
    entry.snapshot = { ...entry.snapshot, ...patch };
    entry.listeners.forEach(listener => listener());
};

const pauseOtherVoices = (started: HTMLMediaElement) =>
    entries.forEach(entry => {
        if (entry.audio !== started && !entry.audio.paused) entry.audio.pause();
    });

const pauseVoicesFor = (event: Event) => {
    if (event.target instanceof HTMLMediaElement) pauseOtherVoices(event.target);
};

const pauseEverythingBut = (started: HTMLMediaElement) => {
    pauseOtherVoices(started);
    document.querySelectorAll<HTMLMediaElement>('audio, video').forEach(media => {
        if (media !== started && !media.paused) media.pause();
    });
};

const create = (src: string): Entry => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = src;
    const entry: Entry = {
        audio,
        snapshot: INITIAL,
        listeners: new Set(),
        holders: 0,
        started: false,
        detach: () => undefined,
    };
    const handlers: Record<string, () => void> = {
        play: () => {
            entry.started = true;
            pauseEverythingBut(audio);
            update(entry, { playing: true });
        },
        playing: () => update(entry, { loading: false }),
        waiting: () => update(entry, { loading: !audio.paused }),
        pause: () => update(entry, { playing: false, loading: false }),
        timeupdate: () => update(entry, { time: audio.currentTime }),
        durationchange: () => update(entry, { duration: Number.isFinite(audio.duration) ? audio.duration : undefined }),
        ratechange: () => update(entry, { rate: audio.playbackRate }),
        error: () => {
            update(entry, { playing: false, loading: false, failed: true });
            if (entry.started) toast({ variant: 'destructive', description: i18next.t('chat.voice.playFailedToast') });
        },
    };
    Object.entries(handlers).forEach(([type, handler]) => audio.addEventListener(type, handler));
    entry.detach = () =>
        Object.entries(handlers).forEach(([type, handler]) => audio.removeEventListener(type, handler));
    return entry;
};

const entryFor = (src: string): Entry => {
    let entry = entries.get(src);
    if (!entry) {
        entry = create(src);
        entries.set(src, entry);
    }
    return entry;
};

let holding = 0;

const hold = (src: string) => {
    if (holding === 0) document.addEventListener('play', pauseVoicesFor, true);
    holding += 1;
    entryFor(src).holders += 1;
};

const release = (src: string) => {
    holding -= 1;
    if (holding === 0) document.removeEventListener('play', pauseVoicesFor, true);
    const entry = entries.get(src);
    if (!entry) return;
    entry.holders -= 1;
    if (entry.holders > 0) return;
    entry.audio.pause();
    entry.detach();
    entries.delete(src);
};

export const voiceElementFor = (src: string): HTMLAudioElement | undefined => entries.get(src)?.audio;

export interface VoicePlayback extends VoiceSnapshot {
    toggle: () => void;
    seek: (seconds: number) => void;
    skip: (seconds: number) => void;
    cycleRate: () => void;
}

export const useVoicePlayback = (src: string): VoicePlayback => {
    useEffect(() => {
        hold(src);
        return () => release(src);
    }, [src]);

    const subscribe = useCallback(
        (listener: () => void) => {
            const entry = entryFor(src);
            entry.listeners.add(listener);
            return () => {
                entries.get(src)?.listeners.delete(listener);
            };
        },
        [src]
    );
    const snapshot = useSyncExternalStore(subscribe, () => entries.get(src)?.snapshot ?? INITIAL);

    const toggle = useCallback(() => {
        const entry = entryFor(src);
        const { audio } = entry;
        if (!audio.paused) {
            audio.pause();
            return;
        }
        update(entry, { loading: true });
        void audio.play()?.catch(() => update(entry, { loading: false }));
    }, [src]);

    const seek = useCallback(
        (seconds: number) => {
            const entry = entryFor(src);
            entry.audio.currentTime = seconds;
            update(entry, { time: seconds });
        },
        [src]
    );

    const skip = useCallback(
        (seconds: number) => {
            const entry = entryFor(src);
            const end = entry.snapshot.duration ?? Number.POSITIVE_INFINITY;
            seek(Math.min(Math.max(0, entry.audio.currentTime + seconds), end));
        },
        [seek, src]
    );

    const cycleRate = useCallback(() => {
        const entry = entryFor(src);
        const index = PLAYBACK_RATES.indexOf(entry.snapshot.rate as (typeof PLAYBACK_RATES)[number]);
        const next = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length];
        entry.audio.playbackRate = next;
        update(entry, { rate: next });
    }, [src]);

    return { ...snapshot, toggle, seek, skip, cycleRate };
};

export const useSmoothProgress = <T extends HTMLElement>(src: string, playing: boolean, played: number) => {
    const [element, setElement] = useState<T | null>(null);
    const settled = playing ? -1 : played;
    useEffect(() => {
        if (!element) return;
        const paint = (ratio: number) =>
            element.style.setProperty('--seek-progress', `${Math.min(1, Math.max(0, ratio)) * 100}%`);
        if (!playing) {
            paint(settled);
            return;
        }
        const audio = voiceElementFor(src);
        if (!audio) return;
        let frame = 0;
        const step = () => {
            if (Number.isFinite(audio.duration) && audio.duration > 0) paint(audio.currentTime / audio.duration);
            frame = requestAnimationFrame(step);
        };
        step();
        return () => cancelAnimationFrame(frame);
    }, [element, src, playing, settled]);
    return setElement;
};
