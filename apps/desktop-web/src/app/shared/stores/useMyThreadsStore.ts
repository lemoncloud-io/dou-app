import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
    markThreadSeen,
    myThreadKey,
    recordThreadReply,
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
    /** Adds a cloud's cached threads as read — history, not news — leaving listed ones alone. */
    backfill: (cid: string, found: Array<{ reply: ThreadReply; root: ThreadRoot }>) => void;
}

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
