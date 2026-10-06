import { cn } from '@chatic/lib/utils';

import { IconClose } from '../../resources/icons';
import type { PhotoItem } from './types';
import { VideoMark } from './VideoMark';

export interface SelectedPhotoStripProps {
    /** Picked photos, in pick order. */
    photos: PhotoItem[];
    onRemove: (id: string) => void;
    /** Accessible name for a remove button; receives the 1-based position. */
    removeLabel?: (position: number) => string;
    className?: string;
}

/**
 * The picked photos above the grid (Figma `3767:31297`): 64px thumbnails in pick order, each with a
 * remove chip on its corner. Removing here is the same as un-picking in the grid. A picked video keeps
 * its play mark, without its length, which a 64px tile has no room for. Draws nothing when nothing is
 * picked.
 */
export const SelectedPhotoStrip = ({
    photos,
    onRemove,
    removeLabel = position => `Remove photo ${position}`,
    className,
}: SelectedPhotoStripProps) => {
    if (photos.length === 0) return null;
    return (
        <div className={cn('w-full p-3', className)}>
            <div className="flex gap-3.5 overflow-x-auto py-3 pr-2 [scrollbar-width:none]">
                {photos.map((photo, index) => (
                    <div key={photo.id} className="relative size-16 shrink-0">
                        <img
                            src={photo.src}
                            alt=""
                            className="size-full rounded-[8px] object-cover"
                            draggable={false}
                        />
                        {photo.kind === 'video' && <VideoMark className="bottom-1 left-1 pr-1" />}
                        <button
                            type="button"
                            aria-label={removeLabel(index + 1)}
                            onClick={() => onRemove(photo.id)}
                            className="absolute -right-[7px] -top-[7px] flex items-center rounded-full bg-tile-ring/[0.76] p-1 backdrop-blur-[1px]"
                        >
                            <IconClose className="size-4 text-foreground" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
