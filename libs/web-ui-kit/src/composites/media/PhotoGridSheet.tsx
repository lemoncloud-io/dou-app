import * as React from 'react';

import { cn } from '@chatic/lib/utils';
import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

import { FloatingButton } from '../../foundations/button/FloatingButton';
import { FLOATING_PANEL } from '../../foundations/button/floatingPanel';
import { Checkbox } from '../../foundations/checkbox/Checkbox';
import { IconCameraSolid, IconChevronDown, IconClose, IconEdit } from '../../resources/icons';
import { BottomSheet } from '../overlay/BottomSheet';
import { AlbumList } from './AlbumList';
import { GridScrubber } from './GridScrubber';
import {
    anchoredScrollTop,
    cellPosition,
    clampColumns,
    DEFAULT_COLUMNS,
    gridMetrics,
    pinchColumns,
    thumbPixelSize,
    visibleCells,
    type GridMetrics,
} from './photoGridLayout';
import { PhotoGridTile } from './PhotoGridTile';
import { SelectedPhotoStrip } from './SelectedPhotoStrip';
import type { PhotoAlbum, PhotoGridRange, PhotoItem } from './types';
import { useBoxSize } from './useBoxSize';

export interface PhotoGridSheetLabels {
    camera: string;
    close: string;
    /** Accessible name for a grid tile; receives the 1-based position in the grid. */
    photo: (position: number) => string;
    /** Accessible name for a video's tile; receives the 1-based position in the grid. Default: `photo`. */
    video?: (position: number) => string;
    /** Accessible name for a picked-strip remove chip; receives the 1-based pick position. */
    remove: (position: number) => string;
    /** The footer's edit button. */
    edit: string;
    /** The footer's checkbox: the pick goes as one message rather than one message per item. */
    grouped: string;
    /** Accessible name for a picked-strip thumbnail, which opens the editor; receives the 1-based pick position. */
    select: (position: number) => string;
    /** Accessible name of the mark a picked photo that has been edited carries in the strip. */
    edited: string;
}

export interface PhotoGridSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The current album's name — the header title that opens the album list. */
    albumTitle: string;
    albumsOpen: boolean;
    onToggleAlbums: () => void;
    albums: PhotoAlbum[];
    onSelectAlbum: (id: string) => void;
    formatAlbumCount?: (count: number) => string;
    /**
     * How many photos the current album lays out. The grid is this tall at once, and a position whose
     * photo has not loaded is drawn as a pulsing skeleton tile.
     */
    count: number;
    /** The photo at an index (0 = newest), or undefined while it has not loaded. */
    photoAt: (index: number) => PhotoItem | undefined;
    /**
     * The album's first page is on its way. With nothing laid out yet, the grid fills the screen with
     * skeleton tiles rather than standing empty.
     */
    loading?: boolean;
    /**
     * Picked photos in pick order. Carried whole rather than as ids because a pick can come from
     * another album than the one on screen, and the strip still has to draw it.
     */
    picked: PhotoItem[];
    onToggle: (photo: PhotoItem) => void;
    /** How many may be picked. Unpicked tiles lock once it is reached. */
    max: number;
    /** Omit to hide the camera tile. */
    onCamera?: () => void;
    /**
     * Fired as the grid scrolls, resizes or changes columns: the photos on screen, a few rows either
     * side included, and the pixel size they are drawn at. The host loads what the range needs.
     */
    onVisibleRangeChange?: (range: PhotoGridRange) => void;
    /** Columns, 2–5. Default 3. */
    columns?: number;
    /** Omit to keep the columns fixed; with it, a pinch on the grid steps them. */
    onColumnsChange?: (columns: number) => void;
    /** The send button label, already carrying the count (e.g. "3장 보내기"). */
    sendLabel: string;
    onSend: () => void;
    /**
     * The host is still reading the pick — a video copied out of iCloud can take minutes. The send
     * button greys out with whatever `sendLabel` says meanwhile (a spinner alone would not say what is
     * going on) and takes no second tap; the sheet stays, so the screen is never empty while the
     * message is on its way to existing.
     */
    sending?: boolean;
    /** A row above the grid — the host's "only some photos are shared" notice on a limited library. */
    notice?: React.ReactNode;
    /**
     * Omit to hide the Edit button. Called with no id from the footer button, with an id from a strip
     * tap — the host opens its editor on the first picked item or on that one.
     */
    onEdit?: (id?: string) => void;
    /** Greys the Edit button — nothing picked can be edited (only videos/GIFs). */
    editDisabled?: boolean;
    /**
     * Whether the pick goes as one message (checked) or one message per item. Omit `onGroupedChange`
     * to hide the checkbox. Shown only when picked.length >= 2: one item is one message either way.
     */
    grouped?: boolean;
    onGroupedChange?: (grouped: boolean) => void;
    labels?: Partial<PhotoGridSheetLabels>;
}

const DEFAULT_LABELS: PhotoGridSheetLabels = {
    camera: 'Camera',
    close: 'Close',
    photo: position => `Photo ${position}`,
    remove: position => `Remove photo ${position}`,
    edit: 'Edit',
    grouped: 'Send as one message',
    select: position => `Open photo ${position}`,
    edited: 'Edited',
};

/** What the grid measured of its scroller: the box, how far it has scrolled, and where the grid starts. */
interface Viewport {
    width: number;
    height: number;
    scrollTop: number;
    /** How far down the scrolled content the grid begins — the notice's height, when there is one. */
    offsetTop: number;
}

const EMPTY_VIEWPORT: Viewport = { width: 0, height: 0, scrollTop: 0, offsetTop: 0 };

const sameViewport = (a: Viewport, b: Viewport) =>
    a.width === b.width && a.height === b.height && a.scrollTop === b.scrollTop && a.offsetTop === b.offsetTop;

const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

interface PickFooterProps {
    sendLabel: string;
    onSend: () => void;
    sending: boolean;
    /** Absent: no edit button. */
    onEdit?: () => void;
    editDisabled: boolean;
    editLabel: string;
    /** Absent: no checkbox. */
    onGroupedChange?: (grouped: boolean) => void;
    grouped: boolean;
    groupedLabel: string;
}

/**
 * The send button with a row above it: the edit button on the left, the "one message" checkbox on the
 * right. One panel holds both, so the row sits on the button's surface rather than under its upward
 * shadow, and the snackbar is lifted by the whole panel — the button's own lift would leave a toast
 * sitting on the row. While the pick is being read neither control takes a tap: what they would change
 * is already on its way.
 */
const PickFooter = ({
    sendLabel,
    onSend,
    sending,
    onEdit,
    editDisabled,
    editLabel,
    onGroupedChange,
    grouped,
    groupedLabel,
}: PickFooterProps) => {
    const [panelRef, panel] = useBoxSize<HTMLDivElement>();
    useToastLift(panel.height > 0 ? panel.height : null);
    return (
        <div ref={panelRef} data-testid="photo-grid-footer" className={cn(FLOATING_PANEL, 'p-0')}>
            <div className="flex min-h-11 items-center justify-between gap-3 px-4 pt-3">
                {onEdit ? (
                    <button
                        type="button"
                        onClick={() => onEdit()}
                        disabled={editDisabled || sending}
                        className="flex h-9 items-center gap-1 text-[15px] font-semibold text-foreground disabled:text-placeholder"
                    >
                        <IconEdit className="size-[18px]" aria-hidden />
                        {editLabel}
                    </button>
                ) : (
                    <span />
                )}
                {onGroupedChange && (
                    <button
                        type="button"
                        role="checkbox"
                        aria-checked={grouped}
                        onClick={() => onGroupedChange(!grouped)}
                        disabled={sending}
                        className="flex h-9 items-center gap-2 text-[14px] font-medium text-foreground disabled:opacity-50"
                    >
                        <Checkbox checked={grouped} interactive={false} size={22} />
                        {groupedLabel}
                    </button>
                )}
            </div>
            <FloatingButton
                label={sendLabel}
                onClick={onSend}
                disabled={sending}
                aria-busy={sending}
                // The surface and its shadow are the panel's; the button's own would draw a second edge
                // between the row and the button.
                wrapperClassName="rounded-none pt-3 shadow-none"
            />
        </div>
    );
};

/**
 * The in-app photo picker (Figma `3749:29014` · `3767:30962` · `3767:32042`): a tall sheet whose title
 * names the album and opens the album list, the picked photos in a strip, a grid led by a camera tile,
 * and a send button that appears once something is picked.
 *
 * The title row and the picked strip stay put; only the grid (with the notice above it) scrolls, in a
 * container of its own — the sheet is told which, so swipe-to-dismiss still arms only at its top. The
 * album list scrolls under the same fixed title.
 *
 * The grid is virtual. It is laid out at its full height from `count`, and only the rows on screen
 * (a few either side) are rendered; what it shows is reported through `onVisibleRangeChange`, and the
 * host fills it. A long grid gets a fast-scroll handle on its right edge. A pinch steps the columns
 * between two and five, keeping the photo under the fingers where it was.
 *
 * Above the send button the host may add a row: an Edit button (`onEdit`), which also makes the
 * picked strip's thumbnails open the editor on themselves, and a checkbox choosing whether two or
 * more items go as one message (`grouped`). Like the send button, the row is not shown over the
 * album list.
 *
 * Stateless. What is picked, which album is showing, what has loaded, how many columns there are and
 * whether the pick goes as one message belong to the host — the host also owns reading the library,
 * which this component never touches.
 */
export const PhotoGridSheet = ({
    open,
    onOpenChange,
    albumTitle,
    albumsOpen,
    onToggleAlbums,
    albums,
    onSelectAlbum,
    formatAlbumCount,
    count,
    photoAt,
    picked,
    onToggle,
    max,
    onCamera,
    onVisibleRangeChange,
    loading = false,
    columns,
    onColumnsChange,
    sendLabel,
    onSend,
    sending = false,
    notice,
    onEdit,
    editDisabled = false,
    grouped = false,
    onGroupedChange,
    labels,
}: PhotoGridSheetProps) => {
    const text = { ...DEFAULT_LABELS, ...labels };
    // One item goes as one message either way, so the choice is only offered from two.
    const showGrouped = onGroupedChange !== undefined && picked.length >= 2;
    const order = React.useMemo(() => new Map(picked.map((photo, index) => [photo.id, index + 1])), [picked]);
    const full = picked.length >= max;
    const columnCount = clampColumns(columns ?? DEFAULT_COLUMNS);
    const cameraCells = onCamera ? 1 : 0;

    // State, not refs: the sheet mounts its content into a portal a commit after this component
    // renders, so a ref read in an effect is still empty on the first pass — and with nothing else
    // changing, the listeners would never be attached. Holding the nodes in state re-runs the effects
    // the moment they exist. The ref is for the sheet, which reads it during a gesture.
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const [scroller, setScroller] = React.useState<HTMLDivElement | null>(null);
    const attachScroller = React.useCallback((node: HTMLDivElement | null) => {
        scrollRef.current = node;
        setScroller(node);
    }, []);
    const [grid, setGrid] = React.useState<HTMLDivElement | null>(null);

    const [viewport, setViewport] = React.useState<Viewport>(EMPTY_VIEWPORT);
    // While the first page is out there is nothing to lay out: enough skeleton tiles to fill the screen
    // stand in for it, and give way to the album's own layout the moment it answers.
    const skeletonCount =
        loading && count === 0 && viewport.width > 0
            ? Math.max(
                  0,
                  Math.ceil(
                      viewport.height / gridMetrics({ width: viewport.width, columns: columnCount, cells: 0 }).rowHeight
                  ) *
                      columnCount -
                      cameraCells
              )
            : 0;
    const cells = Math.max(count, skeletonCount) + cameraCells;
    const metrics = React.useMemo(
        () => gridMetrics({ width: viewport.width, columns: columnCount, cells }),
        [viewport.width, columnCount, cells]
    );

    const measure = React.useCallback(() => {
        if (!scroller) return;
        const next: Viewport = {
            width: scroller.clientWidth,
            height: scroller.clientHeight,
            scrollTop: scroller.scrollTop,
            offsetTop: grid?.offsetTop ?? 0,
        };
        setViewport(previous => (sameViewport(previous, next) ? previous : next));
    }, [scroller, grid]);

    // `!!notice`, not the node: a host passes a fresh element on every render, and each would force a
    // layout read. The notice's own height changes reach `measure` through the ResizeObserver below.
    const hasNotice = !!notice;
    React.useLayoutEffect(measure, [measure, hasNotice, picked.length, albumsOpen]);

    // Scrolling re-measures once a frame: a fling fires scroll events faster than they can be drawn.
    React.useEffect(() => {
        if (!scroller) return;
        let frame = 0;
        const onScroll = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(() => {
                frame = 0;
                measure();
            });
        };
        scroller.addEventListener('scroll', onScroll, { passive: true });
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
        resize?.observe(scroller);
        if (grid?.previousElementSibling) resize?.observe(grid.previousElementSibling);
        return () => {
            scroller.removeEventListener('scroll', onScroll);
            if (frame) window.cancelAnimationFrame(frame);
            resize?.disconnect();
        };
    }, [scroller, grid, measure]);

    const measured = viewport.width > 0;
    const shown = measured
        ? visibleCells({
              scrollTop: viewport.scrollTop,
              viewportHeight: viewport.height,
              offsetTop: viewport.offsetTop,
              metrics,
              cells,
          })
        : { start: 0, end: 0 };
    // Skeleton tiles stand for no photo: the range stops at the album's real end.
    const rangeStart = Math.min(count, Math.max(0, shown.start - cameraCells));
    const rangeEnd = Math.min(count, Math.max(rangeStart, shown.end - cameraCells));
    const thumbSize = measured ? thumbPixelSize(metrics.tile, window.devicePixelRatio || 1) : undefined;

    const rangeChangeRef = React.useRef(onVisibleRangeChange);
    rangeChangeRef.current = onVisibleRangeChange;
    React.useEffect(() => {
        if (!open || albumsOpen) return;
        rangeChangeRef.current?.({ start: rangeStart, end: rangeEnd, thumbSize });
    }, [open, albumsOpen, rangeStart, rangeEnd, thumbSize]);

    // --- Pinch to change columns ---

    const metricsRef = React.useRef<GridMetrics>(metrics);
    metricsRef.current = metrics;
    const cellsRef = React.useRef(cells);
    cellsRef.current = cells;
    const columnsRef = React.useRef(columnCount);
    columnsRef.current = columnCount;
    const columnsChangeRef = React.useRef(onColumnsChange);
    columnsChangeRef.current = onColumnsChange;
    /** The scroll a column change has to land on, applied once the new layout is in the DOM. */
    const pendingScroll = React.useRef<number | null>(null);
    const pinching = React.useRef(false);

    React.useLayoutEffect(() => {
        if (pendingScroll.current === null || !scroller) return;
        scroller.scrollTop = pendingScroll.current;
        pendingScroll.current = null;
        measure();
    }, [columnCount, scroller, measure]);

    React.useEffect(() => {
        if (!scroller || albumsOpen) return;
        let pinch: { startDistance: number; startColumns: number; current: number } | null = null;

        const onTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 2 || !columnsChangeRef.current) return;
            const [a, b] = [event.touches[0], event.touches[1]];
            const startDistance = distance(a, b);
            if (startDistance <= 0) return;
            pinch = { startDistance, startColumns: columnsRef.current, current: columnsRef.current };
            pinching.current = true;
            // Non-passive only while a pinch is on: a non-passive touchmove makes every scroll wait for
            // the main thread, which is busy laying pages in.
            scroller.addEventListener('touchmove', onTouchMove, { passive: false });
        };

        const onTouchMove = (event: TouchEvent) => {
            if (!pinch || event.touches.length !== 2) return;
            // Not a scroll and not a page zoom: the grid's own gesture.
            event.preventDefault();
            const [a, b] = [event.touches[0], event.touches[1]];
            const next = pinchColumns(pinch.startColumns, distance(a, b) / pinch.startDistance);
            if (next === pinch.current) return;
            pinch.current = next;

            const box = scroller.getBoundingClientRect();
            const after = gridMetrics({ width: scroller.clientWidth, columns: next, cells: cellsRef.current });
            pendingScroll.current = anchoredScrollTop({
                scrollTop: scroller.scrollTop,
                anchorY: (a.clientY + b.clientY) / 2 - box.top,
                anchorX: (a.clientX + b.clientX) / 2 - box.left,
                offsetTop: grid?.offsetTop ?? 0,
                before: metricsRef.current,
                after,
            });
            columnsChangeRef.current?.(next);
        };

        const onTouchEnd = (event: TouchEvent) => {
            if (event.touches.length >= 2) return;
            pinch = null;
            pinching.current = false;
            scroller.removeEventListener('touchmove', onTouchMove);
        };

        // iOS WebKit's own pinch gesture. The page's viewport already disallows zoom; this keeps a
        // WebView that ignores that from scaling the page under the grid's gesture.
        const onGesture = (event: Event) => event.preventDefault();

        scroller.addEventListener('touchstart', onTouchStart, { passive: true });
        scroller.addEventListener('touchend', onTouchEnd);
        scroller.addEventListener('touchcancel', onTouchEnd);
        scroller.addEventListener('gesturestart', onGesture);
        scroller.addEventListener('gesturechange', onGesture);
        return () => {
            scroller.removeEventListener('touchstart', onTouchStart);
            scroller.removeEventListener('touchmove', onTouchMove);
            scroller.removeEventListener('touchend', onTouchEnd);
            scroller.removeEventListener('touchcancel', onTouchEnd);
            scroller.removeEventListener('gesturestart', onGesture);
            scroller.removeEventListener('gesturechange', onGesture);
        };
    }, [scroller, grid, albumsOpen]);

    // A second finger, and every move while a pinch is on, stay away from the sheet's drag. Judged by
    // `isPrimary` rather than by counting pointers: once the sheet captures a drag, the release goes to
    // the sheet and never reaches here, and a count would be left one up for good.
    const guardPointerDown = (event: React.PointerEvent) => {
        if (!event.isPrimary) event.stopPropagation();
    };
    const guardPointerMove = (event: React.PointerEvent) => {
        if (pinching.current || !event.isPrimary) event.stopPropagation();
    };

    // --- Tiles ---

    const tiles: React.ReactNode[] = [];
    for (let cell = shown.start; cell < shown.end; cell += 1) {
        const { top, left } = cellPosition(cell, metrics);
        const style: React.CSSProperties = { top, left, width: metrics.tile, height: metrics.tile };
        if (onCamera && cell === 0) {
            tiles.push(
                <button
                    key="camera"
                    type="button"
                    onClick={onCamera}
                    style={style}
                    className="absolute flex flex-col items-center justify-center gap-1 bg-media-tile px-2 text-media-tile-foreground"
                >
                    <IconCameraSolid className="text-white" />
                    <span className="text-[14px] font-medium leading-[1.4] tracking-[-0.07px]">{text.camera}</span>
                </button>
            );
            continue;
        }
        const index = cell - cameraCells;
        const photo = index < count ? photoAt(index) : undefined;
        // Keyed by position and photo: a tile keeps its element while its photo's preview changes size
        // (a sharper copy after a pinch), and a different photo at that position — the library changed —
        // gets a fresh one, with its own skeleton.
        tiles.push(
            photo ? (
                <div key={`${cell}:${photo.id}`} className="absolute" style={style}>
                    <PhotoGridTile
                        src={photo.src}
                        kind={photo.kind}
                        durationMs={photo.durationMs}
                        order={order.get(photo.id)}
                        onToggle={() => onToggle(photo)}
                        disabled={full}
                        label={(photo.kind === 'video' ? (text.video ?? text.photo) : text.photo)(index + 1)}
                        className="size-full"
                    />
                </div>
            ) : (
                <div
                    key={cell}
                    aria-hidden
                    data-testid="photo-grid-placeholder"
                    className="absolute bg-muted motion-safe:animate-pulse"
                    style={style}
                />
            )
        );
    }

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={albumTitle}
            hideHeader
            scrollRef={scrollRef}
            // The upward shadow is the design's (Figma 3767:31025): on a white page the sheet has no other edge.
            className="h-[calc(90vh-var(--keyboard-height,0px))] rounded-t-[20px] shadow-[0_-2px_6px_rgba(0,0,0,0.12)]"
            footer={
                picked.length > 0 && !albumsOpen ? (
                    onEdit || showGrouped ? (
                        <PickFooter
                            sendLabel={sendLabel}
                            onSend={onSend}
                            sending={sending}
                            onEdit={onEdit}
                            editDisabled={editDisabled}
                            editLabel={text.edit}
                            onGroupedChange={showGrouped ? onGroupedChange : undefined}
                            grouped={grouped}
                            groupedLabel={text.grouped}
                        />
                    ) : (
                        <FloatingButton label={sendLabel} onClick={onSend} disabled={sending} aria-busy={sending} />
                    )
                ) : undefined
            }
        >
            <div className="flex h-full flex-col">
                <div className="relative flex shrink-0 items-center justify-end px-4 py-3.5">
                    <button
                        type="button"
                        onClick={onToggleAlbums}
                        aria-expanded={albumsOpen}
                        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 text-[16px] font-semibold leading-[1.5] tracking-[-0.08px] text-foreground"
                    >
                        {albumTitle}
                        <IconChevronDown
                            className={cn('size-[18px] transition-transform', albumsOpen && 'rotate-180')}
                            aria-hidden
                        />
                    </button>
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        aria-label={text.close}
                        className="flex size-6 items-center justify-center rounded-full bg-muted p-1"
                    >
                        <IconClose className="size-4 text-foreground" />
                    </button>
                </div>

                {albumsOpen ? (
                    <div ref={attachScroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                        <AlbumList albums={albums} onSelect={onSelectAlbum} formatCount={formatAlbumCount} />
                    </div>
                ) : (
                    <>
                        <SelectedPhotoStrip
                            className="shrink-0"
                            photos={picked}
                            onRemove={id => {
                                const photo = picked.find(p => p.id === id);
                                if (photo) onToggle(photo);
                            }}
                            removeLabel={text.remove}
                            onSelect={onEdit ? id => onEdit(id) : undefined}
                            selectLabel={text.select}
                            editedLabel={text.edited}
                        />
                        <div className="relative min-h-0 flex-1">
                            <div
                                ref={attachScroller}
                                data-testid="photo-grid-scroller"
                                onPointerDown={guardPointerDown}
                                onPointerMove={guardPointerMove}
                                // pan-y: the browser scrolls, and a pinch is left to the grid.
                                className="relative h-full touch-pan-y overflow-y-auto overscroll-contain"
                            >
                                {notice && <div>{notice}</div>}
                                <div
                                    ref={setGrid}
                                    data-testid="photo-grid"
                                    aria-busy={loading && count === 0}
                                    className="relative w-full"
                                    style={{ height: measured ? metrics.height : undefined }}
                                >
                                    {tiles}
                                </div>
                            </div>
                            <GridScrubber scroller={scroller} contentHeight={metrics.height} />
                        </div>
                    </>
                )}
            </div>
        </BottomSheet>
    );
};
