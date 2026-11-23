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
import { deviceStore, persistStorageOver } from '../../storage';

interface MyThreadsState {
    threads: MyThreads;
    backfilled: Record<string, true>;
    record: (reply: ThreadReply, options?: { root?: ThreadRoot; seen?: boolean }) => void;
    markSeen: (cid: string, channelId: string, rootNo: string) => void;
    backfill: (cid: string, found: Array<{ reply: ThreadReply; root: ThreadRoot }>) => void;
}

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
        { name: 'chatic-my-threads', storage: persistStorageOver(deviceStore) }
    )
);
