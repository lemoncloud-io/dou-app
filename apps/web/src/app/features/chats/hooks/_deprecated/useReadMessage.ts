import { useEffect } from 'react';

import { useWebSocketV2 } from '@chatic/socket';
import { useDynamicProfile } from '@chatic/web-core';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { ChatModel } from '@lemoncloud/chatic-socials-api/dist/modules/chats/model';
import { useMyChannel } from './useMyChannel';
import { useDynamicStorage } from './useDynamicStorage';

/**
 * @deprecated deprecated by raine; 신규 훅으로 대체
 */
export const useReadMessage = (
    channelId: string | undefined,
    messages: { chatNo?: number }[] = [],
    applyReadEvent?: (chatNo: number, readerUserId: string) => void
) => {
    const { emit, lastMessage } = useWebSocketV2();
    const profile = useDynamicProfile();
    const { channel } = useMyChannel(channelId ?? null);
    const storage = useDynamicStorage();

    // 마운트 시: channel의 lastChat$.chatNo 기준으로 무조건 read emit
    useEffect(() => {
        if (!channelId || !profile?.uid) return;
        const chatNo = (channel?.lastChat$ as { chatNo?: number } | undefined)?.chatNo;
        if (!chatNo) return;
        emit({ type: 'chat', action: 'read', payload: { channelId, chatNo } });
        applyReadEvent?.(chatNo, profile.uid);
        storage.markAllRead(profile.uid, channelId).catch(console.error);
    }, [channelId]);

    // type:chat action:read 또는 type:model action:update sourceType:join 수신 시 applyReadEvent
    useEffect(() => {
        const envelope = lastMessage as WSSEnvelope<{
            channelId?: string;
            userId?: string;
            chatNo?: number;
            sourceType?: string;
        }> | null;
        if (!envelope || !applyReadEvent) return;

        const isChatRead = envelope.type === 'chat' && envelope.action === 'read';
        const isJoinUpdate =
            envelope.type === 'model' && envelope.action === 'update' && envelope.payload?.sourceType === 'join';
        if (!isChatRead && !isJoinUpdate) return;

        const incomingChannelId = envelope.payload?.channelId ?? (envelope.meta as { channel?: string })?.channel;
        if (incomingChannelId !== channelId) return;

        const chatNo = envelope.payload?.chatNo;
        const readerUserId = envelope.payload?.userId;
        if (!chatNo || !readerUserId) return;

        applyReadEvent(chatNo, readerUserId);
    }, [lastMessage, channelId, applyReadEvent]);

    // 새 메시지 수신 시 read emit
    useEffect(() => {
        const envelope = lastMessage as WSSEnvelope<ChatModel> | null;
        if (envelope?.type !== 'model' || envelope.action !== 'create') return;
        if (envelope.payload?.channelId !== channelId) return;

        const chatNo = envelope.payload?.chatNo;
        if (!chatNo || !profile?.uid) return;

        emit({ type: 'chat', action: 'read', payload: { channelId, chatNo } });
        applyReadEvent?.(chatNo, profile.uid);
    }, [lastMessage, channelId, profile?.id]);
};
