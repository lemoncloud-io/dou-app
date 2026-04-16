import { useEffect } from 'react';
import { useWebSocketV2Store } from '@chatic/socket';
import { cloudCore, useDynamicProfile } from '@chatic/web-core';
import {
    useChannelRepository,
    useChatRepository,
    useJoinRepository,
    usePlaceRepository,
    useUserRepository,
} from '../repository';

import {
    authHandler,
    channelHandler,
    chatHandler,
    modelHandler,
    syncHandler,
    systemHandler,
    userHandler,
} from '../handlers';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

export const useGlobalSocketRouter = () => {
    const cloudId = useWebSocketV2Store(s => s.cloudId) ?? 'default';
    const chatRepo = useChatRepository(cloudId);
    const channelRepo = useChannelRepository(cloudId);
    const joinRepo = useJoinRepository(cloudId);
    const userRepo = useUserRepository(cloudId);
    const placeRepo = usePlaceRepository(cloudId);

    /**
     * TODO
     * 서버에서 `$: { sid: ... }` 와 같이 응답 페이로드로 값을 내려주는 것이 확인된다면,
     * 응답페이로드의 값을 활용하여 sid 주입하기; 현재 sid 주입 방식은 정확한 sid 전달 보장안됨
     */
    const selectedPlaceId = cloudCore.getSelectedPlaceId();
    const profile = useDynamicProfile();
    const myUserId = profile?.uid ?? '';

    useEffect(() => {
        const handleSyncMessage = async (rawMessage: any) => {
            const envelope = rawMessage as WSSEnvelope;
            if (!envelope || !envelope.type) return;

            const cloudId = useWebSocketV2Store.getState().cloudId;
            if (!cloudId) return;

            try {
                switch (envelope.type) {
                    case 'model':
                        await modelHandler(envelope, cloudId, chatRepo, channelRepo, joinRepo);
                        break;
                    case 'chat':
                        await chatHandler(
                            envelope,
                            cloudId,
                            selectedPlaceId,
                            myUserId,
                            chatRepo,
                            channelRepo,
                            joinRepo,
                            userRepo
                        );
                        break;
                    case 'user':
                        await userHandler(envelope, cloudId, userRepo, placeRepo);
                        break;
                    case 'auth':
                        await authHandler(envelope, cloudId);
                        break;
                    case 'channel':
                        await channelHandler(envelope, cloudId);
                        break;
                    case 'sync':
                        await syncHandler(envelope, cloudId);
                        break;
                    case 'system':
                        await systemHandler(envelope, cloudId);
                        break;
                    case 'model': {
                        // 서버가 model:create 로 chat 을 내려주는 경로 → chat:send 로 재라우팅
                        // (channel.lastChat$ 갱신 + chat 저장 + unreadCount 반영)
                        const payloadType = (envelope.payload as { type?: string } | undefined)?.type;
                        if (envelope.action === 'create' && payloadType === 'chat') {
                            await chatHandler(
                                { ...envelope, type: 'chat', action: 'send' } as WSSEnvelope,
                                cloudId,
                                selectedPlaceId,
                                myUserId,
                                chatRepo,
                                channelRepo,
                                joinRepo,
                                userRepo
                            );
                        } else {
                            console.warn(
                                `[Socket Router] Unhandled model action: ${envelope.action} (payload.type=${payloadType})`
                            );
                        }
                        break;
                    }
                    default:
                        console.warn(`[Socket Router] Unhandled domain: ${envelope.type}`);
                }
            } catch (error) {
                console.error(`[Socket Router] Error in domain ${envelope.type}:`, error);
            }
        };

        const unsubscribe = useWebSocketV2Store.subscribe(state => state.lastMessage, handleSyncMessage);
        return () => unsubscribe();
    }, [chatRepo, channelRepo, joinRepo, userRepo, placeRepo, selectedPlaceId, myUserId]);
};
