import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconClose, IconEdit } from '@chatic/design-system-assets/icons';
import {
    prefersReducedMotion,
    SLIDE_FALLBACK_MS,
    SLIDE_MS,
    SLIDE_TIMING,
    slideEase,
    useSlidePresence,
} from '../overlay/slidePresence';
import { EditedPhotoImage } from './EditedPhotoImage';
import type { PhotoItem } from './types';
import { VideoMark } from './VideoMark';

export type SelectedPhotoStripSize = 'regular' | 'compact';

export interface SelectedPhotoStripProps {
    photos: PhotoItem[];
    onRemove: (id: string) => void;
    removeLabel?: (position: number) => string;
    onSelect?: (id: string) => void;
    selectLabel?: (position: number) => string;
    editedLabel?: string;
    label?: string;
    size?: SelectedPhotoStripSize;
    onExited?: () => void;
    className?: string;
}

const SIZES = {
    regular: {
        root: 'w-full p-3',
        row: 'py-3 pr-2',
        endPx: 8,
        tile: 'size-16',
        tilePx: 64,
        gapPx: 14,
        chip: '-right-[7px] -top-[7px] p-1',
        chipIcon: 'size-4',
        edited: 'bottom-1 left-1 size-5',
        editedIcon: 'size-3',
        video: 'bottom-1 left-1 pr-1',
    },
    compact: {
        root: 'w-fit max-w-full rounded-2xl bg-white/80 pb-1.5 pl-1.5 pr-px pt-[3px] backdrop-blur-[4px] dark:bg-black/80',
        row: 'pr-[5px] pt-[5px]',
        endPx: 5,
        tile: 'size-12',
        tilePx: 48,
        gapPx: 8,
        chip: "-right-[5px] -top-[5px] p-[3px] after:absolute after:-inset-1.5 after:content-['']",
        chipIcon: 'size-3',
        edited: 'bottom-0.5 left-0.5 size-4',
        editedIcon: 'size-2.5',
        video: 'bottom-0.5 left-0.5 pr-1',
    },
} as const;

type Look = (typeof SIZES)[SelectedPhotoStripSize];

type Phase = 'enter' | 'in' | 'leave';

interface Entry {
    photo: PhotoItem;
    phase: Phase;
}

const settledEntries = (photos: PhotoItem[]): Entry[] => photos.map(photo => ({ photo, phase: 'in' }));

const samePhotos = (a: PhotoItem[], b: PhotoItem[]) => a.length === b.length && a.every((photo, i) => photo === b[i]);

const reconcile = (previous: Entry[], photos: PhotoItem[], keepLeaving: boolean): Entry[] => {
    const wanted = new Set(photos.map(photo => photo.id));
    const before = new Map(previous.map(entry => [entry.photo.id, entry.phase]));
    const next: Entry[] = [];
    const placed = new Set<string>();
    let cursor = 0;
    const placeThrough = (id?: string) => {
        while (cursor < photos.length) {
            const photo = photos[cursor];
            cursor += 1;
            if (placed.has(photo.id)) continue;
            placed.add(photo.id);
            const phase = before.get(photo.id);
            next.push({ photo, phase: phase === undefined ? 'enter' : phase === 'leave' ? 'in' : phase });
            if (photo.id === id) return;
        }
    };
    for (const entry of previous) {
        const { id } = entry.photo;
        if (wanted.has(id)) {
            if (!placed.has(id)) placeThrough(id);
        } else if (keepLeaving) {
            next.push({ photo: entry.photo, phase: 'leave' });
        }
    }
    placeThrough();
    return next;
};

const enteringSpan = (entries: Entry[], look: Look): { left: number; right: number } | null => {
    let x = 0;
    let first = true;
    let left = Infinity;
    let right = -Infinity;
    for (const entry of entries) {
        if (entry.phase === 'leave') continue;
        if (!first) x += look.gapPx;
        first = false;
        if (entry.phase === 'enter') {
            left = Math.min(left, x);
            right = x + look.tilePx;
        }
        x += look.tilePx;
    }
    return right < 0 ? null : { left, right };
};

export const SelectedPhotoStrip = ({
    photos,
    onRemove,
    removeLabel = position => `Remove photo ${position}`,
    onSelect,
    selectLabel = position => `Open photo ${position}`,
    editedLabel = 'Edited',
    label,
    size = 'regular',
    onExited,
    className,
}: SelectedPhotoStripProps) => {
    const baseId = React.useId();
    const look = SIZES[size];
    const open = photos.length > 0;

    const [tracked, setTracked] = React.useState(() => ({ photos, entries: settledEntries(photos) }));
    let entries = tracked.entries;
    if (tracked.photos !== photos && !samePhotos(tracked.photos, photos)) {
        if (photos.length === 0) entries = tracked.entries;
        else if (tracked.photos.length === 0) entries = settledEntries(photos);
        else entries = reconcile(tracked.entries, photos, !prefersReducedMotion());
        setTracked({ photos, entries });
    }

    const [natural, setNatural] = React.useState<number | null>(null);
    const measure = React.useCallback((node: HTMLDivElement | null) => {
        if (!node) return undefined;
        const read = () => setNatural(node.offsetHeight);
        read();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(read);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    const { mounted, shown, instant, ref, onTransitionEnd } = useSlidePresence<HTMLDivElement>(open, {
        property: 'height',
        onSettled: state => {
            if (state === 'closed') onExited?.();
        },
    });

    const scrollerRef = React.useRef<HTMLDivElement | null>(null);
    const scrollFrame = React.useRef(0);
    const stopScroll = React.useCallback(() => {
        if (scrollFrame.current) window.cancelAnimationFrame(scrollFrame.current);
        scrollFrame.current = 0;
    }, []);
    React.useEffect(() => stopScroll, [stopScroll]);

    React.useLayoutEffect(() => {
        const span = enteringSpan(entries, look);
        if (!span) return;
        const scroller = scrollerRef.current;
        scroller?.getBoundingClientRect();
        setTracked(current => ({
            ...current,
            entries: current.entries.map(entry => (entry.phase === 'enter' ? { ...entry, phase: 'in' } : entry)),
        }));
        if (!scroller) return;
        const from = scroller.scrollLeft;
        const view = scroller.clientWidth;
        let to = from;
        if (span.right + look.endPx > from + view) to = span.right + look.endPx - view;
        else if (span.left < from) to = span.left;
        if (to === from) return;
        stopScroll();
        if (prefersReducedMotion()) {
            scroller.scrollLeft = to;
            return;
        }
        let start: number | null = null;
        const step = (now: number) => {
            start ??= now;
            const progress = Math.min(1, (now - start) / SLIDE_MS);
            scroller.scrollLeft = from + (to - from) * slideEase(progress);
            scrollFrame.current = progress < 1 ? window.requestAnimationFrame(step) : 0;
        };
        scrollFrame.current = window.requestAnimationFrame(step);
    }, [entries, look, stopScroll]);

    const purgeLeaving = React.useCallback((id?: string) => {
        setTracked(current => {
            const kept = current.entries.filter(
                entry => entry.phase !== 'leave' || (id !== undefined && entry.photo.id !== id)
            );
            return kept.length === current.entries.length ? current : { ...current, entries: kept };
        });
    }, []);
    const leavingIds = entries
        .filter(entry => entry.phase === 'leave')
        .map(entry => entry.photo.id)
        .join('\n');
    React.useEffect(() => {
        if (!leavingIds) return undefined;
        const timer = window.setTimeout(() => purgeLeaving(), SLIDE_FALLBACK_MS);
        return () => window.clearTimeout(timer);
    }, [leavingIds, purgeLeaving]);

    if (!mounted) return null;

    let position = 0;
    let anyBefore = false;
    return (
        <div
            ref={ref}
            data-picked-strip=""
            data-shown={shown}
            inert={!open}
            aria-hidden={!open || undefined}
            onTransitionEnd={onTransitionEnd}
            style={{ height: shown ? (natural ?? undefined) : 0 }}
            className={cn(
                'shrink-0 overflow-hidden',
                instant ? 'transition-none' : cn('transition-[height]', SLIDE_TIMING)
            )}
        >
            <div
                ref={measure}
                className={cn(
                    'flow-root',
                    instant ? 'transition-none' : cn('transition-[transform,opacity]', SLIDE_TIMING),
                    shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                )}
            >
                <div
                    role={label ? 'group' : undefined}
                    aria-label={label}
                    data-size={size}
                    className={cn(look.root, className)}
                >
                    <div
                        ref={scrollerRef}
                        onPointerDown={stopScroll}
                        onWheel={stopScroll}
                        className={cn('flex overflow-x-auto [scrollbar-width:none]', look.row)}
                    >
                        {entries.map((entry, index) => {
                            const { photo, phase } = entry;
                            const staying = phase !== 'leave';
                            if (staying) position += 1;
                            const spaced = staying && anyBefore;
                            if (staying) anyBefore = true;
                            const placed = phase === 'in';
                            const markId = `${baseId}-edited-${index}`;
                            const thumbnail = (
                                <>
                                    {photo.edited ? (
                                        <EditedPhotoImage
                                            src={photo.edited.src}
                                            width={photo.edited.width}
                                            height={photo.edited.height}
                                            edit={photo.edited.edit}
                                            fit="cover"
                                        />
                                    ) : (
                                        <img
                                            src={photo.src}
                                            alt=""
                                            className="size-full object-cover"
                                            draggable={false}
                                        />
                                    )}
                                    {photo.kind === 'video' && <VideoMark className={look.video} />}
                                    {photo.edited && (
                                        <span
                                            data-edited-mark=""
                                            className={cn(
                                                'pointer-events-none absolute flex items-center justify-center rounded-full bg-black/50',
                                                look.edited
                                            )}
                                        >
                                            <IconEdit className={cn('text-white', look.editedIcon)} aria-hidden />
                                            <span id={markId} className="sr-only">
                                                {editedLabel}
                                            </span>
                                        </span>
                                    )}
                                </>
                            );
                            const at = position;
                            return (
                                <div
                                    key={photo.id}
                                    data-picked-item=""
                                    data-phase={phase}
                                    inert={!staying}
                                    aria-hidden={!staying || undefined}
                                    style={{
                                        width: placed ? look.tilePx : 0,
                                        marginLeft: placed && spaced ? look.gapPx : 0,
                                    }}
                                    onTransitionEnd={event => {
                                        const ownWidth =
                                            event.target === event.currentTarget && event.propertyName === 'width';
                                        if (ownWidth && phase === 'leave') purgeLeaving(photo.id);
                                    }}
                                    className={cn(
                                        'relative shrink-0',
                                        instant ? 'transition-none' : cn('transition-[width,margin-left]', SLIDE_TIMING)
                                    )}
                                >
                                    <div
                                        data-picked-tile=""
                                        className={cn(
                                            'relative',
                                            look.tile,
                                            cn('transition-[transform,opacity]', SLIDE_TIMING),
                                            placed ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
                                        )}
                                    >
                                        {onSelect ? (
                                            <button
                                                type="button"
                                                aria-label={selectLabel(at)}
                                                aria-describedby={photo.edited ? markId : undefined}
                                                onClick={() => onSelect(photo.id)}
                                                className="relative block size-full overflow-hidden rounded-[8px]"
                                            >
                                                {thumbnail}
                                            </button>
                                        ) : (
                                            <div className="relative size-full overflow-hidden rounded-[8px]">
                                                {thumbnail}
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            aria-label={removeLabel(at)}
                                            onClick={() => onRemove(photo.id)}
                                            className={cn(
                                                'absolute flex items-center rounded-full bg-tile-ring/[0.76] backdrop-blur-[1px]',
                                                look.chip
                                            )}
                                        >
                                            <IconClose className={cn('text-foreground', look.chipIcon)} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
