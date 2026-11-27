import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface WaveformProps {
    bars?: readonly number[];
    seed?: string;
    progress: number;
    onSeek?: (ratio: number) => void;
    label?: string;
    valueText?: string;
    className?: string;
}

const KEY_STEP = 0.05;

const MIN_BAR = 0.04;

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0);

const hashSeed = (seed: string): number => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < seed.length; i += 1) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

const mulberry32 = (state: number) => () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const decorativeWaveform = (seed: string, count = 48): number[] => {
    const next = mulberry32(hashSeed(seed));
    const length = Math.max(0, Math.floor(count));
    return Array.from({ length }, (_, i) => {
        const envelope = Math.pow(Math.sin((Math.PI * (i + 0.5)) / length), 0.8);
        const height = (0.2 + 0.8 * envelope) * (0.3 + 0.7 * next());
        return Math.min(Math.max(height, MIN_BAR), 1);
    });
};

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
    const playedCount = Math.ceil(shown * heights.length);
    const interactive = Boolean(onSeek);

    const ratioAt = (element: HTMLElement, clientX: number): number => {
        const box = element.getBoundingClientRect();
        return box.width > 0 ? clamp01((clientX - box.left) / box.width) : 0;
    };

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!onSeek || event.button !== 0 || pointer.current !== null) return;
        pointer.current = event.pointerId;
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
