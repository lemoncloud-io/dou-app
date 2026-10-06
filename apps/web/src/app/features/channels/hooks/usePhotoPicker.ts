import { useCallback, useRef, useState } from 'react';

import type {
    OnListPhotosPayload,
    PhotoLibraryAccess,
    PhotoLibraryItem,
    RefusedAttachment,
} from '@chatic/app-messages';
import type { ChatAttachmentSource } from '@chatic/data';
import {
    gridMetrics,
    thumbPixelSize,
    type PhotoAlbum,
    type PhotoGridRange,
    type PhotoItem,
    type PhotoItemKind,
} from '@chatic/web-ui-kit';

import { photoLibrary, photoPreviewSrc, type PhotoLibrary } from '../../../bridge/photoLibrary';

/** How many previews the attach menu shows before "see all". */
const RECENT_COUNT = 4;
/** The attach menu's preview tile, and the album list's cover, in CSS pixels. */
const RECENT_TILE = 90;
const COVER_TILE = 64;
/** One page of the grid. Pages by offset start at multiples of it, so a page is also an index. */
export const PAGE_SIZE = 60;

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

    /**
     * How many photos the grid lays out: the album's whole count on an app that pages by offset, what
     * has loaded so far on one that pages by cursor.
     */
    count: number;
    /** The photo at a grid index, or undefined while its page has not come — drawn as an empty tile. */
    photoAt(index: number): PhotoItem | undefined;
    /** What the grid shows now; the pages it needs are asked for, nearest first. */
    setVisibleRange(range: PhotoGridRange): void;

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

/**
 * One grid position: which photo it is. Its preview is held apart (in `thumbs`, by id) so the previews
 * of a stretch long scrolled past can be let go later without losing the layout; the ids are small.
 */
interface Slot {
    id: string;
    kind?: PhotoItemKind;
    durationMs?: number;
}

/**
 * How the current album is laid out. `offset`: the app said how many there are, any page can be asked
 * for, and the grid is that tall from the start. `cursor`: an app from before offsets — pages come in
 * order and the grid grows with them. `none`: the first page has not answered yet.
 */
type Layout = 'none' | 'offset' | 'cursor';

const toSlot = (item: PhotoLibraryItem): Slot =>
    item.mediaType === 'video'
        ? { id: item.id, kind: 'video', ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}) }
        : { id: item.id };

const toItems = (items: PhotoLibraryItem[]): PhotoItem[] =>
    items.map(item => ({ ...toSlot(item), src: photoPreviewSrc(item.thumbBase64) }));

/** A preview drawn from the shell's base64; an item the shell could make no preview for draws empty. */
const thumbOf = (item: PhotoLibraryItem): string => (item.thumbBase64 ? photoPreviewSrc(item.thumbBase64) : '');

const isVideo = (item: PhotoItem) => item.kind === 'video';

/** How a video the shell would not keep is reported — in the words the attach menu already uses. */
const refusalOf = (error: unknown): RefusedAttachment['reason'] => {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'UNSUPPORTED') return 'unsupported';
    if (code === 'TOO_LARGE') return 'too-large';
    return 'unreadable';
};

const devicePixelRatio = (): number => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);

/** A tile's preview size, from its CSS size. */
const previewSize = (cssPixels: number): number => thumbPixelSize(cssPixels, devicePixelRatio());

/**
 * Whether previews loaded at `have` pixels look soft at `want`. A fifth of slack: a column step that
 * only grows tiles a little (five columns to four) is not worth asking a page over again for.
 */
export const needsSharperThumbs = (have: number, want: number | undefined): boolean =>
    want !== undefined && have * 1.2 < want;

/**
 * The page to ask for next, on a list laid out by offset: of the pages the visible range touches, the
 * nearest to its middle that has not loaded, or loaded too small for the tiles now. Nearest first,
 * because a fast-scroll drag passes many pages and only the last one it stops at is still wanted.
 * `loaded` maps a page index to the size its previews were asked at.
 */
export const pageToLoad = ({
    range,
    total,
    loaded,
    pageSize = PAGE_SIZE,
}: {
    range: PhotoGridRange;
    total: number;
    loaded: ReadonlyMap<number, number>;
    pageSize?: number;
}): number | undefined => {
    const start = Math.max(0, Math.min(range.start, total));
    const end = Math.max(start, Math.min(range.end, total));
    if (end <= start) return undefined;
    const first = Math.floor(start / pageSize);
    const last = Math.floor((end - 1) / pageSize);
    const middle = (start + end) / 2 / pageSize;
    const pages: number[] = [];
    for (let page = first; page <= last; page += 1) pages.push(page);
    pages.sort((a, b) => Math.abs(a + 0.5 - middle) - Math.abs(b + 0.5 - middle));
    return pages.find(page => {
        const size = loaded.get(page);
        return size === undefined || needsSharperThumbs(size, range.thumbSize);
    });
};

/**
 * The in-app photo picker's state: what the attach menu previews, which album the grid shows and which
 * of it has loaded, and what is picked. The library itself is read through the shell (`photoLibrary`);
 * this hook only holds what the screen needs of it.
 *
 * The grid is virtual: it reports the range on screen, and pages are asked for to cover it, one request
 * at a time, nearest first. On an app that pages by offset the grid knows the album's length from the
 * first answer and any stretch of it can be filled directly — which is what lets a fast-scroll jump to
 * the far end of a long album without paging through it. An older app pages by cursor and the grid
 * grows as it scrolls, as it always did.
 *
 * `max` caps the pick — the per-message image limit, passed in so the grid and the send agree on it.
 * `columns` is the grid's column count, used to size the first page's previews before the grid has
 * measured itself.
 */
export const usePhotoPicker = ({
    max,
    allTitle,
    columns = 3,
    library = photoLibrary,
}: {
    max: number;
    /** The "all photos" title until the shell's album list names it. */
    allTitle: string;
    columns?: number;
    library?: PhotoLibrary;
}): PhotoPicker => {
    const [supported, setSupported] = useState<boolean | null>(library.isUnsupported() ? false : null);
    const [access, setAccess] = useState<PhotoLibraryAccess | null>(null);
    const [recent, setRecent] = useState<PhotoItem[]>([]);
    const [gridOpen, setGridOpen] = useState(false);
    const [albumsOpen, setAlbumsOpen] = useState(false);
    const [albums, setAlbums] = useState<PhotoAlbum[]>([]);
    const [album, setAlbum] = useState<{ id?: string; title: string }>({ title: allTitle });
    const [slots, setSlots] = useState<(Slot | undefined)[]>([]);
    const [thumbs, setThumbs] = useState<ReadonlyMap<string, string>>(new Map());
    const [picked, setPicked] = useState<PhotoItem[]>([]);
    const [preparing, setPreparing] = useState(false);
    // Read by `toggle` and `closeGrid` in the same tick `takePicked` starts, before the state lands.
    const preparingRef = useRef(false);

    // What the page loop reads. Refs, because it runs from a request's completion as much as from a
    // render, and must see the newest values in both.
    const albumIdRef = useRef<string | undefined>(undefined);
    const layoutRef = useRef<Layout>('none');
    const slotCountRef = useRef(0);
    const nextRef = useRef<string | undefined>(undefined);
    /** Page index → the preview size it was asked at. Offset layout only. */
    const loadedRef = useRef(new Map<number, number>());
    const rangeRef = useRef<PhotoGridRange>({ start: 0, end: PAGE_SIZE });
    const columnsRef = useRef(columns);
    columnsRef.current = columns;
    const gridOpenRef = useRef(false);

    // One page in flight at a time. The shell lists one page at a time anyway, and a page asked for
    // while another is out is a page chosen against a range that may have moved on by the time it runs.
    const loadingRef = useRef(false);
    // Bumped on every album switch and every relist, so a page that lands for a list no longer shown is
    // dropped.
    const albumTokenRef = useRef(0);

    const probe = useCallback(async () => {
        if (library.isUnsupported()) {
            setSupported(false);
            return;
        }
        try {
            const page = await library.photos({ limit: RECENT_COUNT, thumbSize: previewSize(RECENT_TILE) });
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

    /** The preview size for the grid before it has reported one: the window's width, split in columns. */
    const estimatedThumbSize = () =>
        typeof window === 'undefined'
            ? undefined
            : previewSize(gridMetrics({ width: window.innerWidth, columns: columnsRef.current, cells: 0 }).tile);

    const resetList = () => {
        layoutRef.current = 'none';
        slotCountRef.current = 0;
        nextRef.current = undefined;
        loadedRef.current = new Map();
        loadingRef.current = false;
        setSlots([]);
        setThumbs(new Map());
        return ++albumTokenRef.current;
    };

    const addThumbs = (items: PhotoLibraryItem[]) => {
        if (items.length === 0) return;
        setThumbs(previous => {
            const merged = new Map(previous);
            for (const item of items) merged.set(item.id, thumbOf(item));
            return merged;
        });
    };

    /**
     * Lays a page answered by offset into the grid, starting over if the library's count moved.
     * `requested` is the offset asked for: a page past a shrunken list's end comes back clamped to it,
     * and marking that one loaded would mark a page that was never fetched at the new count.
     */
    const placeByOffset = (
        page: OnListPhotosPayload & { offset: number; total: number },
        requested: number,
        size: number
    ) => {
        const changed = layoutRef.current !== 'offset' || page.total !== slotCountRef.current;
        if (changed) {
            // A photo taken or deleted since the layout was made shifts every index after it, so the
            // pages already placed may now sit one off. The previews stay — they are by id — but every
            // page is asked for again as it comes into view.
            loadedRef.current = new Map();
        }
        layoutRef.current = 'offset';
        slotCountRef.current = page.total;
        if (page.offset === requested) loadedRef.current.set(Math.floor(requested / PAGE_SIZE), size);
        setSlots(previous => {
            const next = changed ? new Array<Slot | undefined>(page.total) : previous.slice();
            page.items.forEach((item, i) => {
                if (page.offset + i < next.length) next[page.offset + i] = toSlot(item);
            });
            return next;
        });
        addThumbs(page.items);
    };

    const placeByCursor = (page: OnListPhotosPayload, append: boolean) => {
        layoutRef.current = 'cursor';
        nextRef.current = page.next;
        slotCountRef.current = (append ? slotCountRef.current : 0) + page.items.length;
        const added = page.items.map(toSlot);
        setSlots(previous => (append ? [...previous, ...added] : added));
        addThumbs(page.items);
    };

    // The page loop. Each call asks for at most one page and calls itself again when that page lands,
    // so it runs until the range is covered and then stops until the range moves. A page that failed
    // (or a shell that turned out to have no picker) does not go round again at once: the same page
    // would be picked, and a failure that repeats would become a loop with nothing to slow it.
    const pumpRef = useRef<() => void>(() => undefined);
    pumpRef.current = () => {
        if (loadingRef.current || !gridOpenRef.current) return;
        const token = albumTokenRef.current;
        const albumId = albumIdRef.current;
        const thumbSize = rangeRef.current.thumbSize ?? estimatedThumbSize();

        let request: { offset?: number; after?: string } | undefined;
        if (layoutRef.current === 'none') {
            // The first page is offset 0 when the app may page by offset: an app that does not still
            // answers the first page, and the missing echo says which kind it is.
            request = library.pagesByOffset() ? { offset: 0 } : {};
        } else if (layoutRef.current === 'offset') {
            const page = pageToLoad({
                range: { ...rangeRef.current, thumbSize },
                total: slotCountRef.current,
                loaded: loadedRef.current,
            });
            if (page !== undefined) request = { offset: page * PAGE_SIZE };
        } else if (nextRef.current && rangeRef.current.end >= slotCountRef.current - PAGE_SIZE / 2) {
            request = { after: nextRef.current };
        }
        if (!request) return;

        loadingRef.current = true;
        let placed = false;
        void library
            .photos({ albumId, limit: PAGE_SIZE, thumbSize, ...request })
            .then(page => {
                if (!page || token !== albumTokenRef.current) return;
                setAccess(page.access);
                if (page.offset !== undefined && page.total !== undefined) {
                    placeByOffset(
                        { ...page, offset: page.offset, total: page.total },
                        request.offset ?? 0,
                        thumbSize ?? 0
                    );
                } else {
                    placeByCursor(page, request.after !== undefined);
                }
                placed = true;
            })
            .catch(() => {
                // The next range change asks again.
            })
            .finally(() => {
                if (token !== albumTokenRef.current) return;
                loadingRef.current = false;
                if (placed) pumpRef.current();
            });
    };

    const openGrid = useCallback(
        (preselect?: PhotoItem) => {
            setGridOpen(true);
            gridOpenRef.current = true;
            setAlbumsOpen(false);
            setPicked(preselect ? [preselect] : []);
            resetList();
            pumpRef.current();
            void library
                .albums({ thumbSize: previewSize(COVER_TILE) })
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
        // `resetList` touches refs and setters only.

        [library]
    );

    const closeGrid = useCallback(() => {
        // The grid stays while a send reads the pick; it closes itself when the read is done.
        if (preparingRef.current) return;
        gridOpenRef.current = false;
        setGridOpen(false);
    }, []);

    const selectAlbum = useCallback(
        (id: string) => {
            const chosen = albums.find(a => a.id === id);
            setAlbum({ id, title: chosen?.title ?? allTitle });
            albumIdRef.current = id;
            setAlbumsOpen(false);
            // A page for the old album may still be in flight; the token drops it when it lands, and
            // the lock is released so this album's first page is not refused.
            resetList();
            rangeRef.current = { start: 0, end: PAGE_SIZE, thumbSize: rangeRef.current.thumbSize };
            pumpRef.current();
        },

        [albums, allTitle]
    );

    const setVisibleRange = useCallback((range: PhotoGridRange) => {
        rangeRef.current = range;
        pumpRef.current();
    }, []);

    const photoAt = useCallback(
        (index: number): PhotoItem | undefined => {
            const slot = slots[index];
            if (!slot) return undefined;
            return { ...slot, src: thumbs.get(slot.id) ?? '' };
        },
        [slots, thumbs]
    );

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
            gridOpenRef.current = false;
            setGridOpen(false);
        }
        // An app that turned out unable to keep a video: what it listed of them cannot be picked again.
        // The grid lists afresh when it next opens, and the list leaves videos out from now on.
        if (!library.videosSupported()) {
            setRecent(previous => previous.filter(item => !isVideo(item)));
            resetList();
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
        resetList();
        pumpRef.current();
    }, [library]);

    return {
        supported,
        access,
        recent,
        probe,
        gridOpen,
        openGrid,
        closeGrid,
        albumsOpen,
        toggleAlbums: () => setAlbumsOpen(value => !value),
        albums,
        album,
        selectAlbum,
        count: slots.length,
        photoAt,
        setVisibleRange,
        picked,
        toggle,
        takePicked,
        preparing,
        manageSelection,
    };
};
