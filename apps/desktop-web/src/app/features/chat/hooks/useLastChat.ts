import { useEffect, useRef, useState } from 'react';

import type { DomainChat } from '@chatic/runtime-react';

import { runtime } from '@chatic/runtime-react';

import { pickPreviewChat } from '../utils';

const PREVIEW_LOOKBACK = 20;

export const useLastChat = (channelId: string, latestChatNo?: number): DomainChat | undefined => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const [lastChat, setLastChat] = useState<DomainChat | undefined>(undefined);
    const cachedNewestRef = useRef(0);

    runtime.sync.useChatSync(channelId || undefined);

    useEffect(() => {
        if (!channelId) {
            setLastChat(undefined);
            cachedNewestRef.current = 0;
            return;
        }
        return chatRepository.observeList({ channelId, limit: PREVIEW_LOOKBACK }, result => {
            const list = result?.list ?? [];
            cachedNewestRef.current = list.reduce((newest, chat) => Math.max(newest, chat.chatNo ?? 0), 0);
            setLastChat(pickPreviewChat(list));
        });
    }, [chatRepository, channelId]);

    const freshnessRef = useRef<{ id: string; no: number }>({ id: '', no: 0 });
    useEffect(() => {
        if (!channelId || !latestChatNo || latestChatNo <= cachedNewestRef.current) return;
        if (freshnessRef.current.id === channelId && freshnessRef.current.no >= latestChatNo) return;
        freshnessRef.current = { id: channelId, no: latestChatNo };
        void chatRepository.refreshList({ channelId, limit: PREVIEW_LOOKBACK }).catch(() => undefined);
    }, [chatRepository, channelId, latestChatNo]);

    return lastChat;
};
