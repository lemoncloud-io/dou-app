import { useWebSocketV2 } from '@chatic/socket';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';

import { useListenMessage } from '../features/chats/hooks/useListenMessage';
import { useMyChannels } from '../features/home/hooks/useMyChannels';
import { useDynamicDeviceId } from '../shared/hooks/useDynamicDeviceId';
import { useCloudTokenRefresh } from '../shared/hooks/useCloudTokenRefresh';
import { useCloudSession } from '../shared/hooks/useCloudSession';

export const WebSocketV2Connection = () => {
    const { deviceId } = useDynamicDeviceId();
    const { isPending } = useCloudSession();

    const { isGuest, isInvited } = useWebCoreStore();
    const wss = cloudCore.getWss();
    const isCloudUser = !isGuest || isInvited;
    const endpoint = isCloudUser ? wss : import.meta.env.VITE_WS_ENDPOINT;

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
