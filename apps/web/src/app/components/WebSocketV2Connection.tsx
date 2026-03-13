import { useHandleAppMessage } from '@chatic/app-messages';
import { useWebSocketV2 } from '@chatic/socket';
import { cloudCore, coreStorage, useWebCoreStore } from '@chatic/web-core';

import { useListenMessage } from '../features/chats/hooks/useListenMessage';
import { useMyChannels } from '../features/home/hooks/useMyChannels';
import { useDynamicDeviceId } from '../shared/hooks/useDynamicDeviceId';
import { useCloudTokenRefresh } from '../shared/hooks/useCloudTokenRefresh';
import { useCloudSession } from '../shared/hooks/useCloudSession';

export const WebSocketV2Connection = () => {
    const { deviceId } = useDynamicDeviceId();
    const { isPending } = useCloudSession();

    const { isGuest } = useWebCoreStore();
    const wss = cloudCore.getWss();
    const endpoint = isGuest ? import.meta.env.VITE_WS_ENDPOINT : wss;

    useHandleAppMessage('OnSetWsEndpoint', ({ data }) => {
        coreStorage.set('chatic-ws-endpoint', data.wss);
    });

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
