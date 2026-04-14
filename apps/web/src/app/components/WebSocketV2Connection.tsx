import { useEffect } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { useLoaderStore } from '@chatic/shared';
import { cloudCore, hasCachedInitData, useUserContext } from '@chatic/web-core';

import { useListenMessage } from '../features/chats/hooks/useListenMessage';
import { useMyChannels } from '../features/home/hooks/useMyChannels';
import { useDynamicDeviceId } from '../shared/hooks/useDynamicDeviceId';
import { useCloudTokenRefresh } from '../shared/hooks/useCloudTokenRefresh';
import { useCloudSession } from '../shared/hooks/useCloudSession';

export const WebSocketV2Connection = () => {
    const { deviceId } = useDynamicDeviceId();
    const { isPending } = useCloudSession();
    const { currentWSS, endpoints } = useUserContext();

    // 현재 WSS 타입에 따라 endpoint 결정
    const endpoint = currentWSS === 'cloud' ? endpoints.cloudWSS : endpoints.relayWSS;

    // cloudId 설정 (cloud WSS 사용 시만 실제 cloudId, 아니면 'default')
    const selectedCloudId = currentWSS === 'cloud' ? cloudCore.getSelectedCloudId() || 'default' : 'default';

    const connectionStatus = useWebSocketV2Store(s => s.connectionStatus);
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const setGlobalLoading = useLoaderStore(s => s.setIsLoading);

    useEffect(() => {
        useWebSocketV2Store.getState().setCloudId(selectedCloudId);
    }, [selectedCloudId]);

    const isSocketConnecting = connectionStatus === 'connecting' || (connectionStatus === 'connected' && !isVerified);

    // Skip global loader when cached data is available — user sees cached content while socket syncs
    useEffect(() => {
        if (isSocketConnecting && !hasCachedInitData()) {
            setGlobalLoading(true);
        } else {
            setGlobalLoading(false);
        }
        return () => {
            setGlobalLoading(false);
        };
    }, [isSocketConnecting, setGlobalLoading]);

    useWebSocketV2({
        endpoint,
        connectParams: { deviceId },
        enabled: !!deviceId && !isPending && !!endpoint,
        wssType: currentWSS,
    });

    useListenMessage();
    useMyChannels();
    useCloudTokenRefresh();

    return null;
};
