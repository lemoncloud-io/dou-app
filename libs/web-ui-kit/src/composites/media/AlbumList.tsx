import { cn } from '@chatic/lib/utils';

import { PreviewImage } from './PreviewImage';
import type { PhotoAlbum } from './types';

export interface AlbumListProps {
    albums: PhotoAlbum[];
    onSelect: (id: string) => void;
    /** Formats the photo count under each title. Host supplies it so digits follow the locale. */
    formatCount?: (count: number) => string;
    className?: string;
}

/** The album chooser that replaces the grid while the title dropdown is open (Figma `3767:32638`). */
export const AlbumList = ({ albums, onSelect, formatCount = count => String(count), className }: AlbumListProps) => (
    <ul className={cn('flex w-full flex-col gap-0.5 px-4 py-1', className)}>
        {albums.map(album => (
            <li key={album.id}>
                <button
                    type="button"
                    onClick={() => onSelect(album.id)}
                    className="flex w-full items-center gap-4 py-[7px] text-left"
                >
                    <span className="relative size-16 shrink-0 overflow-hidden rounded-[8px] bg-muted">
                        <PreviewImage src={album.coverSrc ?? ''} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1 font-medium leading-[1.5]">
                        <span className="truncate text-[16px] tracking-[-0.08px] text-foreground">{album.title}</span>
                        <span className="text-[14px] tracking-[-0.07px] text-description">
                            {formatCount(album.count)}
                        </span>
                    </span>
                </button>
            </li>
        ))}
    </ul>
);
