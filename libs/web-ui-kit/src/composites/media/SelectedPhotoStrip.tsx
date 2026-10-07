import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconClose, IconEdit } from '../../resources/icons';
import { EditedPhotoImage } from './EditedPhotoImage';
import type { PhotoItem } from './types';
import { VideoMark } from './VideoMark';

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
    className?: string;
}

/**
 * The picked photos above the grid (Figma `3767:31297`): 64px thumbnails in pick order, each with a
 * remove chip on its corner. Removing here is the same as un-picking in the grid. A picked video keeps
 * its play mark, without its length, which a 64px tile has no room for. Draws nothing when nothing is
 * picked.
 *
 * With `onSelect` a thumbnail is a button of its own — the photo editor opens on it — and the remove
 * chip stays a separate button beside it rather than inside it, so each is reachable on its own. A
 * photo carrying an edit (`edited`) is drawn as edited, cropped to the square, with a small pencil mark
 * so a crop that happens to look natural is still told apart from the original.
 */
export const SelectedPhotoStrip = ({
    photos,
    onRemove,
    removeLabel = position => `Remove photo ${position}`,
    onSelect,
    selectLabel = position => `Open photo ${position}`,
    editedLabel = 'Edited',
    className,
}: SelectedPhotoStripProps) => {
    const baseId = React.useId();
    if (photos.length === 0) return null;
    return (
        <div className={cn('w-full p-3', className)}>
            <div className="flex gap-3.5 overflow-x-auto py-3 pr-2 [scrollbar-width:none]">
                {photos.map((photo, index) => {
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
                                <img src={photo.src} alt="" className="size-full object-cover" draggable={false} />
                            )}
                            {photo.kind === 'video' && <VideoMark className="bottom-1 left-1 pr-1" />}
                            {photo.edited && (
                                <span
                                    data-edited-mark=""
                                    className="pointer-events-none absolute bottom-1 left-1 flex size-5 items-center justify-center rounded-full bg-black/50"
                                >
                                    <IconEdit className="size-3 text-white" aria-hidden />
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
                    return (
                        <div key={photo.id} className="relative size-16 shrink-0">
                            {onSelect ? (
                                <button
                                    type="button"
                                    aria-label={selectLabel(index + 1)}
                                    aria-describedby={photo.edited ? markId : undefined}
                                    onClick={() => onSelect(photo.id)}
                                    className="relative block size-full overflow-hidden rounded-[8px]"
                                >
                                    {thumbnail}
                                </button>
                            ) : (
                                <div className="relative size-full overflow-hidden rounded-[8px]">{thumbnail}</div>
                            )}
                            <button
                                type="button"
                                aria-label={removeLabel(index + 1)}
                                onClick={() => onRemove(photo.id)}
                                className="absolute -right-[7px] -top-[7px] flex items-center rounded-full bg-tile-ring/[0.76] p-1 backdrop-blur-[1px]"
                            >
                                <IconClose className="size-4 text-foreground" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
