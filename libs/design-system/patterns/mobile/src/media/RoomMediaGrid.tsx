import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { Checkbox } from '@chatic/design-system-components-mobile';
import type { PhotoItemKind } from './types';
import { VideoMark } from './VideoMark';

export const ROOM_MEDIA_LONG_PRESS_MS = 500;
const PRESS_SLOP_PX = 8;

export interface RoomMediaGridItem {
    key: string;
    src?: string;
    kind: PhotoItemKind;
    durationSeconds?: number;
}

export interface RoomMediaGridProps {
    items: RoomMediaGridItem[];
    onOpen: (key: string) => void;
    selection?: { selectedKeys: ReadonlySet<string>; onToggle: (key: string) => void };
    onLongPress?: (key: string) => void;
    tileLabel?: (index: number, kind: PhotoItemKind) => string;
    className?: string;
}

const defaultTileLabel = (index: number, kind: PhotoItemKind) => `${kind === 'video' ? 'Video' : 'Photo'} ${index + 1}`;

export const RoomMediaGrid = ({
    items,
    onOpen,
    selection,
    onLongPress,
    tileLabel = defaultTileLabel,
    className,
}: RoomMediaGridProps) => {
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

    const handlePointerDown = (key: string) => (event: React.PointerEvent) => {
        fired.current = false;
        cancel();
        if (!longPressArmed) return;
        origin.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
            fired.current = true;
            timer.current = null;
            onLongPress?.(key);
        }, ROOM_MEDIA_LONG_PRESS_MS);
    };
    const handlePointerMove = (event: React.PointerEvent) => {
        if (!origin.current) return;
        const dx = event.clientX - origin.current.x;
        const dy = event.clientY - origin.current.y;
        if (Math.hypot(dx, dy) > PRESS_SLOP_PX) cancel();
    };
    const handleClick = (key: string) => {
        if (fired.current) {
            fired.current = false;
            return;
        }
        if (selection) selection.onToggle(key);
        else onOpen(key);
    };

    return (
        <ul className={cn('grid w-full grid-cols-3 gap-0.5', className)}>
            {items.map((item, index) => {
                const selected = selection?.selectedKeys.has(item.key) ?? false;
                return (
                    <li key={item.key} className="min-w-0">
                        <button
                            type="button"
                            aria-label={tileLabel(index, item.kind)}
                            aria-pressed={selecting ? selected : undefined}
                            data-kind={item.kind}
                            onClick={() => handleClick(item.key)}
                            onPointerDown={handlePointerDown(item.key)}
                            onPointerMove={handlePointerMove}
                            onPointerUp={cancel}
                            onPointerLeave={cancel}
                            onPointerCancel={cancel}
                            onContextMenu={event => longPressArmed && event.preventDefault()}
                            className="relative block aspect-square w-full select-none overflow-hidden bg-muted"
                        >
                            {item.src && (
                                <img
                                    src={item.src}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    draggable={false}
                                    className="size-full object-cover"
                                />
                            )}
                            {item.kind === 'video' && (
                                <VideoMark
                                    durationMs={
                                        item.durationSeconds !== undefined ? item.durationSeconds * 1000 : undefined
                                    }
                                />
                            )}
                            {selecting && (
                                <>
                                    <span
                                        aria-hidden
                                        className={cn(
                                            'pointer-events-none absolute inset-0 bg-black/30 transition-opacity duration-200 motion-reduce:transition-none',
                                            selected ? 'opacity-100' : 'opacity-0'
                                        )}
                                    />
                                    <Checkbox
                                        checked={selected}
                                        tone="ink"
                                        size={22}
                                        interactive={false}
                                        className={cn(
                                            'absolute right-1.5 top-1.5 border-white',
                                            !selected && 'bg-white/[0.32]'
                                        )}
                                    />
                                </>
                            )}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
};
