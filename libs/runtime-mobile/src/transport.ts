import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';

import type { NetInfoState } from '@react-native-community/netinfo';
import type { RuntimePorts } from '@chatic/runtime-core';

type TransportPorts = RuntimePorts['transport'];

export type NetInfoSource = Pick<typeof NetInfo, 'addEventListener'>;

export const nativeOnlineSignal = (netInfo: NetInfoSource): TransportPorts['online'] => {
    let online = true;
    const listeners = new Set<() => void>();

    netInfo.addEventListener((state: NetInfoState) => {
        const next = state.isConnected !== false;
        if (next === online) return;
        online = next;
        [...listeners].forEach(listener => listener());
    });

    return {
        read: () => online,
        subscribe: listener => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
};

let processSignal: TransportPorts['online'] | null = null;

export const processOnlineSignal = (): TransportPorts['online'] => (processSignal ??= nativeOnlineSignal(NetInfo));

export type NativeWebSocketConstructor = new (
    url: string,
    protocols?: string | string[],
    options?: { headers: Record<string, string> }
) => ReturnType<TransportPorts['createSocket']>;

export const nativeSocketFactory =
    (userAgent: string, Socket?: NativeWebSocketConstructor): TransportPorts['createSocket'] =>
    ({ url, protocols }) => {
        const Constructor: NativeWebSocketConstructor = Socket ?? WebSocket;
        return new Constructor(url, protocols, { headers: { 'User-Agent': userAgent } });
    };

export interface NativeDeviceOptions {
    userAgent: string;
}

export const nativeTransportPorts = (options: NativeDeviceOptions): TransportPorts => ({
    online: processOnlineSignal(),
    device: () => ({ appPlatform: Platform.OS, userAgent: options.userAgent }),
    createSocket: nativeSocketFactory(options.userAgent),
});
