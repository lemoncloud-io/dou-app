import { logger } from '@chatic/logger';
import { getActivePerfTrace } from '@chatic/perf';
import { fetchRoomFeed, getSyncManager } from '@chatic/sync';

import { getDataManager } from '../data/runtime';

/** How a prime ended. `cancelled` is a prime its caller stopped wanting before it finished. */
export type ChatPrimeOutcome = 'ready' | 'failed' | 'cancelled';

export interface PrimeChatRoomOptions {
    /** Asked between steps; once it answers `true` the prime writes nothing more. */
    cancelled?: () => boolean;
}

/**
 * Primes a room so it can render: aligns the chat plan's baseline to the durable cache's newest chatNo
 * (its cursor) through `updateLocalSnapshot`, then fetches a first page only when the cache is cold.
 *
 * Chat plans have a no-op `run`, so registering a chat target loads nothing on its own, and the plan
 * never backfills past history — a cold room needs this explicit first page to render anything. A warm
 * room reads from its cache and streams by push.
 *
 * Everything here is about `cid`, the cloud the room belongs to: its runtime takes the baseline, its
 * partition is the cache read and the page written. Call it once that cloud's slot is verified — the
 * fetch goes out on it.
 *
 * A room being opened has a `chat_room_sync` trace in progress, and a cold room's first page is the
 * sync it waits for, so the phases are marked here: slot verified (the call itself), page requested,
 * page written. The room page ends the trace when that page reaches the screen.
 *
 * A failure is logged and reported as `failed`, never thrown.
 */
export const primeChatRoom = async (
    cid: string,
    channelId: string,
    { cancelled = () => false }: PrimeChatRoomOptions = {}
): Promise<ChatPrimeOutcome> => {
    getActivePerfTrace('chat_room_sync', channelId)?.mark('verified');
    try {
        const repos = getDataManager().getScopedRepositories(cid);
        const cached = await repos.chat.cacheReadList({ channelId });
        if (cancelled()) return 'cancelled';
        const lastNo = (cached?.list ?? []).reduce((max, chat) => (chat.chatNo > max ? chat.chatNo : max), 0);

        // Tell the plan our newest chatNo so the next onConnected/push doesn't catch up from 0.
        getSyncManager().updateLocalSnapshot(
            { type: 'chat', id: channelId },
            { id: channelId, lastNo, minNo: 0, messages: [] },
            { cid }
        );

        // Cold cache: only here do we fetch. A fetch the tap already started for this room is joined
        // rather than sent again.
        if (lastNo === 0) await fetchRoomFeed(cid, channelId, { cache: 'miss' });
        return 'ready';
    } catch (error) {
        logger.warn('SOCKET', '[useChatSync] Failed to prime chat target', {
            error,
            data: { channelId, cid },
        });
        return 'failed';
    }
};
