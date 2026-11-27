import type { TransportPort } from '@chatic/ports';

type SocketLike = ReturnType<TransportPort['createSocket']>;

export type NodeWebSocketConstructor = new (
    url: string,
    init: { protocols?: string | string[]; headers: Record<string, string> }
) => SocketLike;

export interface NodeTransportOptions {
    userAgent: string;
    WebSocket?: NodeWebSocketConstructor;
}

export const NODE_APP_PLATFORM = 'node';

export const alwaysOnline: TransportPort['online'] = {
    read: () => true,
    subscribe: () => () => undefined,
};

const globalWebSocket = (): NodeWebSocketConstructor => {
    const Socket = (globalThis as unknown as { WebSocket?: NodeWebSocketConstructor }).WebSocket;
    if (!Socket) {
        throw new Error('[runtime-node] this Node has no global WebSocket — run Node 22 or later, or pass `WebSocket`');
    }
    return Socket;
};

export const nodeSocketFactory = (
    userAgent: string,
    Socket?: NodeWebSocketConstructor
): TransportPort['createSocket'] => {
    const Constructor = Socket ?? globalWebSocket();
    return ({ url, protocols }) => new Constructor(url, { protocols, headers: { 'User-Agent': userAgent } });
};

export const nodeTransportPorts = ({ userAgent, WebSocket }: NodeTransportOptions): TransportPort => ({
    online: alwaysOnline,
    device: () => ({ appPlatform: NODE_APP_PLATFORM, userAgent }),
    createSocket: nodeSocketFactory(userAgent, WebSocket),
});
