import { useCallback, useEffect, useSyncExternalStore } from 'react';

/** The speeds the rate button steps through, wrapping back to the first. */
export const PLAYBACK_RATES = [1, 1.5, 2] as const;

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
    /** Whether `failed` came after playback had started, so the failure interrupted the listener. */
    failedWhilePlaying: boolean;
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
    failedWhilePlaying: false,
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
const pauseVoicesFor = (event: Event) => {
    const started = event.target;
    if (!(started instanceof HTMLMediaElement)) return;
    entries.forEach(entry => {
        if (entry.audio !== started && !entry.audio.paused) entry.audio.pause();
    });
};

const pauseEverythingBut = (started: HTMLMediaElement) => {
    entries.forEach(entry => {
        if (entry.audio !== started && !entry.audio.paused) entry.audio.pause();
    });
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
        error: () => update(entry, { playing: false, loading: false, failed: true, failedWhilePlaying: entry.started }),
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
