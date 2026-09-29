import { useCallback, useRef, useState } from 'react';

import type { PhotoLibraryAccess } from '@chatic/app-messages';
import type { PhotoAlbum, PhotoItem } from '@chatic/web-ui-kit';

import { photoLibrary, photoPreviewSrc, type PhotoLibrary } from '../../../bridge/photoLibrary';

/** How many previews the attach menu shows before "see all". */
const RECENT_COUNT = 4;
/** One page of the grid — three columns, a screen and a half. */
const PAGE_SIZE = 60;

export interface PhotoPicker {
    /**
     * Whether this shell has the in-app picker: `null` until the first probe answers. False in a
     * browser and in an app built before the picker, where the page's own file input is used instead.
     */
    supported: boolean | null;
    access: PhotoLibraryAccess | null;
    recent: PhotoItem[];
    /** Asks the shell once for the newest photos — call when the attach menu opens. */
    probe(): Promise<void>;

    gridOpen: boolean;
    openGrid(preselect?: PhotoItem): void;
    closeGrid(): void;

    albumsOpen: boolean;
    toggleAlbums(): void;
    albums: PhotoAlbum[];
    album: { id?: string; title: string };
    selectAlbum(id: string): void;

    photos: PhotoItem[];
    hasMore: boolean;
    loadMore(): void;

    picked: PhotoItem[];
    toggle(photo: PhotoItem): void;
    /** Reads the picked photos, in pick order, and clears the pick. */
    takePicked(): Promise<File[]>;

    /** iOS limited access: let the user share more, then list again. */
    manageSelection(): Promise<void>;
}

const toItems = (items: { id: string; thumbBase64: string }[]): PhotoItem[] =>
    items.map(item => ({ id: item.id, src: photoPreviewSrc(item.thumbBase64) }));

/**
 * The in-app photo picker's state: what the attach menu previews, which album the grid shows and how
 * far it has loaded, and what is picked. The library itself is read through the shell
 * (`photoLibrary`); this hook only holds what the screen needs of it.
 *
 * `max` caps the pick — the per-message image limit, passed in so the grid and the send agree on it.
 */
export const usePhotoPicker = ({
    max,
    allTitle,
    library = photoLibrary,
}: {
    max: number;
    /** The "all photos" title until the shell's album list names it. */
    allTitle: string;
    library?: PhotoLibrary;
}): PhotoPicker => {
    const [supported, setSupported] = useState<boolean | null>(library.isUnsupported() ? false : null);
    const [access, setAccess] = useState<PhotoLibraryAccess | null>(null);
    const [recent, setRecent] = useState<PhotoItem[]>([]);
    const [gridOpen, setGridOpen] = useState(false);
    const [albumsOpen, setAlbumsOpen] = useState(false);
    const [albums, setAlbums] = useState<PhotoAlbum[]>([]);
    const [album, setAlbum] = useState<{ id?: string; title: string }>({ title: allTitle });
    const [photos, setPhotos] = useState<PhotoItem[]>([]);
    const [next, setNext] = useState<string | undefined>(undefined);
    const [picked, setPicked] = useState<PhotoItem[]>([]);

    // One page in flight at a time. The grid asks again every time a page lands while its end is
    // still in view, and two overlapping requests for the same cursor would append the same page twice.
    const loadingRef = useRef(false);
    // Bumped on every album switch, so a page that lands for the album just left is dropped.
    const albumTokenRef = useRef(0);

    const probe = useCallback(async () => {
        if (library.isUnsupported()) {
            setSupported(false);
            return;
        }
        try {
            const page = await library.photos({ limit: RECENT_COUNT });
            if (!page) {
                setSupported(false);
                return;
            }
            setSupported(true);
            setAccess(page.access);
            setRecent(toItems(page.items));
        } catch {
            // Transient: leave the verdict open, show no strip this time.
            setRecent([]);
        }
    }, [library]);

    const loadPage = useCallback(
        async (albumId: string | undefined, after: string | undefined, token: number) => {
            if (loadingRef.current) return;
            loadingRef.current = true;
            try {
                const page = await library.photos({ albumId, after, limit: PAGE_SIZE });
                if (!page || token !== albumTokenRef.current) return;
                setAccess(page.access);
                setPhotos(previous => (after ? [...previous, ...toItems(page.items)] : toItems(page.items)));
                setNext(page.next);
            } catch {
                // The sentinel asks again when it next comes into view.
            } finally {
                loadingRef.current = false;
            }
        },
        [library]
    );

    const openGrid = useCallback(
        (preselect?: PhotoItem) => {
            setGridOpen(true);
            setAlbumsOpen(false);
            setPicked(preselect ? [preselect] : []);
            const token = ++albumTokenRef.current;
            setPhotos([]);
            setNext(undefined);
            void loadPage(album.id, undefined, token);
            void library
                .albums()
                .then(result => {
                    if (!result) return;
                    setAccess(result.access);
                    setAlbums(
                        result.albums.map(a => ({
                            id: a.id,
                            title: a.title,
                            count: a.count,
                            coverSrc: a.coverBase64 ? photoPreviewSrc(a.coverBase64) : undefined,
                        }))
                    );
                })
                .catch(() => undefined);
        },
        [album.id, library, loadPage]
    );

    const selectAlbum = useCallback(
        (id: string) => {
            const chosen = albums.find(a => a.id === id);
            setAlbum({ id, title: chosen?.title ?? allTitle });
            setAlbumsOpen(false);
            const token = ++albumTokenRef.current;
            // A page for the old album may still be in flight; the token drops it when it lands, and
            // the lock is released so this album's first page is not refused.
            loadingRef.current = false;
            setPhotos([]);
            setNext(undefined);
            void loadPage(id, undefined, token);
        },
        [albums, allTitle, loadPage]
    );

    const loadMore = useCallback(() => {
        if (!next) return;
        void loadPage(album.id, next, albumTokenRef.current);
    }, [album.id, loadPage, next]);

    // Picks survive an album switch on purpose: choosing across albums is the point of the list.
    const toggle = useCallback(
        (photo: PhotoItem) =>
            setPicked(previous => {
                if (previous.some(p => p.id === photo.id)) return previous.filter(p => p.id !== photo.id);
                return previous.length >= max ? previous : [...previous, photo];
            }),
        [max]
    );

    const takePicked = useCallback(async () => {
        const chosen = picked;
        setPicked([]);
        setGridOpen(false);
        // One at a time: each read holds a whole photo as base64 in page memory.
        const files: File[] = [];
        for (const photo of chosen) files.push(await library.read(photo));
        return files;
    }, [library, picked]);

    const manageSelection = useCallback(async () => {
        const after = await library.manageSelection();
        if (after) setAccess(after);
        const token = ++albumTokenRef.current;
        loadingRef.current = false;
        void loadPage(album.id, undefined, token);
    }, [album.id, library, loadPage]);

    return {
        supported,
        access,
        recent,
        probe,
        gridOpen,
        openGrid,
        closeGrid: () => setGridOpen(false),
        albumsOpen,
        toggleAlbums: () => setAlbumsOpen(value => !value),
        albums,
        album,
        selectAlbum,
        photos,
        hasMore: !!next,
        loadMore,
        picked,
        toggle,
        takePicked,
        manageSelection,
    };
};
