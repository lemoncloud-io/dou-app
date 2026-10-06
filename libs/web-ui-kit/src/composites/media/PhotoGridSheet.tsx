import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { FloatingButton } from '../../foundations/button/FloatingButton';
import { IconCameraSolid, IconChevronDown, IconClose } from '../../resources/icons';
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

export interface PhotoGridSheetLabels {
    camera: string;
    close: string;
    /** Accessible name for a grid tile; receives the 1-based position in the grid. */
    photo: (position: number) => string;
    /** Accessible name for a video's tile; receives the 1-based position in the grid. Default: `photo`. */
    video?: (position: number) => string;
    /** Accessible name for a picked-strip remove chip; receives the 1-based pick position. */
    remove: (position: number) => string;
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
     * photo has not loaded is drawn as an empty tile.
     */
    count: number;
    /** The photo at an index (0 = newest), or undefined while it has not loaded. */
    photoAt: (index: number) => PhotoItem | undefined;
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
    labels?: Partial<PhotoGridSheetLabels>;
}

const DEFAULT_LABELS: PhotoGridSheetLabels = {
    camera: 'Camera',
    close: 'Close',
    photo: position => `Photo ${position}`,
    remove: position => `Remove photo ${position}`,
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
 * Stateless. What is picked, which album is showing, what has loaded and how many columns there are
 * belong to the host — the host also owns reading the library, which this component never touches.
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
    columns,
    onColumnsChange,
    sendLabel,
    onSend,
    sending = false,
    notice,
    labels,
}: PhotoGridSheetProps) => {
    const text = { ...DEFAULT_LABELS, ...labels };
    const order = React.useMemo(() => new Map(picked.map((photo, index) => [photo.id, index + 1])), [picked]);
    const full = picked.length >= max;
    const columnCount = clampColumns(columns ?? DEFAULT_COLUMNS);
    const cameraCells = onCamera ? 1 : 0;
    const cells = count + cameraCells;

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
    const rangeStart = Math.max(0, shown.start - cameraCells);
    const rangeEnd = Math.max(rangeStart, shown.end - cameraCells);
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
        const photo = photoAt(index);
        // Keyed by position: a tile keeps its element while its photo's data arrives or changes size.
        tiles.push(
            photo ? (
                <div key={cell} className="absolute" style={style}>
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
                    className="absolute bg-muted"
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
                    <FloatingButton label={sendLabel} onClick={onSend} disabled={sending} aria-busy={sending} />
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
