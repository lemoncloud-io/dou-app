import { useCallback, useRef, useState } from 'react';

import type { PhotoLibraryAccess, PhotoLibraryItem, RefusedAttachment } from '@chatic/app-messages';
import type { ChatAttachmentSource } from '@chatic/data';
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
    /**
     * Reads the picked photos and keeps the picked videos in the shell, one at a time in pick order,
     * then clears the pick and closes the grid. An item that cannot be read or kept is refused alone;
     * the rest still go.
     */
    takePicked(): Promise<PickedFromGrid>;
    /** Whether `takePicked` is still reading — the grid stays open, saying so, until it is done. */
    preparing: boolean;

    /** iOS limited access: let the user share more, then list again. */
    manageSelection(): Promise<void>;
}

/** What the grid hands to the send: what was read or kept, and what was not, in pick order. */
export interface PickedFromGrid {
    items: ChatAttachmentSource[];
    refused: RefusedAttachment[];
}

const toItems = (items: PhotoLibraryItem[]): PhotoItem[] =>
    items.map(item =>
        item.mediaType === 'video'
            ? {
                  id: item.id,
                  src: photoPreviewSrc(item.thumbBase64),
                  kind: 'video',
                  ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}),
              }
            : { id: item.id, src: photoPreviewSrc(item.thumbBase64) }
    );

const isVideo = (item: PhotoItem) => item.kind === 'video';

/** How a video the shell would not keep is reported — in the words the attach menu already uses. */
const refusalOf = (error: unknown): RefusedAttachment['reason'] => {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'UNSUPPORTED') return 'unsupported';
    if (code === 'TOO_LARGE') return 'too-large';
    return 'unreadable';
};

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
    const [preparing, setPreparing] = useState(false);
    // Read by `toggle` and `closeGrid` in the same tick `takePicked` starts, before the state lands.
    const preparingRef = useRef(false);

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
    // Picks are frozen while a send reads them: a pick changed meanwhile would be dropped when the read
    // ends and clears it, without a word.
    const toggle = useCallback(
        (photo: PhotoItem) => {
            if (preparingRef.current) return;
            setPicked(previous => {
                if (previous.some(p => p.id === photo.id)) return previous.filter(p => p.id !== photo.id);
                return previous.length >= max ? previous : [...previous, photo];
            });
        },
        [max]
    );

    const takePicked = useCallback(async (): Promise<PickedFromGrid> => {
        const chosen = picked;
        // The grid stays open while the pick is read: a video can take minutes to come down from
        // iCloud, and a sheet that closed at once would leave nothing on screen until the row appears.
        preparingRef.current = true;
        setPreparing(true);
        const items: ChatAttachmentSource[] = [];
        const refused: RefusedAttachment[] = [];
        try {
            // One at a time: each photo read holds a whole photo as base64 in page memory, and the shell
            // copies one video at a time.
            for (const item of chosen) {
                if (isVideo(item)) {
                    try {
                        items.push(await library.keepVideo(item));
                    } catch (error) {
                        refused.push({ name: '', kind: 'video', reason: refusalOf(error) });
                    }
                    continue;
                }
                try {
                    items.push(await library.read(item));
                } catch {
                    refused.push({ name: '', kind: 'image', reason: 'unreadable' });
                }
            }
        } finally {
            preparingRef.current = false;
            setPreparing(false);
            setPicked([]);
            setGridOpen(false);
        }
        // An app that turned out unable to keep a video: what it listed of them cannot be picked again.
        if (!library.videosSupported()) {
            setPhotos(previous => previous.filter(item => !isVideo(item)));
            setRecent(previous => previous.filter(item => !isVideo(item)));
        }
        return { items, refused };
    }, [library, picked]);

    const manageSelection = useCallback(async () => {
        // The list below runs either way: whatever the sheet changed is on the device by now, and the
        // page's own answer carries the access, so a sheet call that failed loses nothing worth keeping.
        try {
            const after = await library.manageSelection();
            if (after) setAccess(after);
        } catch {
            // Falls through to the list.
        }
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
        // The grid stays while a send reads the pick; it closes itself when the read is done.
        closeGrid: () => {
            if (!preparingRef.current) setGridOpen(false);
        },
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
        preparing,
        manageSelection,
    };
};
