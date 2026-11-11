import { useEffect, useRef, useState, type RefObject, type SyntheticEvent } from 'react';

/** The voice files mounted in the window, each driven by `useInlineAudio`. */
const voices = new Set<HTMLMediaElement>();

/**
 * One sound at a time. A voice file starting pauses every other audio or video in the page, and any
 * audio or video starting pauses a voice file: two things talking over each other is never what the
 * second click meant. Videos among themselves are left as they were.
 *
 * `play` does not bubble, so this listens in the capture phase on the document — one listener for
 * every element, including the feed's `<video>` and the viewers', which this hook does not drive.
 */
const pauseOthers = (event: Event) => {
    const started = event.target;
    if (!(started instanceof HTMLMediaElement)) return;
    const others = voices.has(started) ? document.querySelectorAll<HTMLMediaElement>('audio, video') : voices;
    others.forEach(media => {
        if (media !== started && !media.paused) media.pause();
    });
};

export interface InlineAudio {
    /** Spread onto the hidden `<audio>` the player drives. */
    audioProps: {
        ref: RefObject<HTMLAudioElement | null>;
        src: string;
        preload: 'metadata';
        onPlay: () => void;
        onPause: () => void;
        onTimeUpdate: (event: SyntheticEvent<HTMLAudioElement>) => void;
        onDurationChange: (event: SyntheticEvent<HTMLAudioElement>) => void;
        onError: () => void;
    };
    playing: boolean;
    /** Seconds played. */
    time: number;
    /** Seconds long, once the file's header has arrived and names a finite length. */
    duration: number | undefined;
    /** The address could not be played — past its signature, say. */
    failed: boolean;
    toggle: () => void;
    seek: (seconds: number) => void;
}

/**
 * Plays a voice file in place, from its address: nothing is fetched into the page first, and only
 * the header is read (`preload="metadata"`) until it is played, so a feed of voice files costs a few
 * kilobytes each. Unmounting — the message leaving the page, the tile removed — stops it.
 */
export const useInlineAudio = (src: string): InlineAudio => {
    const ref = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState<number>();
    const [failed, setFailed] = useState(false);

    // A new address (a re-signed one) is a new file to the player: what the last one reported —
    // a failure past its signature above all — does not carry over.
    const [loadedSrc, setLoadedSrc] = useState(src);
    if (loadedSrc !== src) {
        setLoadedSrc(src);
        setPlaying(false);
        setTime(0);
        setDuration(undefined);
        setFailed(false);
    }

    useEffect(() => {
        const audio = ref.current;
        if (!audio) return undefined;
        if (voices.size === 0) document.addEventListener('play', pauseOthers, true);
        voices.add(audio);
        return () => {
            audio.pause();
            voices.delete(audio);
            if (voices.size === 0) document.removeEventListener('play', pauseOthers, true);
        };
    }, []);

    const toggle = () => {
        const audio = ref.current;
        if (!audio) return;
        if (!audio.paused) {
            audio.pause();
            return;
        }
        // Started inside the click, so the browser lets it play. An address it cannot load lands as
        // the element's `error`; the rejection here only repeats that, or is a play a pause cut short.
        void audio.play()?.catch(() => undefined);
    };

    const seek = (seconds: number) => {
        const audio = ref.current;
        if (audio) audio.currentTime = seconds;
        setTime(seconds);
    };

    return {
        audioProps: {
            ref,
            src,
            preload: 'metadata',
            onPlay: () => setPlaying(true),
            onPause: () => setPlaying(false),
            onTimeUpdate: event => setTime(event.currentTarget.currentTime),
            onDurationChange: event => {
                const length = event.currentTarget.duration;
                setDuration(Number.isFinite(length) ? length : undefined);
            },
            onError: () => {
                setPlaying(false);
                setFailed(true);
            },
        },
        playing,
        time,
        duration,
        failed,
        toggle,
        seek,
    };
};
