import * as React from 'react';

import { cn } from '@chatic/ui-kit';
import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

import { FloatingButton, FLOATING_PANEL, Checkbox } from '@chatic/design-system-components-mobile';
import { IconCameraSolid, IconChevronDown, IconClose, IconEdit } from '@chatic/design-system-assets/icons';
import { BottomSheet } from '../overlay/BottomSheet';
import { SLIDE_MOTION, useSlidePresence } from '../overlay/slidePresence';
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
    photo: (position: number) => string;
    video?: (position: number) => string;
    remove: (position: number) => string;
    edit: string;
    grouped: string;
    select: (position: number) => string;
    edited: string;
}

export interface PhotoGridSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    albumTitle: string;
    albumsOpen: boolean;
    onToggleAlbums: () => void;
    albums: PhotoAlbum[];
    onSelectAlbum: (id: string) => void;
    formatAlbumCount?: (count: number) => string;
    count: number;
    photoAt: (index: number) => PhotoItem | undefined;
    loading?: boolean;
    picked: PhotoItem[];
    onToggle: (photo: PhotoItem) => void;
    max: number;
    onCamera?: () => void;
    onVisibleRangeChange?: (range: PhotoGridRange) => void;
    columns?: number;
    onColumnsChange?: (columns: number) => void;
    sendLabel: string;
    onSend: () => void;
    sending?: boolean;
    notice?: React.ReactNode;
    onEdit?: (id?: string) => void;
    editDisabled?: boolean;
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

interface Viewport {
    width: number;
    height: number;
    scrollTop: number;
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
    onEdit?: () => void;
    editDisabled: boolean;
    editLabel: string;
    onGroupedChange?: (grouped: boolean) => void;
    grouped: boolean;
    groupedLabel: string;
}

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
    return (
        <div data-testid="photo-grid-footer" className={cn(FLOATING_PANEL, 'p-0')}>
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
                wrapperClassName="rounded-none pt-3 shadow-none"
            />
        </div>
    );
};

interface SlidingFooterProps {
    children?: React.ReactNode;
    onInsetChange: (px: number) => void;
}

const SlidingFooter = ({ children, onInsetChange }: SlidingFooterProps) => {
    const visible = children !== undefined && children !== null && children !== false;
    const { mounted, shown, ref, onTransitionEnd } = useSlidePresence<HTMLDivElement>(visible);
    const last = React.useRef<React.ReactNode>(children);
    if (visible) last.current = children;

    const [boxRef, box] = useBoxSize<HTMLDivElement>();
    const attach = React.useCallback(
        (node: HTMLDivElement | null) => {
            ref.current = node;
            boxRef(node);
        },
        [ref, boxRef]
    );
    useToastLift(box.height > 0 ? box.height : null);

    const inset = visible ? box.height : 0;
    const insetRef = React.useRef(onInsetChange);
    insetRef.current = onInsetChange;
    React.useLayoutEffect(() => insetRef.current(inset), [inset]);
    React.useLayoutEffect(() => () => insetRef.current(0), []);

    if (!mounted) return null;
    return (
        <div className="relative h-0">
            <div
                ref={attach}
                data-testid="photo-grid-footer-slide"
                data-shown={shown}
                inert={!visible}
                onTransitionEnd={onTransitionEnd}
                className={cn(
                    'absolute inset-x-0 bottom-0',
                    SLIDE_MOTION,
                    shown ? 'translate-y-0' : 'translate-y-[calc(100%+var(--safe-bottom,0px))]'
                )}
            >
                {visible ? children : last.current}
            </div>
        </div>
    );
};

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
    const showGrouped = onGroupedChange !== undefined && picked.length >= 2;
    const order = React.useMemo(() => new Map(picked.map((photo, index) => [photo.id, index + 1])), [picked]);
    const full = picked.length >= max;
    const columnCount = clampColumns(columns ?? DEFAULT_COLUMNS);
    const cameraCells = onCamera ? 1 : 0;

    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const [scroller, setScroller] = React.useState<HTMLDivElement | null>(null);
    const attachScroller = React.useCallback((node: HTMLDivElement | null) => {
        scrollRef.current = node;
        setScroller(node);
    }, []);
    const [grid, setGrid] = React.useState<HTMLDivElement | null>(null);
    const [footerInset, setFooterInset] = React.useState(0);

    const [viewport, setViewport] = React.useState<Viewport>(EMPTY_VIEWPORT);
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

    const hasNotice = !!notice;
    React.useLayoutEffect(measure, [measure, hasNotice, picked.length, albumsOpen]);

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
    const rangeStart = Math.min(count, Math.max(0, shown.start - cameraCells));
    const rangeEnd = Math.min(count, Math.max(rangeStart, shown.end - cameraCells));
    const thumbSize = measured ? thumbPixelSize(metrics.tile, window.devicePixelRatio || 1) : undefined;

    const rangeChangeRef = React.useRef(onVisibleRangeChange);
    rangeChangeRef.current = onVisibleRangeChange;
    React.useEffect(() => {
        if (!open || albumsOpen) return;
        rangeChangeRef.current?.({ start: rangeStart, end: rangeEnd, thumbSize });
    }, [open, albumsOpen, rangeStart, rangeEnd, thumbSize]);

    const metricsRef = React.useRef<GridMetrics>(metrics);
    metricsRef.current = metrics;
    const cellsRef = React.useRef(cells);
    cellsRef.current = cells;
    const columnsRef = React.useRef(columnCount);
    columnsRef.current = columnCount;
    const columnsChangeRef = React.useRef(onColumnsChange);
    columnsChangeRef.current = onColumnsChange;
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
            scroller.addEventListener('touchmove', onTouchMove, { passive: false });
        };

        const onTouchMove = (event: TouchEvent) => {
            if (!pinch || event.touches.length !== 2) return;
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

    const guardPointerDown = (event: React.PointerEvent) => {
        if (!event.isPrimary) event.stopPropagation();
    };
    const guardPointerMove = (event: React.PointerEvent) => {
        if (pinching.current || !event.isPrimary) event.stopPropagation();
    };

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
            className="h-[calc(90vh-var(--keyboard-height,0px))] rounded-t-[20px] shadow-[0_-2px_6px_rgba(0,0,0,0.12)]"
            footer={
                <SlidingFooter onInsetChange={setFooterInset}>
                    {picked.length > 0 && !albumsOpen ? (
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
                    ) : undefined}
                </SlidingFooter>
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
                                {footerInset > 0 && (
                                    <div
                                        aria-hidden
                                        data-testid="photo-grid-footer-spacer"
                                        style={{ height: footerInset }}
                                    />
                                )}
                            </div>
                            <GridScrubber
                                scroller={scroller}
                                contentHeight={metrics.height}
                                insetBottom={footerInset}
                            />
                        </div>
                    </>
                )}
            </div>
        </BottomSheet>
    );
};
