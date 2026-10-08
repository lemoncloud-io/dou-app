import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
    OnListPhotosPayload,
    PhotoLibraryAccess,
    PhotoLibraryItem,
    RefusedAttachment,
} from '@chatic/app-messages';
import type { ChatAttachmentSource } from '@chatic/data';
import {
    gridMetrics,
    isIdentityPhotoEdit,
    thumbPixelSize,
    type PhotoAlbum,
    type PhotoEdit,
    type PhotoGridRange,
    type PhotoItem,
    type PhotoItemKind,
} from '@chatic/web-ui-kit';

import { photoLibrary, photoPreviewSrc, type PhotoLibrary } from '../../../bridge/photoLibrary';
import { bakePhotoEdit, makeEditRendition, type EditRendition } from '../utils/bakePhotoEdit';

/**
 * How many items the attach panel's recent row offers to pick from before "see all": a few screens of
 * its sideways scroll, and one list request the shell answers with small previews.
 */
export const RECENT_COUNT = 30;
/** The attach panel's recent tile, and the album list's cover, in CSS pixels. */
const RECENT_TILE = 90;
const COVER_TILE = 64;
/** One page of the grid. Pages by offset start at multiples of it, so a page is also an index. */
export const PAGE_SIZE = 60;
/**
 * The first page is shorter: about a screen at three columns. The first screen waits on it, and the
 * shell makes previews one after another, so a page of 60 kept that screen waiting on 36 it does not
 * show. On an offset list the rest of page 0 follows as its own request.
 */
export const FIRST_PAGE_SIZE = 24;
/**
 * How long a failed first page waits before its one retry. The first page is what the grid opens on:
 * with nothing laid out there is no range to change, so without a retry a single slow or failed round
 * trip would leave the grid empty, looking like an album with nothing in it.
 */
export const FIRST_PAGE_RETRY_MS = 1500;
/**
 * How many pages either side of the visible ones keep their previews, on a list laid out by offset.
 * Two is about seven screens at three columns — a scroll back over that is drawn from memory — and
 * caps what the grid holds at a few hundred previews however far it has been scrolled.
 */
export const KEEP_PAGES = 2;

export interface PhotoPicker {
    /**
     * Whether this shell has the in-app picker: `null` until the first probe answers. False in a
     * browser and in an app built before the picker, where the page's own file input is used instead.
     */
    supported: boolean | null;
    access: PhotoLibraryAccess | null;
    recent: PhotoItem[];
    /** Asks the shell once for the newest photos — call when the attach panel opens. */
    probe(): Promise<void>;

    gridOpen: boolean;
    /** Opens the grid on whatever is picked already — the panel's recent row and the grid share one pick. */
    openGrid(): void;
    /** Closes the grid and keeps the pick, its edits and the editor's copies; only the bytes read go. */
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
    /**
     * The photo at a grid index, or undefined while its preview has not come — not loaded yet, or let
     * go far from the screen and on its way back — drawn as a skeleton tile.
     */
    photoAt(index: number): PhotoItem | undefined;
    /** Whether the album's first page is on its way: the grid shows skeleton tiles meanwhile. */
    loading: boolean;
    /** What the grid shows now; the pages it needs are asked for, nearest first. */
    setVisibleRange(range: PhotoGridRange): void;

    /**
     * What is picked, in pick order — from the panel's recent row and from the grid alike. A photo
     * whose edit is drawn carries it as `edited` — once the editor's copy is read and the edit changes
     * something — so the picked strip shows the photo as it will be sent.
     */
    picked: PhotoItem[];
    /** Picks or unpicks. Unpicking a photo also drops what was read for it, and its edit, silently. */
    toggle(photo: PhotoItem): void;
    /** Lets the whole pick go, with everything read for it — the panel dismissed. Not while preparing. */
    clearPicked(): void;
    /**
     * Lets go of the photo bytes read for the pick, and of what the editor was still waiting to read,
     * keeping the pick, its edits and the editor's copies: the pick goes back to wait under the
     * composer. `closeGrid` does it as the grid closes; an editor opened over the composer does it as
     * it closes. A read under way finishes and is kept. Not while preparing — the send is using them.
     */
    releaseBytes(): void;
    /**
     * Reads the picked photos and keeps the picked videos in the shell, one at a time in pick order,
     * then clears the pick and closes the grid. A photo the editor already read is not read again, one
     * it is still reading is waited for, and an edited one is drawn with its edit, one at a time too.
     * An item that cannot be read, kept or drawn is refused alone; the rest still go.
     */
    takePicked(): Promise<PickedFromGrid>;
    /** Whether `takePicked` is still reading — the grid stays open, saying so, until it is done. */
    preparing: boolean;

    /** iOS limited access: let the user share more, then list again. */
    manageSelection(): Promise<void>;

    /** What the editor has of each picked photo, by id — absent until `loadForEdit` asks for it. */
    editAssets: ReadonlyMap<string, PhotoEditAsset>;
    /**
     * Reads picked photos for the editor, the one on screen first and then its neighbours. The ids
     * replace whatever was still waiting, so a quick swipe through the pick reads where it stopped
     * rather than everything it passed; a read already under way finishes. One photo at a time, like
     * the send: each read holds a whole photo as base64 in page memory. What is read here is kept for
     * the send, which then does not read it again. Videos are not read — nothing in them is editable.
     * Called with no ids — the editor has closed — it drops what was waiting, so the pick's other
     * photos are read only while the editor is up.
     */
    loadForEdit(...ids: string[]): void;
    /** Each picked photo's edit, by id. An unedited photo has none. */
    edits: ReadonlyMap<string, PhotoEdit>;
    /** Records a photo's edit. An edit that changes nothing is forgotten, so the original goes. */
    setEdit(id: string, edit: PhotoEdit): void;
    /** Puts back the edits taken earlier from `edits` — the editor's "leave without keeping". */
    restoreEdits(snapshot: ReadonlyMap<string, PhotoEdit>): void;
}

/** Where the editor's copy of one picked photo stands. */
export interface PhotoEditAsset {
    status: 'loading' | 'ready' | 'failed';
    /** The editor's copy of the whole upright photo, once ready — an object URL this hook revokes. */
    src?: string;
    /** The original's upright pixel size, once ready: the space its edit is measured in. */
    width?: number;
    height?: number;
    /**
     * False for a GIF: shown, not edited — a canvas keeps only its first frame. Known once the photo
     * is read: the library's list does not say what format a photo is.
     */
    editable: boolean;
}

/** What the grid hands to the send: what was read or kept, and what was not, in pick order. */
export interface PickedFromGrid {
    items: ChatAttachmentSource[];
    refused: RefusedAttachment[];
    /**
     * How many edited photos could not be drawn with their edit. Each is refused alone, under a
     * notice of its own: the original is not sent in its place, since it is not what the person
     * chose to send. Absent when there were none.
     */
    editFailed?: number;
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

/** The editor's read under way — there is one at a time. */
interface EditJob {
    id: string;
    /** The pick it reads for (`pickTokenRef` when it started): one let go since drops what it reads. */
    token: number;
    /**
     * Settles once the read is over — its bytes kept, or the read failed or was dropped — and not when
     * the editor's copy made after it is: the send waits for the bytes, never for the copy.
     */
    read: Promise<unknown>;
}

const toSlot = (item: PhotoLibraryItem): Slot =>
    item.mediaType === 'video'
        ? { id: item.id, kind: 'video', ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}) }
        : { id: item.id };

const toItems = (items: PhotoLibraryItem[]): PhotoItem[] =>
    items.map(item => ({ ...toSlot(item), src: photoPreviewSrc(item.thumbBase64) }));

/** A preview drawn from the shell's base64; an item the shell could make no preview for draws empty. */
const thumbOf = (item: PhotoLibraryItem): string => (item.thumbBase64 ? photoPreviewSrc(item.thumbBase64) : '');

const isVideo = (item: PhotoItem) => item.kind === 'video';

const isGif = (file: File) => file.type === 'image/gif';

/** A picked item as the grid handed it, without a drawn edit a caller may have passed back. */
const plainItem = ({ id, src, kind, durationMs }: PhotoItem): PhotoItem => ({
    id,
    src,
    ...(kind !== undefined ? { kind } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
});

const sameEdit = (a: PhotoEdit, b: PhotoEdit): boolean =>
    a === b ||
    (a.rotation === b.rotation &&
        a.flipH === b.flipH &&
        a.aspect === b.aspect &&
        a.crop.x === b.crop.x &&
        a.crop.y === b.crop.y &&
        a.crop.width === b.crop.width &&
        a.crop.height === b.crop.height);

/** Whether two sets of edits differ — what decides if leaving the editor needs a confirmation. */
export const editsDiffer = (a: ReadonlyMap<string, PhotoEdit>, b: ReadonlyMap<string, PhotoEdit>): boolean => {
    if (a.size !== b.size) return true;
    for (const [id, edit] of a) {
        const other = b.get(id);
        if (!other || !sameEdit(edit, other)) return true;
    }
    return false;
};

/** How a video the shell would not keep is reported — in the words the attach panel already uses. */
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
 * The pages whose previews are kept: the ones the visible range touches and `keep` either side, as
 * `[first, last]`, clamped to the list. Previews of every other page are let go — their positions stay
 * laid out, and the page is asked for again when it comes back into view.
 */
export const keptPages = ({
    range,
    total,
    keep = KEEP_PAGES,
    pageSize = PAGE_SIZE,
}: {
    range: PhotoGridRange;
    total: number;
    keep?: number;
    pageSize?: number;
}): { first: number; last: number } => {
    const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    const start = Math.max(0, Math.min(range.start, total));
    const end = Math.max(start + 1, Math.min(range.end, total));
    return {
        first: Math.max(0, Math.floor(start / pageSize) - keep),
        last: Math.min(lastPage, Math.floor((end - 1) / pageSize) + keep),
    };
};

/**
 * The page just past the visible range in the direction of the scroll, when it still needs loading —
 * asked for once everything on screen is in, so a steady scroll finds the next stretch already there.
 * `direction` is 1 for down, -1 for up.
 */
export const pageAhead = ({
    range,
    total,
    loaded,
    direction,
    pageSize = PAGE_SIZE,
}: {
    range: PhotoGridRange;
    total: number;
    loaded: ReadonlyMap<number, number>;
    direction: 1 | -1;
    pageSize?: number;
}): number | undefined => {
    const start = Math.max(0, Math.min(range.start, total));
    const end = Math.max(start, Math.min(range.end, total));
    if (end <= start) return undefined;
    const page = direction > 0 ? Math.floor((end - 1) / pageSize) + 1 : Math.floor(start / pageSize) - 1;
    if (page < 0 || page * pageSize >= total) return undefined;
    const size = loaded.get(page);
    return size === undefined || needsSharperThumbs(size, range.thumbSize) ? page : undefined;
};

/**
 * What to ask for next on a list laid out by offset: a page the visible range needs, or else the one
 * ahead of it. Page 0 whose first `firstPageSize` items came as the short first page is completed from
 * where that stopped rather than asked for whole again.
 */
export const offsetRequest = ({
    range,
    total,
    loaded,
    direction,
    firstPagePartial,
    pageSize = PAGE_SIZE,
    firstPageSize = FIRST_PAGE_SIZE,
}: {
    range: PhotoGridRange;
    total: number;
    loaded: ReadonlyMap<number, number>;
    direction: 1 | -1;
    firstPagePartial: boolean;
    pageSize?: number;
    firstPageSize?: number;
}): { offset: number; limit: number } | undefined => {
    const page =
        pageToLoad({ range, total, loaded, pageSize }) ?? pageAhead({ range, total, loaded, direction, pageSize });
    if (page === undefined) return undefined;
    if (page === 0 && firstPagePartial && !loaded.has(0)) {
        return { offset: firstPageSize, limit: pageSize - firstPageSize };
    }
    return { offset: page * pageSize, limit: pageSize };
};

/**
 * The in-app photo picker's state: what the attach panel previews, which album the grid shows and which
 * of it has loaded, and what is picked. The library itself is read through the shell (`photoLibrary`);
 * this hook only holds what the screen needs of it.
 *
 * The grid is virtual: it reports the range on screen, and pages are asked for to cover it, one request
 * at a time, nearest first. On an app that pages by offset the grid knows the album's length from the
 * first answer and any stretch of it can be filled directly — which is what lets a fast-scroll jump to
 * the far end of a long album without paging through it. An older app pages by cursor and the grid
 * grows as it scrolls, as it always did.
 *
 * On a list laid out by offset, previews of pages far from the visible range are let go as new pages
 * land (`keptPages`): a long scroll would otherwise keep every preview it passed. An older app's list
 * keeps them — its pages can only be asked for in order, and its previews are the small ones.
 *
 * Picked photos can be edited before they are sent. An edit is kept as instructions (crop, quarter
 * turn, mirror) and the photo's bytes are untouched until the send, which draws only the photos whose
 * edit changes something and sends every other one as it was read. The editor shows a smaller copy of
 * each photo (`makeEditRendition`), read when it is shown; the bytes read for it are kept for the send.
 * Everything read for a photo — its bytes, its copy, its edit — is let go when it is unpicked, and
 * everything read for the pick when it is sent or cleared. A copy still being made when that happens is
 * revoked as it lands.
 *
 * The pick outlives the grid. The attach panel's recent row picks into the same list, the grid opens on
 * it, and closing the grid goes back to the panel with it, where the composer's send button can send
 * it — and once the panel closes for the keyboard, the pick waits above the composer as a row of
 * thumbnails. So closing the grid keeps the pick, its edits and the editor's copies (the strips draw
 * edited photos from them) and lets go only of the bytes: a whole photo each, and the pick may now
 * wait for as long as the person types. An editor opened from the composer's row lets them go as it
 * closes, for the same reason (`releaseBytes`). A send from the composer reads those photos again.
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
    bake = bakePhotoEdit,
    rendition = makeEditRendition,
}: {
    max: number;
    /** The "all photos" title until the shell's album list names it. */
    allTitle: string;
    columns?: number;
    library?: PhotoLibrary;
    /** Test seam — draws a photo with its edit at the send. */
    bake?: (file: File, edit: PhotoEdit) => Promise<File | null>;
    /** Test seam — makes the editor's copy of a photo. */
    rendition?: (file: File) => Promise<EditRendition | null>;
}): PhotoPicker => {
    const [supported, setSupported] = useState<boolean | null>(library.isUnsupported() ? false : null);
    const [access, setAccess] = useState<PhotoLibraryAccess | null>(null);
    const [recent, setRecent] = useState<PhotoItem[]>([]);
    const [gridOpen, setGridOpen] = useState(false);
    const [albumsOpen, setAlbumsOpen] = useState(false);
    const [albums, setAlbums] = useState<PhotoAlbum[]>([]);
    const [album, setAlbum] = useState<{ id?: string; title: string }>({ title: allTitle });
    const [slots, setSlots] = useState<(Slot | undefined)[]>([]);
    // The same positions, for the page loop: eviction needs the ids of the pages it keeps the moment a
    // page lands, before the state carrying them has rendered.
    const slotsRef = useRef<(Slot | undefined)[]>([]);
    const [thumbs, setThumbs] = useState<ReadonlyMap<string, string>>(new Map());
    const [picked, setPickedState] = useState<PhotoItem[]>([]);
    // The same pick, for what runs outside a render: a toggle in the tick another started, a read that
    // lands and must know whether its photo is still picked.
    const pickedRef = useRef<PhotoItem[]>([]);
    const [preparing, setPreparing] = useState(false);
    const [firstPageLoading, setFirstPageLoading] = useState(false);
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
    /** Which way the grid last scrolled, for the page asked for ahead of it. */
    const directionRef = useRef<1 | -1>(1);
    /** Page 0 holds only the short first page so far (offset layout). */
    const firstPagePartialRef = useRef(false);
    /** The preview size the short first page was asked at, so page 0 is recorded at the smaller one. */
    const firstPageSizeRef = useRef(0);
    /** The first page has had its one retry. */
    const firstPageRetriedRef = useRef(false);
    const columnsRef = useRef(columns);
    columnsRef.current = columns;
    const gridOpenRef = useRef(false);

    // One page in flight at a time. The shell lists one page at a time anyway, and a page asked for
    // while another is out is a page chosen against a range that may have moved on by the time it runs.
    const loadingRef = useRef(false);
    // Bumped on every album switch and every relist, so a page that lands for a list no longer shown is
    // dropped.
    const albumTokenRef = useRef(0);

    // The editor's side of the pick. Each map has a ref beside its state: reads and the send run from
    // promises, and must see what the latest tap left, not what the last render held.
    /** Bytes read for a picked photo, by id — the editor reads them, the send reuses them. */
    const filesRef = useRef(new Map<string, File>());
    const [editAssets, setEditAssetsState] = useState<ReadonlyMap<string, PhotoEditAsset>>(new Map());
    const assetsRef = useRef(new Map<string, PhotoEditAsset>());
    const [edits, setEditsState] = useState<ReadonlyMap<string, PhotoEdit>>(new Map());
    const editsRef = useRef<ReadonlyMap<string, PhotoEdit>>(new Map());
    /** Photos the editor wants read next, nearest first. */
    const waitingRef = useRef<string[]>([]);
    /** The editor's read under way, until its copy is made too. */
    const jobRef = useRef<EditJob | null>(null);
    // Bumped whenever the whole pick is let go, so a read that lands for an earlier pick is dropped
    // even when the same photo has been picked again since.
    const pickTokenRef = useRef(0);

    const setPicked = (next: PhotoItem[]) => {
        pickedRef.current = next;
        setPickedState(next);
    };

    const setAsset = (id: string, asset: PhotoEditAsset | undefined) => {
        const next = new Map(assetsRef.current);
        if (asset) next.set(id, asset);
        else next.delete(id);
        assetsRef.current = next;
        setEditAssetsState(next);
    };

    const commitEdits = (next: ReadonlyMap<string, PhotoEdit>) => {
        editsRef.current = next;
        setEditsState(next);
    };

    /** Lets go of what was read for one photo: its bytes, the editor's copy, and its edit. */
    const releasePhoto = (id: string) => {
        filesRef.current.delete(id);
        waitingRef.current = waitingRef.current.filter(waiting => waiting !== id);
        const asset = assetsRef.current.get(id);
        if (asset?.src) URL.revokeObjectURL(asset.src);
        if (asset) setAsset(id, undefined);
        if (editsRef.current.has(id)) {
            const next = new Map(editsRef.current);
            next.delete(id);
            commitEdits(next);
        }
    };

    /**
     * Lets go of everything read for the pick. The bytes of ten photos can be some 50 MB, and none of
     * it is worth anything once the pick is sent or abandoned.
     */
    const releasePick = () => {
        pickTokenRef.current += 1;
        filesRef.current = new Map();
        waitingRef.current = [];
        for (const asset of assetsRef.current.values()) if (asset.src) URL.revokeObjectURL(asset.src);
        if (assetsRef.current.size > 0) {
            assetsRef.current = new Map();
            setEditAssetsState(assetsRef.current);
        }
        if (editsRef.current.size > 0) commitEdits(new Map());
    };

    // The editor copies are object URLs, which outlive the page's state unless revoked.
    useEffect(
        () => () => {
            pickTokenRef.current += 1;
            for (const asset of assetsRef.current.values()) if (asset.src) URL.revokeObjectURL(asset.src);
        },
        []
    );

    // The editor's read loop: the next waiting photo, read, then its copy made, then the next. A read
    // whose photo was unpicked meanwhile, or whose pick was let go, is dropped when it lands — a read
    // already sent to the shell cannot be called back.
    const pumpEditRef = useRef<() => void>(() => undefined);
    pumpEditRef.current = () => {
        if (jobRef.current || preparingRef.current) return;
        const id = waitingRef.current.shift();
        if (id === undefined) return;
        const token = pickTokenRef.current;
        const wanted = () => token === pickTokenRef.current && pickedRef.current.some(item => item.id === id);
        setAsset(id, { status: 'loading', editable: true });

        // The bytes, apart from the copy made from them: the send waits for this part alone.
        const read = (async (): Promise<File | undefined> => {
            let file: File;
            try {
                file = filesRef.current.get(id) ?? (await library.read({ id }));
            } catch {
                if (wanted()) setAsset(id, { status: 'failed', editable: true });
                return undefined;
            }
            if (!wanted()) return undefined;
            filesRef.current.set(id, file);
            return file;
        })();
        const copy = async () => {
            const file = await read;
            // The send started meanwhile: it needs the bytes, which are kept, and not a copy for an
            // editor that has closed.
            if (!file || preparingRef.current) return;
            let made: EditRendition | null = null;
            try {
                made = await rendition(file);
            } catch {
                made = null;
            }
            // Asked again once the copy is made, since the send does not wait for it: a copy for a photo
            // unpicked meanwhile, or one made while the pick was being sent, has nothing left to show it.
            if (!wanted() || preparingRef.current) {
                if (made) URL.revokeObjectURL(made.src);
                return;
            }
            const editable = !isGif(file);
            // A photo the page cannot decode cannot be edited, but it was read and still goes as it is.
            setAsset(id, made ? { status: 'ready', editable, ...made } : { status: 'failed', editable });
        };
        jobRef.current = { id, token, read };
        void copy().finally(() => {
            jobRef.current = null;
            pumpEditRef.current();
        });
    };

    const loadForEdit = useCallback((...ids: string[]) => {
        if (preparingRef.current) return;
        const photos = new Set(pickedRef.current.filter(item => !isVideo(item)).map(item => item.id));
        // The photo under way is not asked for twice — unless that read is for a pick let go since,
        // which drops what it reads: the same photo picked again is read again.
        const job = jobRef.current;
        const underWay = job && job.token === pickTokenRef.current ? job.id : undefined;
        waitingRef.current = [...new Set(ids)].filter(
            id => photos.has(id) && !assetsRef.current.has(id) && id !== underWay
        );
        pumpEditRef.current();
    }, []);

    // Frozen while a send reads the pick, like the pick itself: the send has already taken the edits.
    const setEdit = useCallback((id: string, edit: PhotoEdit) => {
        if (preparingRef.current || !pickedRef.current.some(item => item.id === id)) return;
        const next = new Map(editsRef.current);
        if (isIdentityPhotoEdit(edit)) next.delete(id);
        else next.set(id, edit);
        commitEdits(next);
    }, []);

    const restoreEdits = useCallback((snapshot: ReadonlyMap<string, PhotoEdit>) => {
        if (preparingRef.current) return;
        const ids = new Set(pickedRef.current.map(item => item.id));
        commitEdits(new Map([...snapshot].filter(([id]) => ids.has(id))));
    }, []);

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
        setFirstPageLoading(false);
        layoutRef.current = 'none';
        slotCountRef.current = 0;
        nextRef.current = undefined;
        loadedRef.current = new Map();
        firstPagePartialRef.current = false;
        firstPageRetriedRef.current = false;
        directionRef.current = 1;
        loadingRef.current = false;
        slotsRef.current = [];
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
     *
     * Answers whether the page loop moved forward — a page now counts as loaded, the short first page
     * landed, or the layout was remade. An answer that did none of these (an offset other than the one
     * asked for, at the same count) would otherwise be asked for again at once, and again.
     */
    const placeByOffset = (
        page: OnListPhotosPayload & { offset: number; total: number },
        requested: number,
        limit: number,
        size: number
    ): boolean => {
        const changed = layoutRef.current !== 'offset' || page.total !== slotCountRef.current;
        let progressed = changed;
        if (changed) {
            firstPagePartialRef.current = false;
            // A photo taken or deleted since the layout was made shifts every index after it, so the
            // pages already placed may now sit one off. The previews stay — they are by id — but every
            // page is asked for again as it comes into view.
            loadedRef.current = new Map();
        }
        layoutRef.current = 'offset';
        slotCountRef.current = page.total;
        if (page.offset === requested) {
            // A page is loaded once one answer — or the short first page and the rest of page 0 —
            // covers it to its end (or the list's).
            const index = Math.floor(requested / PAGE_SIZE);
            const pageEnd = Math.min((index + 1) * PAGE_SIZE, page.total);
            const fromStart = requested === index * PAGE_SIZE || (index === 0 && firstPagePartialRef.current);
            if (fromStart && requested + limit >= pageEnd) {
                // Completing page 0 from the short first page: its first previews came at that page's
                // size, so a pinch between the two halves still finds them soft and asks again.
                const completing = index === 0 && firstPagePartialRef.current && requested > 0;
                loadedRef.current.set(index, completing ? Math.min(firstPageSizeRef.current, size) : size);
                if (index === 0) firstPagePartialRef.current = false;
                progressed = true;
            } else if (requested === 0) {
                firstPagePartialRef.current = true;
                firstPageSizeRef.current = size;
                progressed = true;
            }
        }
        const next = changed ? new Array<Slot | undefined>(page.total) : slotsRef.current.slice();
        page.items.forEach((item, i) => {
            if (page.offset + i < next.length) next[page.offset + i] = toSlot(item);
        });
        slotsRef.current = next;
        setSlots(next);

        // Let go of the previews far from what is on screen, and forget those pages were loaded so they
        // are asked for again when they come back. Kept by id: whatever sits in the kept pages now —
        // which, after a count change, still holds the previews placed before it.
        const { first, last } = keptPages({ range: rangeRef.current, total: page.total });
        for (const loadedPage of [...loadedRef.current.keys()]) {
            if (loadedPage < first || loadedPage > last) loadedRef.current.delete(loadedPage);
        }
        // Page 0's short first page is let go with it; on the way back it is asked for whole.
        if (first > 0) firstPagePartialRef.current = false;
        const keep = new Set<string>();
        for (let i = first * PAGE_SIZE; i < Math.min(next.length, (last + 1) * PAGE_SIZE); i += 1) {
            const id = next[i]?.id;
            if (id) keep.add(id);
        }
        setThumbs(previous => {
            const kept = new Map<string, string>();
            for (const [id, src] of previous) if (keep.has(id)) kept.set(id, src);
            for (const item of page.items) if (keep.has(item.id)) kept.set(item.id, thumbOf(item));
            return kept;
        });
        return progressed;
    };

    const placeByCursor = (page: OnListPhotosPayload, append: boolean) => {
        layoutRef.current = 'cursor';
        nextRef.current = page.next;
        slotCountRef.current = (append ? slotCountRef.current : 0) + page.items.length;
        const added = page.items.map(toSlot);
        slotsRef.current = append ? [...slotsRef.current, ...added] : added;
        setSlots(slotsRef.current);
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

        let request: { offset?: number; after?: string; limit: number } | undefined;
        if (layoutRef.current === 'none') {
            // The first page is offset 0 when the app may page by offset: an app that does not still
            // answers the first page, and the missing echo says which kind it is. Short, for the first
            // screen's sake (`FIRST_PAGE_SIZE`).
            request = library.pagesByOffset() ? { offset: 0, limit: FIRST_PAGE_SIZE } : { limit: FIRST_PAGE_SIZE };
        } else if (layoutRef.current === 'offset') {
            request = offsetRequest({
                range: { ...rangeRef.current, thumbSize },
                total: slotCountRef.current,
                loaded: loadedRef.current,
                direction: directionRef.current,
                firstPagePartial: firstPagePartialRef.current,
            });
        } else if (nextRef.current && rangeRef.current.end >= slotCountRef.current - PAGE_SIZE) {
            // A page's worth ahead of the end, so a scroll does not reach it before the next page.
            request = { after: nextRef.current, limit: PAGE_SIZE };
        }
        if (!request) return;

        const first = layoutRef.current === 'none';
        if (first) setFirstPageLoading(true);
        loadingRef.current = true;
        let placed = false;
        void library
            .photos({ albumId, thumbSize, ...request })
            .then(page => {
                if (!page || token !== albumTokenRef.current) return;
                setAccess(page.access);
                if (page.offset !== undefined && page.total !== undefined) {
                    placed = placeByOffset(
                        { ...page, offset: page.offset, total: page.total },
                        request.offset ?? 0,
                        request.limit,
                        thumbSize ?? 0
                    );
                } else {
                    placeByCursor(page, request.after !== undefined);
                    placed = true;
                }
            })
            .catch(() => {
                // The next range change asks again.
            })
            .finally(() => {
                if (token !== albumTokenRef.current) return;
                loadingRef.current = false;
                if (placed) {
                    if (first) setFirstPageLoading(false);
                    pumpRef.current();
                } else if (first && !firstPageRetriedRef.current) {
                    // Once more after a pause, the skeleton still up; after that the grid shows what
                    // it has.
                    firstPageRetriedRef.current = true;
                    setTimeout(() => {
                        if (token === albumTokenRef.current) pumpRef.current();
                    }, FIRST_PAGE_RETRY_MS);
                } else if (first) {
                    setFirstPageLoading(false);
                }
            });
    };

    const openGrid = useCallback(
        () => {
            setGridOpen(true);
            gridOpenRef.current = true;
            setAlbumsOpen(false);
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

    // The pick goes back under the composer; the bytes read for it do not (see above). What the editor
    // was still waiting to read is dropped with them — a read under way finishes and is kept.
    const releaseBytes = useCallback(() => {
        if (preparingRef.current) return;
        filesRef.current = new Map();
        waitingRef.current = [];
    }, []);

    const closeGrid = useCallback(() => {
        // The grid stays while a send reads the pick; it closes itself when the read is done.
        if (preparingRef.current) return;
        gridOpenRef.current = false;
        setGridOpen(false);
        releaseBytes();
    }, [releaseBytes]);

    // Frozen while a send reads the pick, like `toggle`: the send clears it when the read is done.
    const clearPicked = useCallback(
        () => {
            if (preparingRef.current) return;
            setPicked([]);
            releasePick();
        },
        // `setPicked` and `releasePick` touch refs and setters only.
        []
    );

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
        if (range.start !== rangeRef.current.start) {
            directionRef.current = range.start > rangeRef.current.start ? 1 : -1;
        }
        rangeRef.current = range;
        pumpRef.current();
    }, []);

    const photoAt = useCallback(
        (index: number): PhotoItem | undefined => {
            const slot = slots[index];
            if (!slot) return undefined;
            // Missing is not empty: an empty string is an item the app could make no preview of, drawn
            // plain; a missing one is still coming.
            const src = thumbs.get(slot.id);
            return src === undefined ? undefined : { ...slot, src };
        },
        [slots, thumbs]
    );

    // Picks survive an album switch on purpose: choosing across albums is the point of the list.
    // Picks are frozen while a send reads them: a pick changed meanwhile would be dropped when the read
    // ends and clears it, without a word.
    const toggle = useCallback(
        (photo: PhotoItem) => {
            if (preparingRef.current) return;
            const previous = pickedRef.current;
            if (previous.some(p => p.id === photo.id)) {
                setPicked(previous.filter(p => p.id !== photo.id));
                releasePhoto(photo.id);
                return;
            }
            if (previous.length < max) setPicked([...previous, plainItem(photo)]);
        },
        // `setPicked` and `releasePhoto` touch refs and setters only.
        [max]
    );

    const takePicked = useCallback(async (): Promise<PickedFromGrid> => {
        const chosen = pickedRef.current;
        const chosenEdits = editsRef.current;
        // The grid stays open while the pick is read: a video can take minutes to come down from
        // iCloud, and a sheet that closed at once would leave nothing on screen until the row appears.
        preparingRef.current = true;
        setPreparing(true);
        waitingRef.current = [];
        const items: ChatAttachmentSource[] = [];
        const refused: RefusedAttachment[] = [];
        let editFailed = 0;
        try {
            // An editor read still out for a photo in this pick finishes first, and its bytes are used:
            // reading another beside it would hold two photos' base64 at once, and reading it again
            // would fetch the same bytes twice. Nothing else the editor has under way is waited for —
            // a read for a photo unpicked since is dropped when it lands, and the copy made after a
            // read is for an editor that has closed. Awaited only when there is one, so a pick never
            // opened in the editor starts reading in the same tick, as it always did.
            const job = jobRef.current;
            if (job && job.token === pickTokenRef.current && chosen.some(item => item.id === job.id)) {
                await job.read;
            }
            // One at a time: each photo read holds a whole photo as base64 in page memory, each drawn
            // edit a whole canvas, and the shell copies one video at a time.
            for (const item of chosen) {
                if (isVideo(item)) {
                    try {
                        items.push(await library.keepVideo(item));
                    } catch (error) {
                        refused.push({ name: '', kind: 'video', reason: refusalOf(error) });
                    }
                    continue;
                }
                let file: File;
                try {
                    file = filesRef.current.get(item.id) ?? (await library.read(item));
                } catch {
                    refused.push({ name: '', kind: 'image', reason: 'unreadable' });
                    continue;
                }
                const edit = chosenEdits.get(item.id);
                // An unedited photo goes as its own bytes, exactly as read. A GIF is never edited — the
                // editor does not offer it — so an edit somehow recorded for one is ignored, not drawn.
                if (!edit || isIdentityPhotoEdit(edit) || isGif(file)) {
                    items.push(file);
                    continue;
                }
                const baked = await bake(file, edit).catch(() => null);
                if (baked) items.push(baked);
                else editFailed += 1;
            }
        } finally {
            preparingRef.current = false;
            setPreparing(false);
            setPicked([]);
            releasePick();
            gridOpenRef.current = false;
            setGridOpen(false);
        }
        // An app that turned out unable to keep a video: what it listed of them cannot be picked again.
        // The grid lists afresh when it next opens, and the list leaves videos out from now on.
        if (!library.videosSupported()) {
            setRecent(previous => previous.filter(item => !isVideo(item)));
            resetList();
        }
        return editFailed > 0 ? { items, refused, editFailed } : { items, refused };
    }, [library, bake]);

    // The pick as the strip draws it: an edited photo carries its edit and the copy to draw it from,
    // once both are there and the edit changes something.
    const pickedView = useMemo(
        () =>
            picked.map(item => {
                const edit = edits.get(item.id);
                const asset = editAssets.get(item.id);
                if (!edit || isIdentityPhotoEdit(edit) || asset?.status !== 'ready') return item;
                if (!asset.src || !asset.width || !asset.height) return item;
                return { ...item, edited: { src: asset.src, width: asset.width, height: asset.height, edit } };
            }),
        [picked, edits, editAssets]
    );

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
        loading: firstPageLoading,
        photoAt,
        setVisibleRange,
        picked: pickedView,
        toggle,
        clearPicked,
        releaseBytes,
        takePicked,
        preparing,
        manageSelection,
        editAssets,
        loadForEdit,
        edits,
        setEdit,
        restoreEdits,
    };
};
