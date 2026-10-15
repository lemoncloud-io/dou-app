import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import { isInJoinWindow } from '@chatic/data';
import type { DomainChat, DomainUser } from '@chatic/data';

import { isFeedVisible, isOwnSystemChat } from '../../../utils';
import type { ClientChatView } from '../types';
import { useForegroundChatRefresh } from './useForegroundChatRefresh';

// Rows asked for per older page. `observeList` returns only the newest `limit` rows (chat_no-descending
// cursor paging), so to reveal older history the window must grow to re-include the freshly cached
// page — by the rows that actually came back, since the server answers with the page size it applied
// rather than promising the one asked for.
const LOAD_MORE_SIZE = 50;

// Extra rows kept around a jump target so it lands with context above it rather than flush at the
// very edge of the window.
const JUMP_WINDOW_PADDING = 20;

// A failed page waits this long before the room's own prefetch may ask for it again, doubling per
// consecutive failure up to the cap. The prefetch re-checks on every scroll event and on every commit
// that changes the list, so without a wait a failing request would be resent as fast as it fails.
const LOAD_MORE_RETRY_BASE_MS = 2000;
const LOAD_MORE_RETRY_MAX_MS = 30000;

// How long a landed page may wait for its widened window to be read back before paging is released
// anyway. The read normally takes one cache round trip; this only stops a lost emission from locking
// paging for the rest of the visit.
const WINDOW_LAND_TIMEOUT_MS = 5000;

// A hole in the cached numbers no larger than this is not shown as a gap. Most holes are deleted
// messages — the feed leaves them out — and those that are not get filled when the rows around them
// are re-checked (`revalidateAround`), so a divider there would only flash and go.
const GAP_DIVIDER_MIN_MISSING = 11;

/**
 * A stretch of the conversation between two cached rows that this run has not fetched: real history
 * the cache never held, as opposed to the holes deleted messages leave (see `FeedCoverage`).
 */
export interface ChatGap {
    /** The cached row just below the gap — the older side. */
    olderNo: number;
    /** The cached row just above the gap — the newer side. */
    newerNo: number;
    /** Chat numbers in between that no page has answered for; deleted ones among them included. */
    missing: number;
}

/** Which side of a gap to fill from: the one the reader is coming from. */
export type ChatGapSide = 'newer' | 'older';

export const chatGapKey = (gap: Pick<ChatGap, 'olderNo' | 'newerNo'>): string => `${gap.olderNo}-${gap.newerNo}`;

/** How a caller asks for an older page. */
export interface LoadMoreOptions {
    /**
     * A person asked — a tap on "load older", a jump to a message. Sent at once instead of waiting out
     * a failed page's retry delay: the delay exists for the room's prefetch, which asks on every
     * scroll event, and held against a person it turned a press into nothing at all.
     */
    immediate?: boolean;
}

interface UseChatsParams {
    channelId: string;
    limit: number;
    /**
     * My join cursor (`join.joinedNo`) — rows at or below it predate my current membership and are
     * dropped from everything this hook exposes (ADR-0067). Deliberately NOT part of the paging
     * reset below: it arrives from the join cache slightly after mount, and treating a late arrival
     * as a channel change would throw away the window the reader is already looking at.
     */
    joinedNo?: number;
    /**
     * Whether the reader is away from the bottom, reading history — kept current by the room's scroll
     * hook. While it is true, a widened window grows by every row that arrives, so the top of what the
     * reader is looking at does not fall out of it. At the bottom nobody is reading those rows: arrivals
     * push them out as they always did, which is what keeps the window from growing for as long as the
     * room stays open. Without it (the thread page), a widened window always keeps its oldest row.
     */
    readingHistoryRef?: { readonly current: boolean };
}

/** Build the uid → display-name map used to resolve a message owner's name. */
const nameOf = (chat: DomainChat, userMap: Map<string, DomainUser>): string =>
    userMap.get(chat.ownerId ?? '')?.name ?? chat.owner$?.name ?? chat.ownerId ?? '';

/**
 * Message stream for a channel. Observes the newest `pageLimit` rows; `loadMore`
 * fetches the next older page by cursor and widens the window so the cache
 * re-emits with the older page included (testbed's paging model). Domain rows
 * are mapped to `ClientChatView` (owner identity, parsed timestamp, flags),
 * sorted oldest → newest so the last element is the latest message.
 */
export const useChats = ({ channelId, limit, joinedNo, readingHistoryRef }: UseChatsParams) => {
    const { chat: chatRepository, user: userRepository } = runtime.data.useRuntimeRepositories();
    const { userId } = runtime.session.useSessionIdentity();
    // `loadMore` goes out on the active socket slot, so it waits for that slot to verify, like the
    // entry refresh does. Taken as a dependency of `loadMore`, so its callers re-run on the
    // false → true edge and paging resumes by itself after a reconnect.
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const myUid = userId ?? '';

    // Chat fetching is owned by the sync layer: runtime.sync.useChatSync registers a 'chat' target, and
    // usePrimeChat seeds the initial page (refreshList when the cache is cold) while ChatSyncPlan
    // streams live + catches up on reconnect. So this hook never fetches on entry itself — it only
    // observes the cache. Only `loadMore` fetches here: an older page, for the room's prefetch, a
    // message jump or the thread's "load older" button.
    runtime.sync.useChatSync(channelId);
    // Warm-cache complement: pushes missed while backgrounded leave no recovery path (the chat
    // plan doesn't poll), so warm rooms refetch the newest page on entry and foreground return.
    useForegroundChatRefresh(channelId);

    const [cachedChats, setCachedChats] = useState<DomainChat[]>([]);
    const [users, setUsers] = useState<DomainUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [pageLimit, setPageLimit] = useState(limit);
    // A jump widens the window on its own axis. Kept separate from `pageLimit` so it cannot disturb
    // `isThreadStartLoaded`, which reads "the cache could not fill the page" as "nothing older". Growth
    // after a jump — a page, rows arriving — goes to whichever axis is the wider one (`growWindow`).
    const [jumpLimit, setJumpLimit] = useState(0);
    const observeLimit = Math.max(pageLimit, jumpLimit);
    // True while a failed page waits out its retry delay. `loadMore` reads it, so the end of the wait
    // hands its callers a new `loadMore` — which is what makes the room's prefetch check run again.
    const [isBackingOff, setIsBackingOff] = useState(false);
    // Bumped when a fetch of this hook's own proves a range, so gaps are worked out again even when the
    // page brought no row the window did not already hold — a gap of deleted messages closes that way.
    const [coverageVersion, setCoverageVersion] = useState(0);
    // Gaps being filled, and gaps whose last fill failed (the divider then offers a retry).
    const [gapStatus, setGapStatus] = useState<ReadonlyMap<string, 'loading' | 'failed'>>(new Map());
    // Ranges asked for and not yet answered, by request cursor — one request per range at a time.
    const rangeInFlightRef = useRef(new Set<number>());

    // Paging state that has to be read synchronously. The room's prefetch and a message jump can both
    // ask for a page within one frame, and a state flag would let both through before either render.
    const loadingMoreRef = useRef(false);
    // The window size a landed page is waiting to see read back. Paging stays held until then: released
    // earlier, the next check would still read the old oldest row and ask for the same page again.
    const awaitingLimitRef = useRef<number | null>(null);
    const landTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    // What the page in flight will mean once its rows are on screen: its cursor, for the no-progress
    // check, and whether the server called it the last page.
    const pendingPageRef = useRef<{ cursorNo: number; isLast: boolean } | null>(null);
    // The cursor of the last page whose rows reached the window.
    const lastCursorRef = useRef<number | null>(null);
    const failuresRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    // The newest chatNo this window has held, to tell rows that arrived from rows already counted.
    const newestNoRef = useRef(0);
    // Bumped on every reset and on unmount, so a page requested for the previous channel — or for a
    // room that has closed — cannot land.
    const generationRef = useRef(0);

    // The join window is applied at the hook's boundary, not just before rendering: leaving does not
    // clear rows already cached, so everything derived from this window — the feed, the paging
    // cursor, `rawChats` (reaction folding, thread building, "is row 1 loaded") — has to agree on
    // where my CURRENT membership starts. Windowing only `messages` left `rawChats` claiming the
    // conversation began at row 1 for someone who re-joined mid-thread (ADR-0067).
    const chats = useMemo(() => cachedChats.filter(chat => isInJoinWindow(chat, joinedNo)), [cachedChats, joinedNo]);

    // Latest chats snapshot for loadMore — keeps the callback identity stable (a `chats`/`messages`
    // dependency would rebuild loadMore on every live message append, re-attaching scroll listeners).
    const chatsRef = useRef<DomainChat[]>(chats);
    chatsRef.current = chats;
    // Read inside loadUntil without making it depend on (and churn with) the window size.
    const observeLimitRef = useRef(observeLimit);
    observeLimitRef.current = observeLimit;
    const pageLimitRef = useRef(pageLimit);
    pageLimitRef.current = pageLimit;
    const jumpLimitRef = useRef(jumpLimit);
    jumpLimitRef.current = jumpLimit;

    // Grows whichever axis is the window right now. After a jump `jumpLimit` is the wider one: adding
    // to `pageLimit` would not move the window, and copying the jump's width into `pageLimit` would make
    // `isThreadStartLoaded` read the jump's over-estimate as rows the cache could not fill.
    const growWindow = useCallback((rows: number) => {
        if (jumpLimitRef.current > pageLimitRef.current) setJumpLimit(prev => prev + rows);
        else setPageLimit(prev => prev + rows);
    }, []);

    const releasePaging = useCallback(() => {
        awaitingLimitRef.current = null;
        pendingPageRef.current = null;
        clearTimeout(landTimerRef.current);
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
    }, []);

    // The page is on screen. Only now does it count as progress, and only now may "that was the last
    // page" end paging: ended when the request returned, a jump to a row in this very page gave up one
    // render before the row appeared.
    const settlePage = useCallback(() => {
        const page = pendingPageRef.current;
        if (page) {
            lastCursorRef.current = page.cursorNo;
            if (page.isLast) setHasMore(false);
        }
        releasePaging();
    }, [releasePaging]);

    const endBackoff = useCallback(() => {
        failuresRef.current = 0;
        clearTimeout(retryTimerRef.current);
        setIsBackingOff(false);
    }, []);

    // Reset paging/scroll guards on channel change or window-size change — treat it as a fresh entry.
    useEffect(() => {
        generationRef.current += 1;
        setCachedChats([]);
        setIsLoading(true);
        setHasMore(true);
        setPageLimit(limit);
        setJumpLimit(0);
        releasePaging();
        endBackoff();
        lastCursorRef.current = null;
        newestNoRef.current = 0;
        rangeInFlightRef.current = new Set();
        setGapStatus(new Map());
    }, [channelId, limit, releasePaging, endBackoff]);

    useEffect(
        () => () => {
            generationRef.current += 1;
            clearTimeout(landTimerRef.current);
            clearTimeout(retryTimerRef.current);
        },
        []
    );

    // Widening pageLimit re-subscribes and re-reads cached older pages into view.
    useEffect(() => {
        if (!channelId) return;
        return chatRepository.observeList({ channelId, limit: observeLimit }, result => {
            const list = result?.list ?? [];
            setCachedChats(list);
            setIsLoading(false);

            let newestNo = 0;
            for (const chat of list) if (chat.chatNo && chat.chatNo > newestNo) newestNo = chat.chatNo;
            const previousNewestNo = newestNoRef.current;
            if (newestNo > previousNewestNo) {
                newestNoRef.current = newestNo;
                // The window holds the newest `observeLimit` rows, so every row that arrives pushes one
                // of the oldest out. Before any paging those are rows nobody is looking at. Once the
                // reader has paged back and is reading history, they are the top of what they are
                // reading: they vanished from the screen, and the next page asked the server for them
                // again. So that window grows by as many rows as arrived, and its oldest row stays put.
                const isReadingHistory = readingHistoryRef ? readingHistoryRef.current : true;
                if (previousNewestNo > 0 && observeLimit > limit && isReadingHistory) {
                    let arrived = 0;
                    for (const chat of list) if (chat.chatNo && chat.chatNo > previousNewestNo) arrived += 1;
                    growWindow(arrived);
                }
            }

            if (awaitingLimitRef.current !== null && observeLimit >= awaitingLimitRef.current) settlePage();
        });
    }, [chatRepository, channelId, observeLimit, limit, readingHistoryRef, growWindow, settlePage]);

    // Member identity for owner-name fallback (best-effort; cache stream persists).
    useEffect(() => {
        if (!channelId) return;
        return userRepository.observeList({ channelId }, result => setUsers(result?.list ?? []));
    }, [userRepository, channelId]);

    const userMap = useMemo(() => {
        const map = new Map<string, DomainUser>();
        for (const user of users) if (user.id) map.set(user.id, user);
        return map;
    }, [users]);

    // Sort oldest → newest so messages[last] is the latest (the page reads it for auto-read).
    // Pending/failed (optimistic) rows have no server chatNo yet — they must sort AFTER all
    // committed rows (i.e. as the newest, at the bottom), not at chatNo 0 which would pin them to
    // the top. So a missing/zero chatNo is treated as +Infinity, with createdAt as the tiebreak
    // (multiple pending rows, or a pending vs. its just-committed twin).
    // Own system rows (my join/leave) are hidden — they carry no information for their subject.
    // Read-marking is unaffected: stage 1 of useReadMarker sends channel.chatNo, which already
    // covers a hidden newest row.
    // isFeedVisible additionally drops reaction events (they fold into chips — as rows they were
    // the empty-pill bug ADR-0093 fixes) and thread replies (they live on the thread page).
    // Rows predating my current membership are already gone — `chats` is windowed above (ADR-0067).
    const messages = useMemo<ClientChatView[]>(() => {
        const sortKey = (chat: DomainChat): number =>
            chat.chatNo && chat.chatNo > 0 ? chat.chatNo : Number.POSITIVE_INFINITY;
        return chats
            .filter(chat => !isOwnSystemChat(chat, myUid) && isFeedVisible(chat))
            .sort((a, b) => {
                const aNo = sortKey(a);
                const bNo = sortKey(b);
                if (aNo !== bNo) return aNo - bNo;
                return (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
            })
            .map(chat => ({
                ...chat,
                isOwner: !!chat.ownerId && chat.ownerId === myUid,
                isSystem: chat.stereo === 'system',
                ownerName: nameOf(chat, userMap),
                timestamp: new Date(chat.createdAtMs ?? chat.createdAt ?? 0),
            }));
    }, [chats, userMap, myUid]);

    const loadMore = useCallback(
        async ({ immediate = false }: LoadMoreOptions = {}) => {
            if (!channelId || !isVerified || !hasMore || loadingMoreRef.current) return;
            if (isBackingOff && !immediate) return;
            // Read the oldest cached row from the ref so the cursor reflects the live list without
            // making `chats` a dependency. observeList is chat_no-descending, so the smallest chatNo
            // is the page boundary to fetch before. Unsent rows carry chatNo 0 until the server numbers
            // them; taken as the cursor, a pending message would ask for history below 0 and end paging.
            let oldestNo = Infinity;
            for (const chat of chatsRef.current) {
                if (chat.chatNo && chat.chatNo > 0 && chat.chatNo < oldestNo) oldestNo = chat.chatNo;
            }
            if (!Number.isFinite(oldestNo)) return;
            // The window already holds the first row I can be shown — chatNo 1, or the one right after my
            // join cursor — so there is nothing older to ask for. The room fills a thread too short to
            // scroll by asking for older pages, and without this every small room would spend a request
            // on each entry just to be told so.
            if (oldestNo <= (joinedNo ?? 0) + 1) {
                setHasMore(false);
                return;
            }
            // The last page reached the window, yet the window's oldest row has not moved: nothing it
            // brought can be shown here (it all predates my membership, say), and asking again would
            // fetch the same rows forever.
            if (oldestNo === lastCursorRef.current) {
                setHasMore(false);
                return;
            }

            const generation = generationRef.current;
            loadingMoreRef.current = true;
            setIsLoadingMore(true);

            // Cache first: a page below that a page already answered for in this run has its rows in the
            // cache, so the window grows over them without asking the server again. Only when a cached
            // row is there to show — a range of nothing but deleted messages would leave the window
            // where it is, and the no-progress check would take that for the start of history.
            const pageLow = Math.max(1, oldestNo - LOAD_MORE_SIZE);
            if (chatRepository.uncoveredFeed(channelId, pageLow, oldestNo - 1).length === 0) {
                // A failed read only means the cache cannot vouch for the page: ask the server, as before.
                const below = await chatRepository
                    .cacheReadList({ channelId, cursorNo: oldestNo, limit: 1 })
                    .catch(() => null);
                if (generation !== generationRef.current) return;
                if ((below?.list?.[0]?.chatNo ?? 0) >= pageLow) {
                    pendingPageRef.current = { cursorNo: oldestNo, isLast: pageLow <= (joinedNo ?? 0) + 1 };
                    awaitingLimitRef.current = observeLimitRef.current + LOAD_MORE_SIZE;
                    growWindow(LOAD_MORE_SIZE);
                    clearTimeout(landTimerRef.current);
                    landTimerRef.current = setTimeout(releasePaging, WINDOW_LAND_TIMEOUT_MS);
                    return;
                }
            }

            try {
                // The cursor is the oldest cached row, so the channel's head is above it.
                const result = await chatRepository.refreshList(
                    { channelId, cursorNo: oldestNo, limit: LOAD_MORE_SIZE },
                    { cursorIsRow: true }
                );
                if (generation !== generationRef.current) return;
                endBackoff();
                if (result.fetchedCount === 0) {
                    setHasMore(false);
                    releasePaging();
                    return;
                }
                // `cursorNo: 0` is the server saying this page was the last one (its feed contract, which
                // the SDK's own catch-up also stops on). Trusting it saves the empty round trip that would
                // otherwise be the only way to find out. Applied once the page is on screen (settlePage).
                pendingPageRef.current = { cursorNo: oldestNo, isLast: result.cursorNo === 0 };
                awaitingLimitRef.current = observeLimitRef.current + result.fetchedCount;
                growWindow(result.fetchedCount);
                clearTimeout(landTimerRef.current);
                // Released, not settled: a page that never showed is neither progress nor an end, so the
                // next check may ask for it again rather than conclude there is nothing older.
                landTimerRef.current = setTimeout(releasePaging, WINDOW_LAND_TIMEOUT_MS);
            } catch {
                if (generation !== generationRef.current) return;
                // An older page that did not arrive is a paging problem, not a room problem: the room
                // stays as it is and the page is asked for again once the wait is over. This used to
                // raise the room's error, which swapped the whole conversation for "unable to load"
                // over a single dropped request — a reconnect mid-scroll was enough.
                failuresRef.current += 1;
                const wait = Math.min(LOAD_MORE_RETRY_MAX_MS, LOAD_MORE_RETRY_BASE_MS * 2 ** (failuresRef.current - 1));
                setIsBackingOff(true);
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = setTimeout(() => setIsBackingOff(false), wait);
                releasePaging();
            }
        },
        [chatRepository, channelId, hasMore, isBackingOff, isVerified, joinedNo, growWindow, releasePaging, endBackoff]
    );

    /**
     * Widens the observe window so a cached message at `targetNo` comes into view — the jump path
     * (useMessageJump), and the thread page reaching an old root. This reads the CACHE only: `loadMore` fetches one 50-row page from the
     * server per call, so reaching a message a few hundred rows back took more round trips than the
     * jump budget allows, and the jump gave up on a message that was sitting in the cache all along.
     *
     * Returns true when the window actually grew, i.e. it is worth waiting for the re-render.
     * False means the window already covers that far back, so the row genuinely isn't cached and
     * the caller should fall back to paging.
     */
    const loadUntil = useCallback((targetNo: number): boolean => {
        if (!Number.isFinite(targetNo) || targetNo <= 0) return false;

        let newestNo = 0;
        for (const chat of chatsRef.current) {
            if (chat.chatNo != null && chat.chatNo > newestNo) newestNo = chat.chatNo;
        }
        if (newestNo <= targetNo) return false;

        // chatNo is one sequence over user + system messages, so its distance is an upper bound on
        // the rows in between — an over-estimate only shows more cached rows, never fewer.
        const needed = newestNo - targetNo + JUMP_WINDOW_PADDING;
        if (needed <= observeLimitRef.current) return false;

        // The wider ask wins. Two callers can widen within one commit — the thread page toward its
        // root and a jump toward a reply below it — and both read the same pre-commit window, so a
        // plain set let the narrower one land last: the jump scrolled to the reply, and the root
        // with every older reply then loaded above it and pushed it out of place.
        setJumpLimit(prev => Math.max(prev, needed));
        return true;
    }, []);

    // Where the window skips history no page has answered for. A run of missing numbers is a gap only
    // when enough of it is unanswered: inside a range a page answered for, a missing number is a
    // deleted message.
    const gaps = useMemo<ChatGap[]>(() => {
        // Read so the gaps are worked out again when a fetch proved a range without adding a row.
        void coverageVersion;
        const numbers = chats
            .map(chat => chat.chatNo)
            .filter((chatNo): chatNo is number => !!chatNo && chatNo > 0)
            .sort((a, b) => a - b);
        const found: ChatGap[] = [];
        for (let index = 1; index < numbers.length; index += 1) {
            const olderNo = numbers[index - 1];
            const newerNo = numbers[index];
            if (newerNo - olderNo - 1 < GAP_DIVIDER_MIN_MISSING) continue;
            const missing = chatRepository
                .uncoveredFeed(channelId, olderNo + 1, newerNo - 1)
                .reduce((sum, [low, high]) => sum + high - low + 1, 0);
            if (missing >= GAP_DIVIDER_MIN_MISSING) found.push({ olderNo, newerNo, missing });
        }
        return found;
    }, [chats, chatRepository, channelId, coverageVersion]);

    /**
     * Fetches the page below `cursorNo` — any `[cursorNo − 50, cursorNo)` is one request — and widens
     * the window by the rows that were not cached before, so a page landing between two runs does not
     * push the oldest run out of a window counted in rows. Rows the cache held but the page left out
     * are marked deleted (`markMissingHidden`): this is history the reader is looking at again.
     *
     * Resolves false when nothing was sent: no socket yet, or the same range already in flight.
     */
    const fetchRange = useCallback(
        async (cursorNo: number, { cursorIsRow = false }: { cursorIsRow?: boolean } = {}): Promise<boolean> => {
            if (!channelId || !isVerified || rangeInFlightRef.current.has(cursorNo)) return false;
            rangeInFlightRef.current.add(cursorNo);
            const generation = generationRef.current;
            let held = 0;
            for (const chat of chatsRef.current) {
                if (chat.chatNo && chat.chatNo < cursorNo && chat.chatNo >= cursorNo - LOAD_MORE_SIZE) held += 1;
            }
            try {
                const result = await chatRepository.refreshList(
                    { channelId, cursorNo, limit: LOAD_MORE_SIZE },
                    { markMissingHidden: true, cursorIsRow }
                );
                if (generation !== generationRef.current) return false;
                const added = result.fetchedCount - held;
                if (added > 0) growWindow(added);
                setCoverageVersion(version => version + 1);
                return true;
            } finally {
                rangeInFlightRef.current.delete(cursorNo);
            }
        },
        [chatRepository, channelId, isVerified, growWindow]
    );

    /**
     * Fills one page of `gap` from the side the reader is coming from: from the newer side when they
     * scroll up into it, from the older side when they scroll down into it (after a jump into old
     * history). Either way the rows land next to what the reader is looking at, and the divider moves
     * on by a page; it asks again while it is still in view.
     */
    const fillGap = useCallback(
        async (gap: ChatGap, side: ChatGapSide) => {
            const key = chatGapKey(gap);
            // Next to what is still unanswered, not next to the gap's edges: a page of nothing but
            // deleted messages proves its range without moving either edge, and asking from the edge
            // again would fetch that same range for ever.
            const open = chatRepository.uncoveredFeed(channelId, gap.olderNo + 1, gap.newerNo - 1);
            if (open.length === 0) return;
            const cursorNo =
                side === 'newer' ? open[open.length - 1][1] + 1 : Math.min(open[0][0] + LOAD_MORE_SIZE, gap.newerNo);
            setGapStatus(previous => new Map(previous).set(key, 'loading'));
            const settle = (status?: 'failed') =>
                setGapStatus(previous => {
                    const next = new Map(previous);
                    if (status) next.set(key, status);
                    else next.delete(key);
                    return next;
                });
            try {
                // The gap's newer edge is a cached, numbered row: the head is at or above it.
                await fetchRange(cursorNo, { cursorIsRow: cursorNo === gap.newerNo });
                settle();
            } catch {
                settle('failed');
            }
        },
        [chatRepository, channelId, fetchRange]
    );

    // Blocks re-checked this visit. A block reaching past the newest message is never answered for in
    // full — the server counts only up to its head — so coverage alone would send it again on every
    // scroll event.
    const recheckedRef = useRef(new Set<number>());
    // Blocks whose last re-check failed, and when — so a failing request is not resent on every
    // scroll event while the reader stays on those rows.
    const recheckFailedAtRef = useRef(new Map<number, number>());
    // Both are about one channel's numbers; another channel's block 51–100 is a different block.
    useEffect(() => {
        recheckedRef.current = new Set();
        recheckFailedAtRef.current = new Map();
    }, [channelId]);

    /**
     * Re-checks the 50-number block holding `chatNo` once per run, when no page has answered for it
     * yet: cached rows show at once, and this brings back what changed while the device was away —
     * edits, deletes — and fills any hole in the block that was not a deletion. The room calls it with
     * the row the reader is reading.
     */
    const revalidateAround = useCallback(
        (chatNo: number) => {
            if (!channelId || !chatNo || chatNo <= 0) return;
            const low = Math.floor((chatNo - 1) / LOAD_MORE_SIZE) * LOAD_MORE_SIZE + 1;
            const high = low + LOAD_MORE_SIZE - 1;
            if (recheckedRef.current.has(low)) return;
            if (chatRepository.uncoveredFeed(channelId, low, high).length === 0) return;
            const failedAt = recheckFailedAtRef.current.get(low);
            if (failedAt && Date.now() - failedAt < LOAD_MORE_RETRY_MAX_MS) return;
            fetchRange(high + 1).then(
                sent => {
                    if (sent) recheckedRef.current.add(low);
                },
                () => recheckFailedAtRef.current.set(low, Date.now())
            );
        },
        [chatRepository, channelId, fetchRange]
    );

    /**
     * Fetches the page that starts at `chatNo` and runs 50 numbers newer — the thread page's way to a
     * root that sits in a gap, which `loadMore` cannot reach (it only ever asks below the oldest cached
     * row). Starting at the root rather than ending at it brings the replies that follow it too.
     */
    const fetchThrough = useCallback(
        (chatNo: number): Promise<boolean> => fetchRange(chatNo + LOAD_MORE_SIZE),
        [fetchRange]
    );

    /** Whether a page has answered for `chatNo` in this run (read again after each of this hook's fetches). */
    const isFetched = useCallback(
        (chatNo: number): boolean => {
            // Read so callers get a new function when the answer may have changed.
            void coverageVersion;
            return chatRepository.uncoveredFeed(channelId, chatNo, chatNo).length === 0;
        },
        [chatRepository, channelId, coverageVersion]
    );

    return {
        messages,
        /**
         * The cache window before the FEED filter. Reaction folding and thread derivation MUST read
         * this list — `messages` has the reaction events and replies filtered out, so
         * deriving from it would silently yield nothing (ADR-0093).
         *
         * "Raw" is about the feed filter only: the join window (ADR-0067) is already applied, so
         * nothing here predates my current membership.
         */
        rawChats: chats,
        isLoading,
        isEmpty: !isLoading && messages.length === 0,
        /**
         * An older page is in flight, or has come back and is waiting for the widened window to be
         * read. It turns false once the page's rows are in `messages`, and otherwise when the page
         * came back empty or failed, when the 5s fallback gave up waiting for the window, or on a
         * channel change.
         */
        isLoadingMore,
        hasMore,
        /**
         * An older page can be asked for right now: the socket it goes out on is verified. The callers
         * that act for a person — the thread's "load older" button, a message jump — gate on it, so a
         * press is never silently dropped and a jump does not spend its budget on calls that send
         * nothing. (They also pass `immediate`, so a failed page's retry wait does not apply to them.)
         */
        canLoadMore: isVerified,
        /**
         * The oldest loaded row really is the thread's first, so anything anchored to the start of
         * the conversation can render.
         *
         * No longer read by the room: the intro keys off holding `chatNo === 1`, which is proof
         * rather than inference and never flips back as pages land. Kept as the paging fact it
         * describes — and because it is the only thing that pins the jumpLimit / pageLimit split
         * above to an observable outcome.
         *
         * `!hasMore` alone is not enough: it turns false only once paging has proof there is nothing
         * older, and a thread whose older pages nobody asks for — the thread page's, until someone
         * presses "load older" — would wait on that forever. A page the cache could not fill is the
         * other way to know there is nothing older. Kept separate from `hasMore` on purpose: a short
         * cache during hydration must not disable pagination.
         */
        isThreadStartLoaded: !hasMore || chats.length < pageLimit,
        loadMore,
        loadUntil,
        /** Unfetched stretches between cached rows, oldest first — where the room draws a divider. */
        gaps,
        /** Fill state per gap (`chatGapKey`); absent means idle. */
        gapStatus,
        fillGap,
        revalidateAround,
        fetchThrough,
        isFetched,
    };
};
