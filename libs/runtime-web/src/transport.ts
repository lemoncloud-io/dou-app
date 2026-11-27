import type { RuntimePorts } from '@chatic/runtime-core';

type TransportPorts = RuntimePorts['transport'];

const online: TransportPorts['online'] = {
    read: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    subscribe: listener => {
        if (typeof window === 'undefined') return () => undefined;
        window.addEventListener('online', listener);
        window.addEventListener('offline', listener);
        return () => {
            window.removeEventListener('online', listener);
            window.removeEventListener('offline', listener);
        };
    },
};

export interface WebTransportOptions {
    appPlatform?: () => string | undefined;
}

const noAppPlatform = (): string | undefined => undefined;

const deviceReader =
    (appPlatform: () => string | undefined): TransportPorts['device'] =>
    () => {
        if (typeof window === 'undefined') return {};
        return {
            appPlatform: appPlatform(),
            userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
        };
    };

const createSocket: TransportPorts['createSocket'] = ({ url, protocols }) => new WebSocket(url, protocols);

export const webTransportPorts = ({ appPlatform = noAppPlatform }: WebTransportOptions = {}): TransportPorts => ({
    online,
    device: deviceReader(appPlatform),
    createSocket,
});
