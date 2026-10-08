import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { SLIDE_TIMING, useSlidePresence } from '../overlay/slidePresence';
import { PreviewImage } from './PreviewImage';
import type { PhotoItem } from './types';
import { VideoMark } from './VideoMark';

export interface RecentPhotoStripProps {
    /** Header title, e.g. "Recent photos". */
    title: string;
    /** Label of the header link that opens the full grid. */
    seeAllLabel: string;
    onSeeAll: () => void;
    photos: PhotoItem[];
    /**
     * The library has not answered yet. Every place a photo has not filled yet is a skeleton tile, up to
     * `placeholderCount`, under the real title row — the row is its full size from its first frame, so
     * whatever sits under it is not pushed down when the photos come. A photo takes its place's tile as
     * it arrives and fades in over it, as `PreviewImage` does. "See all" waits for the first one.
     */
    loading?: boolean;
    /** How many skeleton tiles a loading row draws. Default 6: more than a phone's width shows. */
    placeholderCount?: number;
    /**
     * Without `onToggle`: fired with the tapped photo, and the host opens the grid with it already
     * picked. Ignored once `onToggle` is given.
     */
    onSelect?: (id: string) => void;
    /**
     * Picks in place: fired with the tapped photo's id, picked or not — the host adds or removes it.
     * Each tile then reports whether it is picked.
     */
    onToggle?: (id: string) => void;
    /** Ids picked, in pick order. A picked tile dims and carries its place in that order. */
    picked?: string[];
    /** How many may be picked. Unpicked tiles lock once it is reached. Default: no cap. */
    max?: number;
    /** Accessible name for a photo; receives the 1-based position. */
    photoLabel?: (position: number) => string;
    /** Accessible name for a video; receives the 1-based position. Default: `photoLabel`. */
    videoLabel?: (position: number) => string;
    /** On the row itself, inside the part that opens and closes. */
    className?: string;
}

const NONE: string[] = [];

/** What the row draws: the photos, then the skeleton tiles standing in for those still to come. */
interface View {
    photos: PhotoItem[];
    skeletons: number;
}

/**
 * The attach panel's recent-photos row (Figma `3749:28507` + `3749:28722`): a title and a "see all"
 * link over 90px rounded thumbnails in a row that scrolls sideways, each with an empty select ring.
 *
 * With `onToggle` the row picks in place, as the grid does: a picked tile dims and its ring becomes
 * the grid's lime badge carrying the pick order, and at `max` the unpicked tiles lock. Without it a tap
 * hands the photo to the host, which opens the grid with it already picked.
 *
 * While the library has not answered (`loading`) it draws its frame with skeleton tiles, so the panel
 * has its final layout from the first frame. With nothing to draw — no photos, nothing loading — it
 * draws nothing, so a library that answered empty does not leave a titled hole in the panel. It moves
 * between the two rather than jumping, on the slide's timing, as the picked strip does: kept mounted
 * and emptied, it closes from its own height to none, still drawing what it last showed, so the panel's
 * tiles under it rise with it; given something to draw later, it opens the same way. Drawing something
 * on its first render, it is simply there. Stateless: the pick and the loading are the host's.
 */
export const RecentPhotoStrip = ({
    title,
    seeAllLabel,
    onSeeAll,
    photos,
    loading = false,
    placeholderCount = 6,
    onSelect,
    onToggle,
    picked = NONE,
    max = Number.POSITIVE_INFINITY,
    photoLabel = position => `Recent photo ${position}`,
    videoLabel = photoLabel,
    className,
}: RecentPhotoStripProps) => {
    const skeletons = loading ? Math.max(0, placeholderCount - photos.length) : 0;
    const present = photos.length > 0 || skeletons > 0;

    // What it last drew, for the close: emptied, it keeps showing that while its height goes. Kept in
    // step during render, so a commit never draws a closing row without it.
    const [last, setLast] = React.useState<View>({ photos, skeletons });
    if (present && (last.photos !== photos || last.skeletons !== skeletons)) setLast({ photos, skeletons });
    const view: View = present ? { photos, skeletons } : last;

    // The height it opens to, measured on an inner wrapper that is never squeezed: once when that wrapper
    // mounts, and again only if its own size changes — which skeletons giving way to photos does not.
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

    const { mounted, shown, instant, ref, onTransitionEnd } = useSlidePresence<HTMLDivElement>(present, {
        property: 'height',
    });

    if (!mounted) return null;
    const pickable = onToggle !== undefined;
    const full = picked.length >= max;
    // Nothing has arrived yet: what "see all" would open may not exist.
    const waiting = view.photos.length === 0;
    return (
        <div
            ref={ref}
            data-recent-strip=""
            data-shown={shown}
            // On its way out it takes no tap, no focus and no reading: what it shows is already gone.
            inert={!present}
            aria-hidden={!present || undefined}
            onTransitionEnd={onTransitionEnd}
            // Unmeasured, it takes its own height: the first draw of a row that mounts with something.
            style={{ height: shown ? (natural ?? undefined) : 0 }}
            className={cn(
                'w-full shrink-0 overflow-hidden',
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
                    aria-busy={view.skeletons > 0 || undefined}
                    className={cn('flex w-full flex-col gap-1', className)}
                >
                    <div className="flex items-center gap-3 px-4 py-3.5 text-[16px] font-semibold leading-[1.5] tracking-[-0.08px]">
                        <span className="min-w-0 flex-1 truncate text-foreground">{title}</span>
                        <button
                            type="button"
                            onClick={onSeeAll}
                            disabled={waiting}
                            className="shrink-0 text-point-blue disabled:cursor-default"
                        >
                            {seeAllLabel}
                        </button>
                    </div>
                    {/* pan-x: a sideways drag scrolls the row, and an up-and-down one is never taken for
                        it. The scrollbar is hidden twice because older WebKit knows only the pseudo-element. */}
                    <div className="flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {view.photos.map((photo, index) => {
                            const order = pickable ? picked.indexOf(photo.id) + 1 : 0;
                            const isPicked = order > 0;
                            return (
                                <button
                                    key={photo.id}
                                    type="button"
                                    aria-label={(photo.kind === 'video' ? videoLabel : photoLabel)(index + 1)}
                                    aria-pressed={pickable ? isPicked : undefined}
                                    onClick={() => (onToggle ? onToggle(photo.id) : onSelect?.(photo.id))}
                                    disabled={pickable && full && !isPicked}
                                    className="relative size-[90px] shrink-0 overflow-hidden rounded-[12px] bg-muted disabled:cursor-not-allowed"
                                >
                                    <PreviewImage src={photo.src} />
                                    {photo.kind === 'video' && <VideoMark durationMs={photo.durationMs} />}
                                    {isPicked ? (
                                        <>
                                            <span aria-hidden className="absolute inset-0 bg-black/[0.52]" />
                                            {/* The grid tile's badge, centred where the 16px ring was (the
                                                ring's 32×30 corner box in the design), so it grows out of the
                                                ring tapped. */}
                                            <span
                                                aria-hidden
                                                className="absolute right-1 top-[3px] flex size-6 items-center justify-center rounded-full border border-primary bg-primary"
                                            >
                                                <span className="w-[18px] text-center text-[13px] font-semibold leading-[15px] tracking-[-0.455px] text-black">
                                                    {order}
                                                </span>
                                            </span>
                                        </>
                                    ) : (
                                        <span
                                            aria-hidden
                                            className="absolute right-2 top-[7px] size-4 rounded-full border border-tile-ring bg-white/[0.68] backdrop-blur-[3px]"
                                        />
                                    )}
                                </button>
                            );
                        })}
                        {/* Keyed by place, so a photo arriving replaces the tile in its own place and the
                            ones after it stay as they are. A real tile starts as the same muted square,
                            which its preview then fades in over. */}
                        {Array.from({ length: view.skeletons }, (_, i) => (
                            <span
                                key={`place-${view.photos.length + i}`}
                                aria-hidden
                                data-recent-placeholder=""
                                className="size-[90px] shrink-0 rounded-[12px] bg-muted motion-safe:animate-pulse"
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
