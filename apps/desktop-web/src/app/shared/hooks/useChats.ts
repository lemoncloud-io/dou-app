import { useEffect, useMemo, useState } from 'react';

import type { DomainChat } from '@chatic/data';

import { useRepositories } from '@chatic/app-runtime';

const sortByChatNo = (messages: DomainChat[]) =>
    [...messages].sort((a, b) => {
        const aNo = a.chatNo ?? Number.MAX_SAFE_INTEGER;
        const bNo = b.chatNo ?? Number.MAX_SAFE_INTEGER;
        if (aNo !== bNo) return aNo - bNo;
        return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });

/**
 * Tracer-bullet message stream. Subscribes to the engine's local chat cache for
 * a channel — GlobalChatSync (mounted in app.tsx) drives background sync, so the
 * UI updates reactively as messages arrive. No direct chat:feed calls here.
 */
export const useChats = (channelId: string | null) => {
    const { chat: chatRepository } = useRepositories();
    const [messages, setMessages] = useState<DomainChat[] | null>(null);

    useEffect(() => {
        if (!channelId) {
            setMessages([]);
            return;
        }

        setMessages(null);

        const unsubscribe = chatRepository.subscribeList(channelId, result => {
            setMessages(result?.list ?? []);
        });

        // Kick a network fetch so the cache (and thus the subscription) is populated.
        void chatRepository.fetchChat({ channelId, limit: 50 }, { cachePolicy: 'cache-first' });

        return () => unsubscribe();
    }, [channelId, chatRepository]);

    const sortedMessages = useMemo(() => (messages ? sortByChatNo(messages) : []), [messages]);

    return {
        messages: sortedMessages,
        isLoading: messages === null,
    };
};
