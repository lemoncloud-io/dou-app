import { useEffect } from 'react';

import { logger } from '@chatic/bridges';
import { cloudCore, useUserContext, useWebCoreStore, webCore } from '@chatic/web-core';

import { useRepositories } from '../data';
import { useCloudSession, useCloudTokenRefresh, useDynamicDeviceId } from '../hooks';
import { getSocketManager } from '../socket';

export const WebSocketV2Connection = () => {
    const { deviceId } = useDynamicDeviceId();
    const { isPending } = useCloudSession();
    const { currentWSS, endpoints } = useUserContext();
    const socketManager = getSocketManager();
    const { setSelectedCloudId, setSelectedPlaceId } = useWebCoreStore();
    const { device: deviceRepository, auth: authRepository } = useRepositories();

    // 현재 WSS 타입에 따라 endpoint 결정
    const endpoint = currentWSS === 'cloud' ? endpoints.cloudWSS : endpoints.relayWSS;

    // cloudId 설정 (cloud WSS 사용 시만 실제 cloudId, 아니면 'default')
    const selectedCloudId = currentWSS === 'cloud' ? cloudCore.getSelectedCloudId() || 'default' : 'default';

    useEffect(() => {
        setSelectedCloudId(selectedCloudId);
    }, [selectedCloudId]);

    // selectedPlaceId 복원: cloudCore(영속)에 저장된 값을 Zustand store에 즉시 동기화
    // — 캐시 기반 채널 목록을 바로 표시하기 위함 (서버 fetch는 isVerified 후에만 실행)
    const persistedPlaceId = cloudCore.getSelectedPlaceId();

    useEffect(() => {
        if (persistedPlaceId) {
            setSelectedPlaceId(persistedPlaceId);
        }
    }, [persistedPlaceId]);

    useEffect(() => {
        if (!deviceId || isPending || !endpoint) return;

        socketManager.setActiveCloudId(selectedCloudId);
        const client = socketManager.ensure(selectedCloudId, {
            url: endpoint,
            deviceId,
            wssType: currentWSS,
        });

        const bootstrap = async () => {
            try {
                if (client.state === 'idle' || client.state === 'closed') {
                    await client.connect();
                }

                await deviceRepository.saveDevice({
                    id: deviceId,
                    platform: 'web',
                });

                const token =
                    currentWSS === 'cloud'
                        ? (cloudCore.getIdentityToken() ??
                          (await webCore.getTokenSignature()).originToken?.identityToken)
                        : (await webCore.getTokenSignature()).originToken?.identityToken;

                if (token) {
                    await authRepository.updateSocketAuth({ token });
                }
            } catch (error) {
                logger.error('SOCKET', '[WebSocketV2Connection] Failed to bootstrap data socket client', {
                    error,
                    data: { cloudId: selectedCloudId, wssType: currentWSS },
                });
            }
        };

        void bootstrap();
    }, [socketManager, selectedCloudId, deviceId, isPending, endpoint, currentWSS, deviceRepository, authRepository]);

    useCloudTokenRefresh();

    return null;
};
