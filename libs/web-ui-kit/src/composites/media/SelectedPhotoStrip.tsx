import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconClose, IconEdit } from '../../resources/icons';
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

/**
 * `regular` is the photo grid's strip. `compact` is the row a chat composer keeps above its field
 * while photos wait there: smaller tiles, tighter spacing, on a soft surface of its own that hugs them.
 */
export type SelectedPhotoStripSize = 'regular' | 'compact';

export interface SelectedPhotoStripProps {
    /** Picked photos, in pick order. */
    photos: PhotoItem[];
    onRemove: (id: string) => void;
    /** Accessible name for a remove button; receives the 1-based position. */
    removeLabel?: (position: number) => string;
    /** Omit to leave the thumbnails untappable. With it, a tap on one hands its id to the host. */
    onSelect?: (id: string) => void;
    /** Accessible name for a tappable thumbnail; receives the 1-based position. */
    selectLabel?: (position: number) => string;
    /** Accessible name of the mark an edited photo carries. */
    editedLabel?: string;
    /**
     * Names the row, which then reads as a group. Worth giving where nothing around the row says
     * what it is — above a composer, rather than under the grid's own title.
     */
    label?: string;
    /** Defaults to `regular`. */
    size?: SelectedPhotoStripSize;
    /**
     * Called once the strip has finished closing after its last photo left — for a host that keeps
     * something of its own around it until then.
     */
    onExited?: () => void;
    /**
     * On the row's surface, inside the part that opens and closes. Space the host wants between the
     * row and what follows it belongs here, as a margin: it then opens and closes with the row, where
     * the same space on a wrapper would stay behind when the row has gone.
     */
    className?: string;
}

/**
 * What differs between the two sizes. Everything else — order, marks, the two buttons, the motion — is
 * shared. The pixel values are the ones the motion is computed from: a tile's width and the space before
 * it are animated as numbers, and the end padding is what scrolling a new tile into view leaves after it.
 */
const SIZES = {
    regular: {
        root: 'w-full p-3',
        // Room on the top and right for the remove chip, which hangs off each tile's corner: the
        // scroller clips whatever leaves its box.
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
        // A composer has no surface — the message list scrolls on behind it — so the row brings one,
        // in the field's own glass: without it the thumbnails run into a photo message passing under
        // them. White on the room's white, it shows only when something is behind it. Its padding and
        // the row's together leave 6px beside and below the tiles and 8px above, where the chips hang.
        root: 'w-fit max-w-full rounded-2xl bg-white/80 pb-1.5 pl-1.5 pr-px pt-[3px] backdrop-blur-[4px] dark:bg-black/80',
        row: 'pr-[5px] pt-[5px]',
        endPx: 5,
        tile: 'size-12',
        tilePx: 48,
        gapPx: 8,
        // The chip is drawn small, and its target reaches past it: 18px is too little to hit with a
        // thumb, and the corner it grows into is the thumbnail's least useful part.
        chip: "-right-[5px] -top-[5px] p-[3px] after:absolute after:-inset-1.5 after:content-['']",
        chipIcon: 'size-3',
        edited: 'bottom-0.5 left-0.5 size-4',
        editedIcon: 'size-2.5',
        video: 'bottom-0.5 left-0.5 pr-1',
    },
} as const;

type Look = (typeof SIZES)[SelectedPhotoStripSize];

/**
 * Where a drawn tile is in its life. `enter`: just added, drawn at no width for one commit so that
 * widening it is a transition. `in`: in its place. `leave`: removed by the host, closing its space where
 * it stood until that has played out.
 */
type Phase = 'enter' | 'in' | 'leave';

interface Entry {
    photo: PhotoItem;
    phase: Phase;
}

const settledEntries = (photos: PhotoItem[]): Entry[] => photos.map(photo => ({ photo, phase: 'in' }));

const samePhotos = (a: PhotoItem[], b: PhotoItem[]) => a.length === b.length && a.every((photo, i) => photo === b[i]);

/**
 * The tiles to draw for a new pick list: the host's photos in its order, with each removed one kept
 * where it stood, leaving, unless `keepLeaving` is off. A photo picked again while it was leaving comes
 * back where the host now puts it. A new one always starts at `enter`, even where nothing will animate:
 * it is also how the row knows what to scroll into view.
 */
const reconcile = (previous: Entry[], photos: PhotoItem[], keepLeaving: boolean): Entry[] => {
    const wanted = new Set(photos.map(photo => photo.id));
    const before = new Map(previous.map(entry => [entry.photo.id, entry.phase]));
    const next: Entry[] = [];
    const placed = new Set<string>();
    let cursor = 0;
    // Lays out the host's photos up to and including `id` (all of them without one).
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

/**
 * Where the newly added tiles will sit once everything has settled, in the row's content coordinates —
 * not where they are drawn now, which is at no width. `null` when nothing was added.
 */
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

/**
 * The picked photos in pick order, each with a remove chip on its corner — above the grid (Figma
 * `3767:31297`, 64px thumbnails), and, `compact`, above a chat composer while the photos wait there
 * for its send button (48px). Removing here is the same as un-picking in the grid. A picked video
 * keeps its play mark, without its length, which a tile this small has no room for.
 *
 * With `onSelect` a thumbnail is a button of its own — the photo editor opens on it — and the remove
 * chip stays a separate button beside it rather than inside it, so each is reachable on its own. A
 * photo carrying an edit (`edited`) is drawn as edited, cropped to the square, with a small pencil mark
 * so a crop that happens to look natural is still told apart from the original.
 *
 * It moves rather than jumps, on the slide's timing. The host keeps it mounted whether or not anything
 * is picked. When the first photo is picked it opens from no height to its own, its content rising a
 * little and fading in, so whatever sits under it is pushed down along with it; when the last one goes
 * it closes the same way, still showing that photo, and draws nothing once closed. A photo picked
 * while it is open widens into the row from nothing, and the row scrolls along to keep it in view; a
 * photo removed narrows to nothing where it stood while the ones after it slide over. Open with photos
 * on its first render, it is simply there. Under reduced motion all of it is instant.
 */
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

    // The tiles drawn, kept in step with `photos` during render rather than in an effect, so a commit
    // never draws the new list without the tiles that are leaving it.
    const [tracked, setTracked] = React.useState(() => ({ photos, entries: settledEntries(photos) }));
    let entries = tracked.entries;
    if (tracked.photos !== photos && !samePhotos(tracked.photos, photos)) {
        // Emptied, it keeps drawing what it last showed while it closes; opened again, it starts
        // from the host's list as it stands, since the opening is the motion.
        if (photos.length === 0) entries = tracked.entries;
        else if (tracked.photos.length === 0) entries = settledEntries(photos);
        else entries = reconcile(tracked.entries, photos, !prefersReducedMotion());
        setTracked({ photos, entries });
    }

    // The height it opens to. Measured on an inner wrapper that is never squeezed, once when that
    // wrapper mounts — which is ahead of the opening, since a ref is attached before the layout effect
    // that starts the move — and again only if its own size changes.
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

    // A tile just added is drawn once at no width; this lays that out, then lets it widen, and scrolls
    // the row so it will be in view once it has.
    React.useLayoutEffect(() => {
        const span = enteringSpan(entries, look);
        if (!span) return;
        const scroller = scrollerRef.current;
        // Reading layout commits the no-width tile as the style its widening starts from.
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
        // Frame by frame on the slide's own curve, not `scrollTo({ behavior: 'smooth' })`: a smooth
        // scroll is clamped to the width the row has when it starts, before the new tile has grown
        // into it, and would stop short. Each frame's position is clamped to that frame's width, so the
        // row keeps pace with the tile as it widens.
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
    // A tile leaves when its narrowing ends; this is for when that end is never reported (a hidden tab).
    // Keyed on which tiles are leaving, so it counts from the latest one to start.
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

    // Positions count only the tiles staying, so the labels read 1…n while one is on its way out.
    let position = 0;
    let anyBefore = false;
    return (
        <div
            ref={ref}
            data-picked-strip=""
            data-shown={shown}
            // On its way out it takes no tap, no focus and no reading: what it shows is already gone.
            inert={!open}
            aria-hidden={!open || undefined}
            onTransitionEnd={onTransitionEnd}
            // Unmeasured, it takes its own height: the first draw of a strip that mounts open.
            style={{ height: shown ? (natural ?? undefined) : 0 }}
            className={cn(
                'shrink-0 overflow-hidden',
                instant ? 'transition-none' : cn('transition-[height]', SLIDE_TIMING)
            )}
        >
            {/* A block formatting context, so a margin the host gives the row is inside what is measured. */}
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
                        // The person took over: a scroll still moving toward a new tile stops where it is.
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
                                            {/* Text rather than a label on the glyph: it is what a thumbnail
                                                button's description points at, and plain text is read the
                                                same way everywhere. */}
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
                                    // The slot, not the tile, changes width: the space before it goes with it,
                                    // so the next tile slides over by exactly what this one took. The gap is a
                                    // margin of each slot rather than the row's own, which a slot of no width
                                    // would still be flanked by.
                                    style={{
                                        width: placed ? look.tilePx : 0,
                                        marginLeft: placed && spaced ? look.gapPx : 0,
                                    }}
                                    onTransitionEnd={event => {
                                        // Its own narrowing, not the tile's fade inside it.
                                        const ownWidth =
                                            event.target === event.currentTarget && event.propertyName === 'width';
                                        if (ownWidth && phase === 'leave') purgeLeaving(photo.id);
                                    }}
                                    className={cn(
                                        'relative shrink-0',
                                        instant ? 'transition-none' : cn('transition-[width,margin-left]', SLIDE_TIMING)
                                    )}
                                >
                                    {/* The tile keeps its size and overflows its narrowing slot, shrinking
                                        and fading while the next one slides over it. */}
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
