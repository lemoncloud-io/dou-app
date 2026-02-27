import { useEffect } from 'react';

import { useWebSocketV2 } from '@chatic/socket';
import { useSimpleWebCore } from '@chatic/web-core';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { ChatModel } from '@lemoncloud/chatic-socials-api/dist/modules/chats/model';

export const useReadMessage = (channelId: string | undefined, messages: { chatNo?: number }[] = []) => {
    const { emit, lastMessage } = useWebSocketV2();
    const { profile } = useSimpleWebCore();

    // 방 입장 시 마지막 chatNo로 read 전송
    useEffect(() => {
        if (!channelId || !messages.length) return;
        const lastChatNo = messages[messages.length - 1]?.chatNo;
        if (!lastChatNo) return;
        emit({ type: 'chat', action: 'read', payload: { channelId, chatNo: lastChatNo } });
    }, [channelId]);

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
