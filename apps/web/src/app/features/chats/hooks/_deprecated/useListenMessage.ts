import { useEffect } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useWebSocketV2 } from '@chatic/socket';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { ChatModel } from '@lemoncloud/chatic-socials-api/dist/modules/chats/model';

import { useMyChannels } from '../../../home/hooks/useMyChannels';
import { useDynamicProfile } from '@chatic/web-core';
import { cloudsKeys } from '@chatic/users';
import { membershipKeys, subscriptionKeys } from '@chatic/subscriptions';
import { useChatMessages } from './useChatMessages';

/**
 * @deprecated deprecated by raine; 신규 훅으로 대체
 */
export const useListenMessage = () => {
    const { lastMessage } = useWebSocketV2();
    const profile = useDynamicProfile();
    const { addMessage } = useChatMessages(profile?.uid ?? null, null);
    const { setChannels } = useMyChannels();
    const queryClient = useQueryClient();

    useEffect(() => {
        const envelope = lastMessage as WSSEnvelope<ChatModel & { sourceType?: string; nick?: string }>;
        if (envelope?.type !== 'model') return;

        // cloud/membership 상태 변경 시 refetch
        if (envelope.action === 'update') {
            void queryClient.invalidateQueries({ queryKey: cloudsKeys.all });
            void queryClient.invalidateQueries({ queryKey: membershipKeys.all });
            void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
            return;
        }

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
            prev.map(ch => {
                if (ch.id !== channelId) return ch;
                const prevChatNo = (ch.lastChat$ as { chatNo?: number } | undefined)?.chatNo ?? 0;
                if (chatNo && prevChatNo > chatNo) return ch;
                return {
                    ...ch,
                    lastChat$: { ...envelope.payload, id, content, createdAt: envelope.payload?.createdAt },
                };
            })
        );

        const isMine = ownerId === profile?.uid;
        addMessage(
            { id, content, timestamp, ownerId, ownerName, chatNo, isRead: isCurrentChannel || isMine },
            channelId
        );
    }, [lastMessage, addMessage]);
};
