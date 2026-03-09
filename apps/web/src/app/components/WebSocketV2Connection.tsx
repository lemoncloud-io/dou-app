import { useEffect, useState } from 'react';

import { useDynamicDeviceId } from '../shared/hooks/useDynamicDeviceId';
import { useWebSocketV2 } from '@chatic/socket';
import { useHandleAppMessage } from '@chatic/app-messages';
import { useListenMessage } from '../features/chats/hooks/useListenMessage';
import { useMyChannels } from '../features/home/hooks/useMyChannels';
import { useSocketAuth } from '../shared/hooks/useSocketAuth';

const getWsEndpoint = () => localStorage.getItem('CHATIC_WS_ENDPOINT') || import.meta.env.VITE_WS_ENDPOINT;

export const WebSocketV2Connection = () => {
    const { deviceId } = useDynamicDeviceId();
    const [wsEndpoint, setWsEndpoint] = useState(getWsEndpoint);

    useEffect(() => {
        console.log('[WebSocketV2Connection] mounted, endpoint:', wsEndpoint);
    }, []);

    useHandleAppMessage('OnSetWsEndpoint', ({ data }) => {
        localStorage.setItem('CHATIC_WS_ENDPOINT', data.wss);
        setWsEndpoint(data.wss);
        console.log('[WebSocketV2Connection] endpoint updated:', data.wss);
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
