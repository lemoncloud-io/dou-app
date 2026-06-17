import { useEffect } from 'react';

import { logger } from '@chatic/bridges';
import { cloudCore, useUserContext, useWebCoreStore, webCore } from '@chatic/web-core';

import { useRepositories } from '../data';
import { useDynamicDeviceId } from '../hooks/useDynamicDeviceId';
import { useCloudTokenRefresh } from '../hooks/useCloudTokenRefresh';
import { useCloudSession } from '../hooks/useCloudSession';
import { getSocketManager, useWebSocketV2Store } from '../socket';

export const WebSocketV2Connection = () => {
    const { deviceId } = useDynamicDeviceId();
    const { isPending } = useCloudSession();
    const { currentWSS, endpoints } = useUserContext();
    const socketManager = getSocketManager();
    const { setSelectedCloudId, setSelectedPlaceId } = useWebCoreStore();
    const repositories = useRepositories();
    const deviceRepository = (
        repositories as typeof repositories & {
            device: { saveDevice: (input: { id: string; platform: string }) => Promise<unknown> };
        }
    ).device;
    const authRepository = repositories.auth;

    const endpoint = currentWSS === 'cloud' ? endpoints.cloudWSS : endpoints.relayWSS;
    const selectedCloudId = currentWSS === 'cloud' ? cloudCore.getSelectedCloudId() || 'default' : 'default';

    useEffect(() => {
        setSelectedCloudId(selectedCloudId);
        useWebSocketV2Store.getState().setCloudId(selectedCloudId);
    }, [selectedCloudId, setSelectedCloudId]);

    const persistedPlaceId = cloudCore.getSelectedPlaceId();

    useEffect(() => {
        if (persistedPlaceId) {
            setSelectedPlaceId(persistedPlaceId);
            if (!useWebSocketV2Store.getState().selectedPlaceId) {
                useWebSocketV2Store.getState().setSelectedPlaceId(persistedPlaceId);
            }
        }
    }, [persistedPlaceId, setSelectedPlaceId]);

    useEffect(() => {
        if (!deviceId || isPending || !endpoint) return;

        socketManager.setActiveCloudId(selectedCloudId);
        const client = socketManager.ensure(selectedCloudId, {
            url: endpoint,
            deviceId,
            wssType: currentWSS,
        });

        const store = useWebSocketV2Store.getState();
        store.setWssType(currentWSS);
        store.setDeviceId(deviceId);

        const bootstrap = async () => {
            try {
                if (client.state === 'idle' || client.state === 'closed') {
                    await client.connect();
                }

                await deviceRepository.saveDevice({
                    id: deviceId,
                    platform: 'web',
                });
                useWebSocketV2Store.getState().setIsDeviceRegistered(true);

                const token =
                    currentWSS === 'cloud'
                        ? (cloudCore.getIdentityToken() ??
                          (await webCore.getTokenSignature()).originToken?.identityToken)
                        : (await webCore.getTokenSignature()).originToken?.identityToken;

                if (token) {
                    await authRepository.updateSocketAuth({ token });
                    useWebSocketV2Store.getState().setIsVerified(true);
                }
            } catch (error) {
                logger.error('SOCKET', '[WebSocketV2Connection] Failed to bootstrap data socket client', {
                    error,
                    data: { cloudId: selectedCloudId, wssType: currentWSS },
                });
                useWebSocketV2Store.getState().setIsVerified(false);
            }
        };

        void bootstrap();
    }, [socketManager, selectedCloudId, deviceId, isPending, endpoint, currentWSS, deviceRepository, authRepository]);

    useCloudTokenRefresh();

    return null;
};
