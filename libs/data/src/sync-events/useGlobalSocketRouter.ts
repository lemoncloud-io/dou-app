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
    const profile = useDynamicProfile();
    const profileUid = profile?.uid;
    const chatRepo = useChatRepository(cloudId, profileUid);
    const channelRepo = useChannelRepository(cloudId, profileUid);
    const joinRepo = useJoinRepository(cloudId, profileUid);
    const userRepo = useUserRepository(cloudId, profileUid);
    const placeRepo = usePlaceRepository(cloudId);

    /**
     * TODO
     * 서버에서 `$: { sid: ... }` 와 같이 응답 페이로드로 값을 내려주는 것이 확인된다면,
     * 응답페이로드의 값을 활용하여 sid 주입하기; 현재 sid 주입 방식은 정확한 sid 전달 보장안됨
     */
    const selectedPlaceId = cloudCore.getSelectedPlaceId();
    const myUserId = profileUid ?? '';

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
