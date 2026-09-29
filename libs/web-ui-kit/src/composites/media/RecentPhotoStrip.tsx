import { cn } from '@chatic/lib/utils';

import type { PhotoItem } from './types';

export interface RecentPhotoStripProps {
    /** Header title, e.g. "Recent photos". */
    title: string;
    /** Label of the header link that opens the full grid. */
    seeAllLabel: string;
    onSeeAll: () => void;
    photos: PhotoItem[];
    /** Fired with the tapped photo — the host opens the grid with it already picked. */
    onSelect: (id: string) => void;
    /** Accessible name for a photo; receives the 1-based position. */
    photoLabel?: (position: number) => string;
    className?: string;
}

/**
 * The attach menu's recent-photos row (Figma `3749:28507` + `3749:28722`): a title and a
 * "see all" link over 90px rounded thumbnails with an empty select ring each.
 *
 * Picking happens in the grid, not here — there is no send button in this menu — so a tap hands the
 * photo to the host, which opens the grid with it already picked. Draws nothing without photos, so a
 * library that answered empty does not leave a titled hole in the menu.
 */
export const RecentPhotoStrip = ({
    title,
    seeAllLabel,
    onSeeAll,
    photos,
    onSelect,
    photoLabel = position => `Recent photo ${position}`,
    className,
}: RecentPhotoStripProps) => {
    if (photos.length === 0) return null;
    return (
        <div className={cn('flex w-full flex-col gap-1', className)}>
            <div className="flex items-center gap-3 px-4 py-3.5 text-[16px] font-semibold leading-[1.5] tracking-[-0.08px]">
                <span className="min-w-0 flex-1 truncate text-foreground">{title}</span>
                <button type="button" onClick={onSeeAll} className="shrink-0 text-point-blue">
                    {seeAllLabel}
                </button>
            </div>
            <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
                {photos.map((photo, index) => (
                    <button
                        key={photo.id}
                        type="button"
                        aria-label={photoLabel(index + 1)}
                        onClick={() => onSelect(photo.id)}
                        className="relative size-[90px] shrink-0 overflow-hidden rounded-[12px] bg-muted"
                    >
                        <img src={photo.src} alt="" className="size-full object-cover" draggable={false} />
                        <span
                            aria-hidden
                            className="absolute right-2 top-[7px] size-[18px] rounded-full border border-tile-ring bg-white/[0.68] backdrop-blur-[3px]"
                        />
                    </button>
                ))}
            </div>
        </div>
    );
};
