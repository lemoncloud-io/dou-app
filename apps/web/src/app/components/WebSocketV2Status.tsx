import { useEffect, useState } from 'react';
import { useDynamicDeviceId } from '../shared/hooks/useDynamicDeviceId';
import { getSocketManager } from '../shared/socket';
import type { ClientSocketState } from '@lemoncloud/chatic-sockets-lib';

export const WebSocketV2Status = () => {
    const { deviceId } = useDynamicDeviceId();
    const [connectionStatus, setConnectionStatus] = useState<ClientSocketState>('idle');
    const isConnected = connectionStatus === 'connected';

    useEffect(() => {
        return getSocketManager().subscribeActiveClientState(state => {
            setConnectionStatus(state);
        });
    }, []);

    return (
        <div className="fixed bottom-4 right-4 rounded-lg border bg-background p-3 text-xs shadow-lg">
            <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-medium">WebSocket V22</span>
            </div>
            <div className="mt-1 space-y-0.5 text-muted-foreground">
                <div>Status: {connectionStatus}</div>
                {deviceId && <div>Device: {deviceId.slice(0, 12)}...</div>}
            </div>
        </div>
    );
};
