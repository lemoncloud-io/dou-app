import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface WaveformProps {
    /**
     * Bar heights, each 0..1 of the waveform's height — usually 48, measured by the host from the
     * audio. Absent while nothing has been measured; the shape then comes from `seed`.
     */
    bars?: readonly number[];
    /**
     * Seeds the decorative shape drawn while `bars` is absent — the file's id, say — so one file
     * always shows the same shape and two files rarely show the same one.
     */
    seed?: string;
    /** How much has played, 0..1. Bars up to here are drawn in the played colour. */
    progress: number;
    /**
     * A position chosen on the waveform, 0..1 — the end of a tap or a drag, or an arrow key. Omit
     * and the waveform is a picture rather than a control.
     */
    onSeek?: (ratio: number) => void;
    /** Accessible name. */
    label?: string;
    /** Spoken value while it is a slider, e.g. "12:03 / 35:47". The percentage is used otherwise. */
    valueText?: string;
    className?: string;
}

/** How far one arrow key press moves, as a share of the whole length. */
const KEY_STEP = 0.05;

/** Bars never draw shorter than this share of the height, so a silent stretch still reads as a bar. */
const MIN_BAR = 0.04;

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0);

/** FNV-1a over the string's UTF-16 units — a cheap, stable 32-bit hash to seed the sequence with. */
const hashSeed = (seed: string): number => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < seed.length; i += 1) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

/** mulberry32: a tiny PRNG whose whole state is one 32-bit number, so a seed reproduces it exactly. */
const mulberry32 = (state: number) => () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * A waveform-looking shape for audio nothing has measured yet: `count` heights in (0, 1], the same
 * for the same seed every time. Random heights under a bell-shaped envelope, the way the design's
 * placeholder rises in the middle and tapers at both ends — pure noise reads as static, not speech.
 */
export const decorativeWaveform = (seed: string, count = 48): number[] => {
    const next = mulberry32(hashSeed(seed));
    const length = Math.max(0, Math.floor(count));
    return Array.from({ length }, (_, i) => {
        const envelope = Math.pow(Math.sin((Math.PI * (i + 0.5)) / length), 0.8);
        const height = (0.2 + 0.8 * envelope) * (0.3 + 0.7 * next());
        return Math.min(Math.max(height, MIN_BAR), 1);
    });
};

/**
 * The audio detail's big waveform (Figma "음성 상세 · 파일 정보" 6072:22440; before play 6072:22400,
 * playing 6072:22439): a 140px row of 4px rounded bars, played bars in navy and the rest idle grey.
 *
 * With `onSeek` it is also a slider: a tap or a drag across the bars picks a position by where the
 * finger is in the row, and the arrow keys step 5%. The only state held is the drag in progress — the
 * bars follow the finger, and the position is reported once, when the finger lifts, so the audio is
 * not asked to jump on every pixel.
 */
export const Waveform = ({
    bars,
    seed = '',
    progress,
    onSeek,
    label = 'Waveform',
    valueText,
    className,
}: WaveformProps) => {
    const heights = React.useMemo(() => bars ?? decorativeWaveform(seed), [bars, seed]);
    const [drag, setDrag] = React.useState<number | null>(null);
    const pointer = React.useRef<number | null>(null);

    const shown = clamp01(drag ?? progress);
    // A bar counts as played as soon as the position enters it, which is how the design colours the
    // bar the playhead is in.
    const playedCount = Math.ceil(shown * heights.length);
    const interactive = Boolean(onSeek);

    const ratioAt = (element: HTMLElement, clientX: number): number => {
        const box = element.getBoundingClientRect();
        return box.width > 0 ? clamp01((clientX - box.left) / box.width) : 0;
    };

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!onSeek || event.button !== 0 || pointer.current !== null) return;
        pointer.current = event.pointerId;
        // Capture keeps a drag that leaves the row (it is only as wide as the bars) still tracking.
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDrag(ratioAt(event.currentTarget, event.clientX));
    };

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (pointer.current !== event.pointerId) return;
        setDrag(ratioAt(event.currentTarget, event.clientX));
    };

    const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (pointer.current !== event.pointerId) return;
        pointer.current = null;
        setDrag(null);
        onSeek?.(ratioAt(event.currentTarget, event.clientX));
    };

    // A cancelled pointer (a scroll took over, the system stole it) is not a choice — drop the drag.
    const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
        if (pointer.current !== event.pointerId) return;
        pointer.current = null;
        setDrag(null);
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!onSeek) return;
        const current = clamp01(progress);
        const target =
            event.key === 'ArrowRight' || event.key === 'ArrowUp'
                ? current + KEY_STEP
                : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
                  ? current - KEY_STEP
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? 1
                      : null;
        if (target === null) return;
        event.preventDefault();
        onSeek(clamp01(target));
    };

    const percent = Math.round(shown * 100);

    return (
        <div
            role={interactive ? 'slider' : 'img'}
            aria-label={label}
            tabIndex={interactive ? 0 : undefined}
            aria-valuemin={interactive ? 0 : undefined}
            aria-valuemax={interactive ? 100 : undefined}
            aria-valuenow={interactive ? percent : undefined}
            aria-valuetext={interactive ? (valueText ?? `${percent}%`) : undefined}
            onPointerDown={interactive ? onPointerDown : undefined}
            onPointerMove={interactive ? onPointerMove : undefined}
            onPointerUp={interactive ? onPointerUp : undefined}
            onPointerCancel={interactive ? onPointerCancel : undefined}
            onKeyDown={interactive ? onKeyDown : undefined}
            className={cn(
                'flex h-[140px] w-full max-w-[300px] items-center justify-between gap-px',
                // A drag across the bars must not scroll the page or select the labels around it.
                interactive && 'cursor-pointer touch-none select-none outline-none',
                className
            )}
        >
            {heights.map((height, i) => (
                <span
                    key={i}
                    data-testid="waveform-bar"
                    data-played={i < playedCount ? 'true' : undefined}
                    className={cn(
                        'w-[4px] min-w-[2px] shrink rounded-[2px]',
                        i < playedCount ? 'bg-brand-ink' : 'bg-control-idle'
                    )}
                    style={{ height: `${Math.max(clamp01(height), MIN_BAR) * 100}%` }}
                />
            ))}
        </div>
    );
};
