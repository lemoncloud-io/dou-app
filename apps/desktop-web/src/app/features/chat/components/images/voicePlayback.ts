import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import i18next from 'i18next';

import { toast } from '@chatic/ui-kit/components/ui/use-toast';

/** The speeds the rate button steps through, wrapping back to the first. */
const PLAYBACK_RATES = [1, 1.5, 2] as const;

export interface VoiceSnapshot {
    playing: boolean;
    /** Started, but waiting for enough of the file to sound — the first press, or a seek ahead. */
    loading: boolean;
    /** Seconds played. */
    time: number;
    /** Seconds long, once the file's header has arrived and names a finite length. */
    duration: number | undefined;
    /** The address could not be played — past its signature, or a format the browser cannot decode. */
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

/**
 * One player per address, shared by everything that shows that file — the card in the feed, the
 * detail dialog, a tray tile — so the dialog picks up where the card is, at the card's speed, and
 * the card shows what the dialog did. The element is never put in the document: moving a playing
 * element between two hosts would pause it.
 */
const entries = new Map<string, Entry>();

const update = (entry: Entry, patch: Partial<VoiceSnapshot>) => {
    entry.snapshot = { ...entry.snapshot, ...patch };
    entry.listeners.forEach(listener => listener());
};

/**
 * One sound at a time. A voice file starting pauses every other voice file and every audio or video
 * in the page; any audio or video in the page starting pauses the voice files. Videos among
 * themselves are left as they were.
 */
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
            // Said once, by the player — not by each view of the file, of which there can be several (the
            // feed and the thread, the card and the dialog). Only when it broke off someone listening: a
            // file that cannot be played before anyone pressed play says so on its card alone.
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

/** How many views hold a file, across every address — the document listener lives while any does. */
let holding = 0;

const hold = (src: string) => {
    // `play` does not bubble: the capture phase on the document hears every element in the page.
    if (holding === 0) document.addEventListener('play', pauseVoicesFor, true);
    holding += 1;
    entryFor(src).holders += 1;
};

/** The last thing showing a file letting go of it stops it: leaving the conversation stops what played there. */
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

/** The element behind an address, for tests that stand in for playback jsdom does not implement. */
export const voiceElementFor = (src: string): HTMLAudioElement | undefined => entries.get(src)?.audio;

export interface VoicePlayback extends VoiceSnapshot {
    toggle: () => void;
    seek: (seconds: number) => void;
    /** Moves by `seconds` (negative = back), held inside the file. */
    skip: (seconds: number) => void;
    /** 1x → 1.5x → 2x → 1x. */
    cycleRate: () => void;
}

/**
 * Plays a voice file from its address, shared with every other view of the same address. Nothing is
 * fetched into the page first, and only the header is read (`preload="metadata"`) until it is played,
 * so a feed of voice files costs a few kilobytes each.
 */
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
        // Started inside the click, so the browser lets it play. An address it cannot load lands as
        // the element's `error`; a play a pause cut short lands as `pause`. A play the browser refuses
        // outright (no gesture) fires no element event, so the wait is cleared here — on the entry the
        // play was asked of: one released meanwhile is gone, and looking it up again would rebuild it.
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

/**
 * Keeps `--seek-progress` on an element in step with the file as it plays, every frame. The player's
 * own `timeupdate` comes about four times a second, which moves a fill in visible steps; while the
 * file plays, the element's style is written straight from the audio's clock instead, outside React.
 * Paused or stopped, it shows `played` (0–1) as the state has it.
 */
export const useSmoothProgress = <T extends HTMLElement>(src: string, playing: boolean, played: number) => {
    // A callback ref, not an object one: the element sits in a dialog portal, which mounts it a render
    // after the dialog's first, and an effect keyed on a ref object would never see it arrive.
    const [element, setElement] = useState<T | null>(null);
    // A playing file is painted from its clock; the state's ratio lags it and would pull the fill back.
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
