import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { runtime } from '@chatic/runtime';
import type { RoomMediaCounts } from '@chatic/data';

import { useHiddenMedia } from '../lib/localMediaPrefs';
import {
    mergeNewestFirst,
    TAB_KINDS,
    toRoomFileEntry,
    type ChatMediaKind,
    type RoomFileEntry,
    type RoomFilesTab,
} from '../utils/roomFiles';

/** Entries read per kind per page. */
const PAGE_SIZE = 60;
/** Messages asked of the server per "find older files" — the room's own older-page size. */
const HISTORY_PAGE_SIZE = 50;

/**
 * Whether a call failed because the app's runtime predates the method — the shell answers
 * `RUNTIME_NOT_AVAILABLE` where it owns the session and was built before the room's media reads.
 */
export const isRuntimeNotAvailable = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'RUNTIME_NOT_AVAILABLE';

interface KindPage {
    items: RoomFileEntry[];
    /** The next page's cursor; `null` when this device's cache has nothing further down, `undefined` before the first read. */
    next: number | null | undefined;
}

/**
 * The chat repository of the graph the room itself reads (`useChats`): its cache partition is the one
 * the room's rows — and their media index entries — were written to. A cloud-scoped graph resolves its
 * own scope, which for a guest relay session has no uid and reads an empty partition.
 */
/**
 * The newest page over what was loaded: it replaces what it covers, and what was read below it stays,
 * with the cursor where those rows stopped.
 */
export const withNewestPage = (had: KindPage | undefined, page: KindPage): KindPage => {
    const floor = page.items.length ? page.items[page.items.length - 1]!.chatNo : Number.POSITIVE_INFINITY;
    const below = had?.items.filter(entry => entry.chatNo < floor) ?? [];
    if (below.length === 0) return page;
    return { items: [...page.items, ...below], next: had?.next ?? page.next };
};

/** An older page after what was loaded, without repeating an entry. */
export const withOlderPage = (had: KindPage | undefined, page: KindPage): KindPage => {
    const items = had?.items ?? [];
    const seen = new Set(items.map(entry => entry.key));
    return { items: [...items, ...page.items.filter(entry => !seen.has(entry.key))], next: page.next };
};

const useRoomChats = () => runtime.data.useRuntimeRepositories().chat;

/**
 * A room's media counts by kind, from this device's cache — the room settings' entry point and the tab
 * numbers. `unavailable` when the installed app cannot answer yet (`isRuntimeNotAvailable`): the entry
 * point is then not drawn at all.
 */
export const useRoomMediaCounts = (cid: string | undefined, channelId: string | undefined) => {
    const chats = useRoomChats();
    const [counts, setCounts] = useState<RoomMediaCounts | null>(null);
    const [unavailable, setUnavailable] = useState(false);

    const reload = useCallback(async () => {
        if (!cid || !channelId) return;
        try {
            setCounts(await chats.countRoomMedia({ channelId }));
        } catch (error) {
            if (isRuntimeNotAvailable(error)) setUnavailable(true);
        }
    }, [chats, cid, channelId]);

    useEffect(() => {
        void reload();
    }, [reload]);

    // New messages and edits reach the cache through the room's stream; a count follows them.
    useEffect(() => {
        if (!cid || !channelId) return undefined;
        let first = true;
        return chats.observeList({ channelId, limit: 1 }, () => {
            if (first) {
                first = false;
                return;
            }
            void reload();
        });
    }, [chats, cid, channelId, reload]);

    return { counts, unavailable, reload };
};

/**
 * The room file list's data for one tab: the media index's pages for the tab's kinds, merged newest
 * first, without what is hidden on this device; more pages as the list is scrolled; and, when this
 * device's cache has nothing older, the room's ordinary older-page load to widen it ("find older
 * files") — whose rows the index picks up on their write — until the server says there is no more.
 *
 * The tab is read again whenever the room's newest window changes in the cache.
 */
export const useRoomFiles = ({
    cid,
    uid,
    channelId,
    tab,
}: {
    cid: string | undefined;
    uid: string | undefined;
    channelId: string | undefined;
    tab: RoomFilesTab;
}) => {
    const kinds = TAB_KINDS[tab];
    const chats = useRoomChats();
    const [pages, setPages] = useState<Partial<Record<ChatMediaKind, KindPage>>>({});
    // The pages as they are now, for reads started from a callback created on an earlier render.
    const pagesRef = useRef(pages);
    pagesRef.current = pages;
    const [loading, setLoading] = useState(false);
    const [unavailable, setUnavailable] = useState(false);
    const [searching, setSearching] = useState(false);
    // The server's cursor for the next older page, `0` once it said there is no more.
    const [historyCursor, setHistoryCursor] = useState<number | undefined>(undefined);
    const autoSearched = useRef(new Set<RoomFilesTab>());
    const generation = useRef(0);
    const hidden = useHiddenMedia(cid && uid ? { cid, uid } : undefined);

    const readPage = useCallback(
        async (kind: ChatMediaKind, cursorNo: number | undefined): Promise<KindPage | undefined> => {
            if (!cid || !channelId) return undefined;
            const page = await chats.listRoomMedia({
                channelId,
                kind,
                ...(cursorNo !== undefined ? { cursorNo } : {}),
                limit: PAGE_SIZE,
            });
            const items = page.items
                .map(item => toRoomFileEntry(item, cid))
                .filter((entry): entry is RoomFileEntry => !!entry);
            return { items, next: page.nextCursorNo };
        },
        [chats, cid, channelId]
    );

    /** Reads the tab's kinds from the newest again. */
    const reload = useCallback(async () => {
        const run = ++generation.current;
        setLoading(true);
        try {
            const fresh = await Promise.all(kinds.map(kind => readPage(kind, undefined)));
            if (run !== generation.current) return;
            // The newest page replaces what it covers and keeps what was read below it: a re-read on every
            // change of the room must not throw away the pages already scrolled through.
            setPages(previous => {
                const next = { ...previous };
                kinds.forEach((kind, at) => {
                    const page = fresh[at];
                    if (page) next[kind] = withNewestPage(previous[kind], page);
                });
                return next;
            });
        } catch (error) {
            if (isRuntimeNotAvailable(error)) setUnavailable(true);
        } finally {
            if (run === generation.current) setLoading(false);
        }
    }, [kinds, readPage]);

    /** The next page of every kind of the tab that has one. */
    const loadMore = useCallback(async () => {
        const now = pagesRef.current;
        const due = kinds.filter(kind => {
            const page = now[kind];
            return page && page.next !== null && page.next !== undefined;
        });
        if (due.length === 0 || loading) return;
        setLoading(true);
        try {
            const more = await Promise.all(due.map(kind => readPage(kind, now[kind]?.next ?? undefined)));
            setPages(previous => {
                const next = { ...previous };
                due.forEach((kind, at) => {
                    const page = more[at];
                    if (page) next[kind] = withOlderPage(previous[kind], page);
                });
                return next;
            });
        } finally {
            setLoading(false);
        }
    }, [kinds, loading, readPage]);

    const exhausted = kinds.every(kind => pages[kind]?.next === null);
    const serverDone = historyCursor === 0;

    /** Widens the cache with one older page from the server, then reads on from where each kind stopped. */
    const findOlder = useCallback(async () => {
        if (!cid || !channelId || searching || serverDone) return;
        setSearching(true);
        try {
            const lowest = Math.min(
                ...kinds.flatMap(kind => pagesRef.current[kind]?.items.map(entry => entry.chatNo) ?? []),
                Number.POSITIVE_INFINITY
            );
            const cursorNo = historyCursor ?? (Number.isFinite(lowest) ? lowest : undefined);
            const result = await chats.refreshList({
                channelId,
                ...(cursorNo !== undefined ? { cursorNo } : {}),
                limit: HISTORY_PAGE_SIZE,
            } as Parameters<typeof chats.refreshList>[0]);
            setHistoryCursor(result.cursorNo ?? 0);
            // Read on from where each kind stops now — the room's own re-read may have run meanwhile.
            const more = await Promise.all(
                kinds.map(kind => {
                    const had = pagesRef.current[kind]?.items;
                    return readPage(kind, had?.length ? had[had.length - 1]!.chatNo : undefined);
                })
            );
            setPages(previous => {
                const next = { ...previous };
                kinds.forEach((kind, at) => {
                    const page = more[at];
                    if (page) next[kind] = withOlderPage(previous[kind], page);
                });
                return next;
            });
        } catch (error) {
            if (isRuntimeNotAvailable(error)) setUnavailable(true);
        } finally {
            setSearching(false);
        }
    }, [chats, cid, channelId, historyCursor, kinds, readPage, searching, serverDone]);

    // Each new tab starts from the newest; every change in the room's newest window reads it again.
    useEffect(() => {
        if (!cid || !channelId) return undefined;
        return chats.observeList({ channelId, limit: 1 }, () => void reload());
    }, [chats, cid, channelId, reload]);

    const entries = useMemo(() => {
        const merged = mergeNewestFirst(kinds.map(kind => pages[kind] ?? { items: [], next: undefined }));
        return hidden.size ? merged.filter(entry => !hidden.has(entry.key)) : merged;
    }, [hidden, kinds, pages]);

    // A tab that opens empty while older messages may hold its files looks once on its own.
    useEffect(() => {
        if (!exhausted || entries.length > 0 || serverDone || searching || autoSearched.current.has(tab)) return;
        autoSearched.current.add(tab);
        void findOlder();
    }, [entries.length, exhausted, findOlder, searching, serverDone, tab]);

    return {
        entries,
        loading: loading && entries.length === 0,
        hasMorePages: !exhausted,
        loadMore,
        canFindOlder: exhausted && !serverDone,
        findOlder,
        searching,
        unavailable,
    };
};
