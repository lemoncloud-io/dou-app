import { useState } from 'react';

import { useDynamicDeviceId } from '../shared/hooks/useDynamicDeviceId';
import { useWebSocketV2 } from '@chatic/socket';
import { useHandleAppMessage } from '@chatic/app-messages';
import { useListenMessage } from '../features/chats/hooks/useListenMessage';
import { useMyChannels } from '../features/home/hooks/useMyChannels';
import { useSocketAuth } from '../shared/hooks/useSocketAuth';
import { simpleWebCore, WS_ENDPOINT_KEY } from '@chatic/web-core';

const getWsEndpoint = () => sessionStorage.getItem(WS_ENDPOINT_KEY) || import.meta.env.VITE_WS_ENDPOINT;

export const WebSocketV2Connection = () => {
    const { deviceId } = useDynamicDeviceId();
    const [wsEndpoint, setWsEndpoint] = useState(getWsEndpoint);

    useHandleAppMessage('OnSetWsEndpoint', ({ data }) => {
        simpleWebCore.saveWsEndpoint(data.wss);
        setWsEndpoint(data.wss);
    });

    useWebSocketV2({
        endpoint: wsEndpoint,
        connectParams: { deviceId },
        enabled: !!deviceId,
    });

    useListenMessage();
    useSocketAuth();
    useMyChannels();

    return null;
};
