import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { Checkbox } from '../../foundations/checkbox/Checkbox';
import type { PhotoItemKind } from './types';
import { VideoMark } from './VideoMark';

/** How long a press on a tile has to rest before it counts as a long press. */
export const ROOM_MEDIA_LONG_PRESS_MS = 500;
/** How far a finger may drift during a press before it is a scroll, not a press. */
const PRESS_SLOP_PX = 8;

export interface RoomMediaGridItem {
    /** Stable identifier, reported back by every callback. */
    key: string;
    /** A thumbnail URL; a video's is its poster. Absent draws the bare grey tile. */
    src?: string;
    kind: PhotoItemKind;
    /** A video's length, drawn in the corner mark. */
    durationSeconds?: number;
}

export interface RoomMediaGridProps {
    items: RoomMediaGridItem[];
    /** A tile was tapped outside selection mode — open the viewer on it. */
    onOpen: (key: string) => void;
    /** Selection mode: each tile carries a check circle and a tap toggles it. */
    selection?: { selectedKeys: ReadonlySet<string>; onToggle: (key: string) => void };
    /** A tile held for {@link ROOM_MEDIA_LONG_PRESS_MS} outside selection mode — enter it with this tile. */
    onLongPress?: (key: string) => void;
    /** Each tile's accessible name, localized by the host. */
    tileLabel?: (index: number, kind: PhotoItemKind) => string;
    className?: string;
}

const defaultTileLabel = (index: number, kind: PhotoItemKind) => `${kind === 'video' ? 'Video' : 'Photo'} ${index + 1}`;

/**
 * The photos·videos tab of a room's file list: a three-column grid of square thumbnails with a 2px
 * gutter. The design drew only the audio tab, so this follows the kit's other grids — a video wears
 * the picker's `VideoMark` (play mark and length) in its bottom-left corner, and in selection mode the
 * top-right corner carries the same navy check circle the file rows use, a picked tile dimming under it.
 *
 * Not `PhotoGridTile`: that tile is the composer's picker, with a lime pick-order badge, a cap and a
 * skeleton cross-fade tuned for base64 previews. A room's history can hold thousands of remote
 * thumbnails, so these are plain `<img loading="lazy">` and the browser fetches only what scrolls near.
 *
 * Stateless apart from one gesture: a held press is timed so `onLongPress` can fire, and the click that
 * ends it is swallowed, whichever tile it lands on once the host has switched to selection mode.
 */
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
                                        // A white rim in both states: a navy disc alone sinks into a
                                        // dark photo.
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
