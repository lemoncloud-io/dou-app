import { useSessionDeviceId } from '@chatic/shared';
import { useWebSocketV2 } from '@chatic/socket';

const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT;

export const WebSocketV2Connection = () => {
    const { deviceId } = useSessionDeviceId('chatic-device-id');

    useWebSocketV2({
        endpoint: WS_ENDPOINT,
        connectParams: { deviceId },
        enabled: true,
    });

    return null;
};
