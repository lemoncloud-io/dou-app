import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { AudioSeekBar, formatAudioClock } from '../../foundations/audio';
import { Checkbox } from '../../foundations/checkbox/Checkbox';
import { IconMore, IconPauseSolid, IconPlaySolid } from '../../resources/icons';

/** How long a press has to rest before it counts as a long press. */
export const ROOM_FILE_LONG_PRESS_MS = 500;
/** How far a finger may drift during a press before it is a scroll, not a press. */
const PRESS_SLOP_PX = 8;

/** The row's first slot outside selection mode. */
export type RoomFileRowLeading =
    /** An audio file: the round play / pause button. */
    | { kind: 'play'; playing: boolean; onToggle: () => void }
    /** A file or a link: a round tile holding the host's glyph (a file-kind sheet, a link mark). */
    | { kind: 'icon'; icon: React.ReactNode };

export interface RoomFileRowProgress {
    /** Seconds played. */
    position: number;
    /** Seconds long; unknown draws a bar at rest and the position alone. */
    duration?: number;
    /** A position chosen on the bar. */
    onSeek: (seconds: number) => void;
    /** The bar's accessible name. */
    label?: string;
}

export interface RoomFileRowProps {
    /** What leads the row: the play button for audio, a glyph tile for a file or link. */
    leading: RoomFileRowLeading;
    /** File name or link title, one line. */
    title: string;
    /** One line under the title, formatted by the host (e.g. "Sunny · Nov 11 · 35:47 · 17.0MB"). */
    subtitle?: string;
    /** The playing audio row's position bar and clock (Figma 6072:23132). */
    progress?: RoomFileRowProgress;
    /**
     * Selection mode (Figma 6082:23487): a check circle takes the leading slot, ⋮ is hidden and a tap
     * anywhere toggles. A picked row is tinted navy.
     */
    selection?: { selected: boolean; onToggle: () => void };
    /** Tap on the title block — opens the file's detail. */
    onPress?: () => void;
    /** A press held for {@link ROOM_FILE_LONG_PRESS_MS} — enters selection mode with this row picked. */
    onLongPress?: () => void;
    /** The ⋮ button. Omitted, it is not drawn. */
    onMore?: () => void;
    playLabel?: string;
    pauseLabel?: string;
    moreLabel?: string;
    className?: string;
}

/**
 * One row of a room's file list (Figma "대화방 파일 · 음성 행" 6072:23163 — playing 6072:23132,
 * default 6072:23145): a 40px leading circle, a 15px semibold title over a 12px grey subtitle, and a
 * ⋮ button. The same row serves audio, files and links; only the leading slot differs. The audio row
 * that is playing turns its button navy with a pause mark, sits on a light lime ground and grows a
 * position bar under the subtitle.
 *
 * In selection mode (6082:23487 — 6082:23390 unpicked, 6082:23417 picked) the whole row is one
 * checkbox: the check circle replaces the leading slot, ⋮ goes, and a picked row sits on a navy tint.
 *
 * Stateless apart from one gesture: a held press is timed so `onLongPress` can fire, and the click
 * that ends it is swallowed — including when the host has meanwhile switched the row into selection
 * mode, so the same press does not pick and then unpick it.
 */
export const RoomFileRow = ({
    leading,
    title,
    subtitle,
    progress,
    selection,
    onPress,
    onLongPress,
    onMore,
    playLabel = 'Play',
    pauseLabel = 'Pause',
    moreLabel = 'More options',
    className,
}: RoomFileRowProps) => {
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const origin = React.useRef<{ x: number; y: number } | null>(null);
    const fired = React.useRef(false);

    const cancel = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        origin.current = null;
    };
    React.useEffect(() => cancel, []);

    const selecting = selection !== undefined;
    const longPressArmed = !!onLongPress && !selecting;

    const handlePointerDown = (event: React.PointerEvent) => {
        fired.current = false;
        if (!longPressArmed) return;
        // A finger resting on the position bar is aiming a seek, not asking for selection mode.
        if ((event.target as HTMLElement).closest('input')) return;
        origin.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
            fired.current = true;
            timer.current = null;
            onLongPress?.();
        }, ROOM_FILE_LONG_PRESS_MS);
    };
    const handlePointerMove = (event: React.PointerEvent) => {
        if (!origin.current) return;
        const dx = event.clientX - origin.current.x;
        const dy = event.clientY - origin.current.y;
        if (Math.hypot(dx, dy) > PRESS_SLOP_PX) cancel();
    };
    // Every tap target in the row goes through this, so the click that ends a long press is dropped
    // whichever element it lands on.
    const guard = (action: (() => void) | undefined) => () => {
        if (fired.current) {
            fired.current = false;
            return;
        }
        action?.();
    };

    const playing = !selecting && leading.kind === 'play' && leading.playing;

    const texts = (
        <>
            <span className="block truncate text-[15px] font-semibold leading-normal text-foreground">{title}</span>
            {subtitle && <span className="block truncate text-[12px] leading-normal text-description">{subtitle}</span>}
        </>
    );

    const rowClass = cn(
        'flex min-h-[67px] w-full select-none items-center gap-3 py-2.5 pl-4 pr-2 text-left transition-[background-color] duration-300 motion-reduce:transition-none',
        selecting && selection.selected ? 'bg-nav-ink/[0.06]' : playing ? 'bg-primary/[0.08]' : 'bg-transparent',
        className
    );
    const gesture = {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: cancel,
        onPointerLeave: cancel,
        onPointerCancel: cancel,
        onContextMenu: (event: React.MouseEvent) => {
            if (longPressArmed) event.preventDefault();
        },
    };

    if (selecting) {
        return (
            <button
                type="button"
                role="checkbox"
                aria-checked={selection.selected}
                onClick={guard(selection.onToggle)}
                {...gesture}
                className={cn(rowClass, 'pr-4')}
            >
                <span className="flex size-10 shrink-0 items-center justify-center">
                    <Checkbox checked={selection.selected} tone="ink" size={22} interactive={false} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">{texts}</span>
            </button>
        );
    }

    const clock = progress
        ? progress.duration !== undefined
            ? `${formatAudioClock(progress.position)} / ${formatAudioClock(progress.duration)}`
            : formatAudioClock(progress.position)
        : undefined;

    return (
        <div data-playing={playing || undefined} {...gesture} className={rowClass}>
            {leading.kind === 'play' ? (
                <button
                    type="button"
                    aria-label={leading.playing ? pauseLabel : playLabel}
                    onClick={guard(leading.onToggle)}
                    className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-200 active:scale-95 motion-reduce:transition-none',
                        leading.playing
                            ? 'bg-brand-ink text-bubble-mine-foreground'
                            : 'bg-action-soft text-brand-ink dark:text-foreground'
                    )}
                >
                    {leading.playing ? <IconPauseSolid size={24} /> : <IconPlaySolid size={24} />}
                </button>
            ) : (
                <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-action-soft text-foreground"
                >
                    {leading.icon}
                </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <button type="button" onClick={guard(onPress)} className="flex w-full min-w-0 flex-col gap-1 text-left">
                    {texts}
                </button>
                {progress && (
                    <div className="flex items-center gap-2">
                        <AudioSeekBar
                            value={progress.position}
                            max={progress.duration}
                            onSeek={progress.onSeek}
                            tone="onLight"
                            label={progress.label}
                            valueText={clock}
                            className="flex-1"
                        />
                        <span className="shrink-0 whitespace-nowrap text-[11px] leading-normal tabular-nums text-description">
                            {clock}
                        </span>
                    </div>
                )}
            </div>
            {onMore && (
                <button
                    type="button"
                    aria-label={moreLabel}
                    onClick={guard(onMore)}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-description transition-colors active:bg-action-soft"
                >
                    {/* The design's ⋮ is the kit's ⋯ turned upright. */}
                    <IconMore aria-hidden size={24} className="rotate-90" />
                </button>
            )}
        </div>
    );
};
