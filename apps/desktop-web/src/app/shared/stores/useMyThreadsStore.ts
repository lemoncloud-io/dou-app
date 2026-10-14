import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
    isThreadIn,
    markCloudSeen,
    markThreadSeen,
    myThreadKey,
    recordThreadReply,
    isThreadUnread,
    type MyThreads,
    type ThreadReply,
    type ThreadRoot,
} from '../utils/myThreads';

interface MyThreadsState {
    threads: MyThreads;
    /** Clouds whose cache has been read into the list once — the first launch with the feature. */
    backfilled: Record<string, true>;
    record: (reply: ThreadReply, options?: { root?: ThreadRoot; seen?: boolean }) => void;
    markSeen: (cid: string, channelId: string, rootNo: string) => void;
    /** Marks a cloud's threads looked at — one place's, when given. */
    markAllSeen: (cid: string, placeId?: string) => void;
    /** Drops a thread from the list. A later reply in it, from anyone, can list it again. */
    remove: (cid: string, channelId: string, rootNo: string) => void;
    /** Adds a cloud's cached threads as read — history, not news — leaving listed ones alone. */
    backfill: (cid: string, found: Array<{ reply: ThreadReply; root: ThreadRoot }>) => void;
}

/**
 * Whether any of a cloud's threads — one place's, when given — has a reply newer than the last look.
 * Drives the sidebar dot.
 */
export const hasUnreadThread = (threads: MyThreads, cid: string, placeId?: string): boolean =>
    Object.values(threads).some(thread => isThreadIn(thread, cid, placeId) && isThreadUnread(thread));

/**
 * Device-local list of the threads the user takes part in. No server thread list exists, so this is a
 * local record like the mentions inbox — persisted to localStorage, not following the account across
 * devices. The rules live in `myThreads`; a no-op there leaves the state, and localStorage, untouched.
 */
export const useMyThreadsStore = create<MyThreadsState>()(
    persist(
        set => ({
            threads: {},
            backfilled: {},
            record: (reply, options) =>
                set(state => {
                    const threads = recordThreadReply(state.threads, reply, options);
                    return threads === state.threads ? state : { threads };
                }),
            markSeen: (cid, channelId, rootNo) =>
                set(state => {
                    const threads = markThreadSeen(state.threads, myThreadKey(cid, channelId, rootNo));
                    return threads === state.threads ? state : { threads };
                }),
            markAllSeen: (cid, placeId) =>
                set(state => {
                    const threads = markCloudSeen(state.threads, cid, placeId);
                    return threads === state.threads ? state : { threads };
                }),
            remove: (cid, channelId, rootNo) =>
                set(state => {
                    const key = myThreadKey(cid, channelId, rootNo);
                    if (!state.threads[key]) return state;
                    const { [key]: _removed, ...threads } = state.threads;
                    return { threads };
                }),
            backfill: (cid, found) =>
                set(state => {
                    let threads = state.threads;
                    for (const { reply, root } of found) {
                        if (threads[myThreadKey(reply.cid, reply.channelId, reply.rootNo)]) continue;
                        threads = recordThreadReply(threads, reply, { root, seen: true });
                    }
                    return { threads, backfilled: { ...state.backfilled, [cid]: true } };
                }),
        }),
        { name: 'chatic-my-threads' }
    )
);

interface MyThreadsPanelState {
    isOpen: boolean;
    /** Key of the thread last opened from the pane: its row stays marked. */
    openedKey: string | null;
    /**
     * The same key, while that open is on its way. The thread panel reads it once, as it mounts, to
     * lead back here; closing the pane disarms it, so a later open from the feed or a notification —
     * or an open that never landed — gets no way back to a list it did not come from.
     */
    backKey: string | null;
    /** The list's scroll offset, kept while the app runs so coming back lands where the reader left. */
    scrollTop: number;
    /** Set by the way back: the pane, once open, puts focus on the row last opened. */
    focusOpened: boolean;
    /** The cloud whose cache is being read in on its first launch — the empty list is not final yet. */
    scanningCid: string | null;
    open: () => void;
    close: () => void;
    markOpened: (key: string) => void;
    /** Reopens the pane from the thread it opened, focus returning to that thread's row. */
    back: () => void;
    focusDone: () => void;
    saveScroll: (top: number) => void;
    setScanning: (cid: string | null) => void;
}

/** The Threads pane's UI state, in memory only (HomePage enforces pane exclusivity). */
export const useMyThreadsPanelStore = create<MyThreadsPanelState>(set => ({
    isOpen: false,
    openedKey: null,
    backKey: null,
    scrollTop: 0,
    focusOpened: false,
    scanningCid: null,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false, backKey: null }),
    markOpened: key => set({ openedKey: key, backKey: key }),
    back: () => set({ isOpen: true, focusOpened: true }),
    focusDone: () => set({ focusOpened: false }),
    saveScroll: top => set({ scrollTop: top }),
    setScanning: cid => set({ scanningCid: cid }),
}));
