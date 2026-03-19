import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { useLoaderStore } from '@chatic/shared';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';

import { useListenMessage } from '../features/chats/hooks/useListenMessage';
import { useMyChannels } from '../features/home/hooks/useMyChannels';
import { useDynamicDeviceId } from '../shared/hooks/useDynamicDeviceId';
import { useCloudTokenRefresh } from '../shared/hooks/useCloudTokenRefresh';
import { useCloudSession } from '../shared/hooks/useCloudSession';

export const WebSocketV2Connection = () => {
    const { deviceId } = useDynamicDeviceId();
    const { isPending } = useCloudSession();
    const { t } = useTranslation();

    const { isGuest, isInvited } = useWebCoreStore();
    const wss = cloudCore.getWss();
    const isCloudUser = !isGuest || isInvited;
    const endpoint = isCloudUser ? wss : import.meta.env.VITE_WS_ENDPOINT;

    const connectionStatus = useWebSocketV2Store(s => s.connectionStatus);
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const setGlobalLoading = useLoaderStore(s => s.setIsLoading);

    const isSocketConnecting = connectionStatus === 'connecting' || (connectionStatus === 'connected' && !isVerified);

    useEffect(() => {
        if (isSocketConnecting) {
            setGlobalLoading(true, t('socket.connecting'));
        } else {
            setGlobalLoading(false);
        }
    }, [isSocketConnecting]);

    useWebSocketV2({
        endpoint,
        connectParams: { deviceId },
        enabled: !!deviceId && !isPending && !!endpoint,
    });

    useListenMessage();
    useMyChannels();
    useCloudTokenRefresh();

    return null;
};
