import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { AudioSeekBar, formatAudioClock } from '../../foundations/audio';
import { Checkbox } from '../../foundations/checkbox/Checkbox';
import { IconMore, IconPauseSolid, IconPlaySolid } from '../../resources/icons';

export const ROOM_FILE_LONG_PRESS_MS = 500;
const PRESS_SLOP_PX = 8;

export type RoomFileRowLeading =
    | { kind: 'play'; playing: boolean; onToggle: () => void }
    | { kind: 'icon'; icon: React.ReactNode };

export interface RoomFileRowProgress {
    position: number;
    duration?: number;
    onSeek: (seconds: number) => void;
    label?: string;
}

export interface RoomFileRowProps {
    leading: RoomFileRowLeading;
    title: string;
    subtitle?: string;
    progress?: RoomFileRowProgress;
    selection?: { selected: boolean; onToggle: () => void };
    onPress?: () => void;
    onLongPress?: () => void;
    onMore?: () => void;
    playLabel?: string;
    pauseLabel?: string;
    moreLabel?: string;
    className?: string;
}

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
                    <IconMore aria-hidden size={24} className="rotate-90" />
                </button>
            )}
        </div>
    );
};
