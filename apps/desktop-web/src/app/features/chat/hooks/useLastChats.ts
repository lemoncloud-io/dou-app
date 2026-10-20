import { useEffect, useMemo, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { isInJoinWindow, type DomainChannel, type DomainChat } from '@chatic/data';

import { lastChatNoOf } from '../../../shared';

/** The page fetched when a channel's record is ahead of its cache: enough for a preview to fall through. */
const FRESHNESS_PAGE = 20;

/**
 * How many of those fetches run at once. A cold cache has every channel behind its record, and a
 * place's worth of socket fetches at the same moment would queue in front of the open channel's own.
 */
const FRESHNESS_CONCURRENCY = 3;

type ChatRepository = ReturnType<typeof runtime.data.useRuntimeRepositories>['chat'];

interface FreshnessQueue {
    inFlight: number;
    waiting: Array<{ key: string; channelId: string }>;
    /** Per place and channel, the record number already fetched for. */
    fetched: Map<string, number>;
}

/**
 * The fetch queue outlives the panel: the nav unmounts it on every leave, and a cap or a dedupe
 * kept per mount would let a quick leave-and-return double both. One queue per repository, which
 * the app holds one of per runtime.
 */
const queues = new WeakMap<ChatRepository, FreshnessQueue>();

const queueOf = (chatRepository: ChatRepository): FreshnessQueue => {
    let queue = queues.get(chatRepository);
    if (!queue) {
        queue = { inFlight: 0, waiting: [], fetched: new Map() };
        queues.set(chatRepository, queue);
    }
    return queue;
};

const pump = (chatRepository: ChatRepository, queue: FreshnessQueue) => {
    while (queue.inFlight < FRESHNESS_CONCURRENCY && queue.waiting.length > 0) {
        const { channelId } = queue.waiting.shift() as { key: string; channelId: string };
        queue.inFlight += 1;
        chatRepository
            .refreshList({ channelId, limit: FRESHNESS_PAGE })
            // Best effort: a failed fetch leaves the cached preview, and the next advance tries again.
            .catch(error =>
                logger.warn('CHAT', '[useLastChats] preview refresh failed; will retry on the next advance', {
                    channelId,
                    error,
                })
            )
            .finally(() => {
                queue.inFlight -= 1;
                pump(chatRepository, queue);
            });
    }
};

/**
 * The last previewable message of every channel in a list, from one cache observation
 * (`chat.observeLastList`) instead of a subscription per row. The per-row `useLastChat` stays for
 * the Home sidebar, whose rows show a preview only on hover.
 *
 * Two things are read on top of the cache:
 * - **The join window.** A channel's cache outlives leaving it, so a re-joined channel would carry a
 *   message from before my current join as its preview. A row at or below `$join.joinedNo` is
 *   dropped, leaving the channel with no preview — and with its record's time for the order.
 * - **Freshness.** Desktop chat sync does not deliver mid-session messages to a channel that is not
 *   open. When a channel's record says it has a newer message than its cache holds, the newest page
 *   is fetched once for that number, at most three at a time; the write wakes the observation again.
 *   This is the hook's one network path: on a cold cache it is one fetch per channel with messages.
 */
export const useLastChats = (channels: DomainChannel[]): Map<string, DomainChat> => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const [rows, setRows] = useState<{ last: Map<string, DomainChat>; lastNo: Map<string, number> }>(() => ({
        last: new Map(),
        lastNo: new Map(),
    }));

    // Sorted and joined, so a reorder of the same set does not re-subscribe.
    const channelKey = useMemo(
        () =>
            channels
                .map(channel => channel.id)
                .filter(Boolean)
                .sort()
                .join(','),
        [channels]
    );

    useEffect(() => {
        if (!channelKey) {
            setRows({ last: new Map(), lastNo: new Map() });
            return;
        }
        return chatRepository.observeLastList(channelKey.split(','), result => {
            const last = new Map<string, DomainChat>();
            const lastNo = new Map<string, number>();
            for (const row of result) {
                lastNo.set(row.channelId, row.lastNo);
                if (row.chat) last.set(row.channelId, row.chat);
            }
            setRows({ last, lastNo });
        });
    }, [chatRepository, channelKey]);

    // Queue each channel behind its record once per record number, so an advance the preview cannot
    // show (a thread reply, a reaction) is not fetched again on every emission.
    useEffect(() => {
        const queue = queueOf(chatRepository);
        const queued: string[] = [];
        for (const channel of channels) {
            const id = channel.id;
            const latest = lastChatNoOf(channel);
            const cached = rows.lastNo.get(id);
            if (!id || cached === undefined || latest <= cached) continue;
            // Channel ids are numbered per place, so the place is part of the key.
            const key = `${channel.sid ?? ''}/${id}`;
            if ((queue.fetched.get(key) ?? 0) >= latest) continue;
            queue.fetched.set(key, latest);
            queue.waiting.push({ key, channelId: id });
            queued.push(key);
        }
        pump(chatRepository, queue);
        // A fetch not started yet is dropped when the list changes or leaves: it runs in whatever
        // place is current when it starts, which may no longer be the one it was queued for. Its
        // mark goes with it, so the next scan can queue it again.
        return () => {
            queue.waiting = queue.waiting.filter(entry => {
                if (!queued.includes(entry.key)) return true;
                queue.fetched.delete(entry.key);
                return false;
            });
        };
    }, [chatRepository, channels, rows.lastNo]);

    return useMemo(() => {
        const visible = new Map<string, DomainChat>();
        for (const channel of channels) {
            const chat = rows.last.get(channel.id);
            if (chat && isInJoinWindow(chat, channel.$join?.joinedNo)) visible.set(channel.id, chat);
        }
        return visible;
    }, [rows.last, channels]);
};
