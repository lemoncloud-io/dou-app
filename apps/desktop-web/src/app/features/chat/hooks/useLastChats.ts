import { useEffect, useMemo, useState } from 'react';

import { runtime, isInJoinWindow, type DomainChannel, type DomainChat } from '@chatic/runtime';
import { logger } from '@chatic/bridges';

import { lastChatNoOf } from '../../../shared';

const FRESHNESS_PAGE = 20;

const FRESHNESS_CONCURRENCY = 3;

type ChatRepository = ReturnType<typeof runtime.data.useRuntimeRepositories>['chat'];

interface FreshnessQueue {
    inFlight: number;
    waiting: Array<{ key: string; channelId: string }>;
    fetched: Map<string, number>;
}

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

export const useLastChats = (channels: DomainChannel[]): Map<string, DomainChat> => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const [rows, setRows] = useState<{ last: Map<string, DomainChat>; lastNo: Map<string, number> }>(() => ({
        last: new Map(),
        lastNo: new Map(),
    }));

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
                const latest = row.activity ?? row.chat;
                if (latest) last.set(row.channelId, latest);
            }
            setRows({ last, lastNo });
        });
    }, [chatRepository, channelKey]);

    useEffect(() => {
        const queue = queueOf(chatRepository);
        const queued: string[] = [];
        for (const channel of channels) {
            const id = channel.id;
            const latest = lastChatNoOf(channel);
            const cached = rows.lastNo.get(id);
            if (!id || cached === undefined || latest <= cached) continue;
            const key = `${channel.sid ?? ''}/${id}`;
            if ((queue.fetched.get(key) ?? 0) >= latest) continue;
            queue.fetched.set(key, latest);
            queue.waiting.push({ key, channelId: id });
            queued.push(key);
        }
        pump(chatRepository, queue);
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
