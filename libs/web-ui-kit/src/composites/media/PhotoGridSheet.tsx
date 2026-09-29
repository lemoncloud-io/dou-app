import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { FloatingButton } from '../../foundations/button/FloatingButton';
import { IconCameraSolid, IconChevronDown, IconClose } from '../../resources/icons';
import { BottomSheet } from '../overlay/BottomSheet';
import { AlbumList } from './AlbumList';
import { PhotoGridTile } from './PhotoGridTile';
import { SelectedPhotoStrip } from './SelectedPhotoStrip';
import type { PhotoAlbum, PhotoItem } from './types';

export interface PhotoGridSheetLabels {
    camera: string;
    close: string;
    /** Accessible name for a grid tile; receives the 1-based position in the grid. */
    photo: (position: number) => string;
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
    /** The current album's photos, loaded so far. */
    photos: PhotoItem[];
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
    /** Fired when the end of the grid comes into view and `hasMore` is set. */
    onLoadMore?: () => void;
    hasMore?: boolean;
    /** The send button label, already carrying the count (e.g. "3장 보내기"). */
    sendLabel: string;
    onSend: () => void;
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

/**
 * The in-app photo picker (Figma `3749:29014` · `3767:30962` · `3767:32042`): a tall sheet whose title
 * names the album and opens the album list, the picked photos in a strip, a three-column grid led by a
 * camera tile, and a send button that appears once something is picked.
 *
 * Stateless. What is picked, which album is showing and how far it has loaded are the host's — the
 * host also owns reading the library, which this component never touches.
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
    photos,
    picked,
    onToggle,
    max,
    onCamera,
    onLoadMore,
    hasMore = false,
    sendLabel,
    onSend,
    notice,
    labels,
}: PhotoGridSheetProps) => {
    const text = { ...DEFAULT_LABELS, ...labels };
    const order = React.useMemo(() => new Map(picked.map((photo, index) => [photo.id, index + 1])), [picked]);
    const full = picked.length >= max;

    // State, not a ref: the sheet mounts its content into a portal a commit after this component
    // renders, so a ref read in an effect is still empty on the first pass — and with nothing else
    // changing, the observer would never be attached. Holding the node in state re-runs the effect
    // the moment it exists.
    const [sentinel, setSentinel] = React.useState<HTMLDivElement | null>(null);
    const loadMoreRef = React.useRef(onLoadMore);
    loadMoreRef.current = onLoadMore;

    // The grid pages in as it scrolls. An observer on a sentinel after the last row rather than a
    // scroll listener: the sheet's body is the scroll container and it is not ours to listen to.
    // Browsers without the observer simply never page past the first load.
    React.useEffect(() => {
        if (!sentinel || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) loadMoreRef.current?.();
        });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [sentinel, photos.length]);

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={albumTitle}
            hideHeader
            // The upward shadow is the design's (Figma 3767:31025): on a white page the sheet has no other edge.
            className="h-[calc(90vh-var(--keyboard-height,0px))] rounded-t-[20px] shadow-[0_-2px_6px_rgba(0,0,0,0.12)]"
            footer={
                picked.length > 0 && !albumsOpen ? <FloatingButton label={sendLabel} onClick={onSend} /> : undefined
            }
        >
            <div className="relative flex items-center justify-end px-4 py-3.5">
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
                <AlbumList albums={albums} onSelect={onSelectAlbum} formatCount={formatAlbumCount} />
            ) : (
                <>
                    {notice}
                    <SelectedPhotoStrip
                        photos={picked}
                        onRemove={id => {
                            const photo = picked.find(p => p.id === id);
                            if (photo) onToggle(photo);
                        }}
                        removeLabel={text.remove}
                    />
                    <div className="grid grid-cols-3 gap-1">
                        {onCamera && (
                            <button
                                type="button"
                                onClick={onCamera}
                                className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-media-tile px-2 text-media-tile-foreground"
                            >
                                <IconCameraSolid className="text-white" />
                                <span className="text-[14px] font-medium leading-[1.4] tracking-[-0.07px]">
                                    {text.camera}
                                </span>
                            </button>
                        )}
                        {photos.map((photo, index) => (
                            <PhotoGridTile
                                key={photo.id}
                                src={photo.src}
                                order={order.get(photo.id)}
                                onToggle={() => onToggle(photo)}
                                disabled={full}
                                label={text.photo(index + 1)}
                            />
                        ))}
                    </div>
                    {hasMore && <div ref={setSentinel} data-testid="photo-grid-sentinel" className="h-px" />}
                </>
            )}
        </BottomSheet>
    );
};
