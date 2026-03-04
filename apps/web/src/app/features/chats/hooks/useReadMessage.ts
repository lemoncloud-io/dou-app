import { useEffect, useRef } from 'react';

import { useWebSocketV2 } from '@chatic/socket';
import { useSimpleWebCore } from '@chatic/web-core';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { ChatModel } from '@lemoncloud/chatic-socials-api/dist/modules/chats/model';
import { IndexedDBStorageAdapter } from '../storages/IndexedDBStorageAdapter';

export const useReadMessage = (
    channelId: string | undefined,
    messages: { chatNo?: number; isRead?: boolean; readCount?: number }[] = [],
    applyReadEvent?: (chatNo: number, readCount: number) => void
) => {
    const { emit, lastMessage } = useWebSocketV2();
    const { profile } = useSimpleWebCore();
    const hasMarkedRef = useRef(false);

    // messages 로드 완료 후 한 번만: unread 있으면 read emit + DB 업데이트
    useEffect(() => {
        if (hasMarkedRef.current || !channelId || !messages.length || !profile?.id) return;
        const hasUnread = messages.some(m => m.isRead === false);
        if (!hasUnread) return;

        hasMarkedRef.current = true;
        const lastChatNo = messages[messages.length - 1]?.chatNo;
        if (lastChatNo) {
            emit({ type: 'chat', action: 'read', payload: { channelId, chatNo: lastChatNo } });
            applyReadEvent?.(lastChatNo, 1);
        }
        IndexedDBStorageAdapter.markAllRead(profile.id, channelId).catch(console.error);
    }, [messages.length]);

    // action:read 수신 시 해당 chatNo 이하 readCount++ + isRead: true
    useEffect(() => {
        const envelope = lastMessage as any;
        if (!envelope || !applyReadEvent) return;

        const isJoinUpdate =
            envelope.type === 'model' && envelope.action === 'update' && envelope.payload?.sourceType === 'join';
        const isChatRead = envelope.type === 'chat' && envelope.action === 'read';
        if (!isJoinUpdate && !isChatRead) return;

        const channelIdFromPayload = envelope.payload?.channelId ?? envelope.meta?.channel;
        if (channelIdFromPayload !== channelId) return;

        const chatNo = envelope.payload?.chatNo;
        if (!chatNo) return;

        applyReadEvent(chatNo, 1);
    }, [lastMessage, channelId, applyReadEvent]);

    // 새 메시지 수신 시 내 것 아니면 read 전송
    useEffect(() => {
        const envelope = lastMessage as WSSEnvelope<ChatModel> | null;
        if (envelope?.type !== 'model' || envelope.action !== 'create') return;
        if (envelope.payload?.channelId !== channelId) return;
        if (envelope.payload?.ownerId === profile?.id) return;

        const chatNo = envelope.payload?.chatNo;
        if (!chatNo) return;

        emit({ type: 'chat', action: 'read', payload: { channelId, chatNo } });
    }, [lastMessage, channelId, profile?.id]);
};
