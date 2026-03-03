import { useSessionDeviceId } from '@chatic/shared';
import { useWebSocketV2 } from '@chatic/socket';
import { useListenMessage } from '../features/chats/hooks/useListenMessage';
import { useMyChannels } from '../features/home/hooks/useMyChannels';
import { useSocketAuth } from '../shared/hooks/useSocketAuth';

const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT;

export const WebSocketV2Connection = () => {
    const { deviceId } = useSessionDeviceId('chatic-device-id');

    useWebSocketV2({
        endpoint: WS_ENDPOINT,
        connectParams: { deviceId },
        enabled: !!deviceId,
    });

    useListenMessage();
    useSocketAuth();
    useMyChannels(); // 전역에서 채널 목록 초기화

    return null;
};
