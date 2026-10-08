import { cn } from '@chatic/lib/utils';

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
    className?: string;
}

const NONE: string[] = [];

/**
 * The attach panel's recent-photos row (Figma `3749:28507` + `3749:28722`): a title and a "see all"
 * link over 90px rounded thumbnails in a row that scrolls sideways, each with an empty select ring.
 *
 * With `onToggle` the row picks in place, as the grid does: a picked tile dims and its ring becomes
 * the grid's lime badge carrying the pick order, and at `max` the unpicked tiles lock. Without it a tap
 * hands the photo to the host, which opens the grid with it already picked.
 *
 * Draws nothing without photos, so a library that answered empty does not leave a titled hole in the
 * panel. Stateless: the pick is the host's.
 */
export const RecentPhotoStrip = ({
    title,
    seeAllLabel,
    onSeeAll,
    photos,
    onSelect,
    onToggle,
    picked = NONE,
    max = Number.POSITIVE_INFINITY,
    photoLabel = position => `Recent photo ${position}`,
    videoLabel = photoLabel,
    className,
}: RecentPhotoStripProps) => {
    if (photos.length === 0) return null;
    const pickable = onToggle !== undefined;
    const full = picked.length >= max;
    return (
        <div className={cn('flex w-full flex-col gap-1', className)}>
            <div className="flex items-center gap-3 px-4 py-3.5 text-[16px] font-semibold leading-[1.5] tracking-[-0.08px]">
                <span className="min-w-0 flex-1 truncate text-foreground">{title}</span>
                <button type="button" onClick={onSeeAll} className="shrink-0 text-point-blue">
                    {seeAllLabel}
                </button>
            </div>
            {/* pan-x: a sideways drag scrolls the row, and an up-and-down one is never taken for it. The
                scrollbar is hidden twice because older WebKit knows only the pseudo-element. */}
            <div className="flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {photos.map((photo, index) => {
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
                                    {/* The grid tile's badge, centred where the 16px ring was (the ring's
                                        32×30 corner box in the design), so it grows out of the ring tapped. */}
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
            </div>
        </div>
    );
};
