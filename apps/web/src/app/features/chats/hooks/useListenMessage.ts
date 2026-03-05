import { useEffect } from 'react';

import { useWebSocketV2 } from '@chatic/socket';
import { useSimpleWebCore } from '@chatic/web-core';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { ChatModel } from '@lemoncloud/chatic-socials-api/dist/modules/chats/model';

import { useChatMessages } from './useChatMessages';
import { useMyChannels } from '../../home/hooks/useMyChannels';

export const useListenMessage = () => {
    const { lastMessage } = useWebSocketV2();
    const { profile } = useSimpleWebCore();
    const { addMessage } = useChatMessages(profile?.id ?? null, null);
    const { setChannels } = useMyChannels();

    useEffect(() => {
        const envelope = lastMessage as WSSEnvelope<ChatModel & { sourceType?: string; nick?: string }>;
        if (envelope?.type !== 'model') return;

        const channelId = envelope?.payload?.channelId ?? (envelope.meta as { channel?: string })?.channel;
        if (!channelId) return;

        // 누군가 나간 경우
        if (envelope.action === 'delete' && envelope.payload?.sourceType === 'join') {
            const nick = (envelope.payload as unknown as { nick?: string })?.nick ?? '알 수 없음';
            const timestamp = new Date();
            addMessage(
                {
                    id: envelope.mid ?? String(timestamp.getTime()),
                    content: `${nick}님이 나갔습니다.`,
                    timestamp,
                    ownerId: '',
                    isRead: true,
                    isSystem: true,
                },
                channelId
            );
            return;
        }

        if (envelope.action !== 'create') return;

        // 누군가 입장한 경우 - joined < 1이면 최초 초대 이벤트이므로 무시
        if (envelope.payload?.sourceType === 'join') {
            const joined = (envelope.payload as unknown as { joined?: number })?.joined ?? 0;
            if (joined < 1) return;
            const nick = (envelope.payload as unknown as { nick?: string })?.nick ?? '알 수 없음';
            const timestamp = new Date();
            addMessage(
                {
                    id: envelope.mid ?? String(timestamp.getTime()),
                    content: `${nick}님이 들어왔습니다.`,
                    timestamp,
                    ownerId: '',
                    isRead: true,
                    isSystem: true,
                },
                channelId
            );
            return;
        }

        const id = envelope.payload?.id || '0';
        const content = envelope.payload?.content || 'unknown';
        const timestamp = envelope.payload?.createdAt ? new Date(envelope.payload.createdAt) : new Date();
        const ownerId = envelope.payload?.ownerId || '';
        const ownerName = envelope.payload?.owner$?.name || '알 수 없음';
        const chatNo = envelope.payload?.chatNo;
        const isCurrentChannel = window.location.pathname.includes(channelId);

        setChannels(prev =>
            prev.map(ch =>
                ch.id === channelId
                    ? { ...ch, lastChat$: { ...envelope.payload, id, content, createdAt: envelope.payload?.createdAt } }
                    : ch
            )
        );

        addMessage({ id, content, timestamp, ownerId, ownerName, chatNo, isRead: isCurrentChannel }, channelId);
    }, [lastMessage, addMessage]);
};
