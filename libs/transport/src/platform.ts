import type { SocketFactoryContext, SocketLike } from '@lemoncloud/chatic-sockets-lib';

export interface OnlineSignal {
    read(): boolean;
    subscribe(listener: () => void): () => void;
}

export interface DeviceEnvironment {
    appPlatform?: string;
    userAgent?: string;
}

export interface TransportPlatformPorts {
    online: OnlineSignal;
    device(): DeviceEnvironment;
    createSocket(context: SocketFactoryContext): SocketLike;
}

export interface ITransportPlatform {
    configure(ports: TransportPlatformPorts): void;
    ports(): TransportPlatformPorts;
}

class TransportPlatform implements ITransportPlatform {
    private configured: TransportPlatformPorts | null = null;

    configure(ports: TransportPlatformPorts): void {
        this.configured = ports;
    }

    ports(): TransportPlatformPorts {
        if (!this.configured) {
            throw new Error(
                '[transport] the platform ports were used before any were configured — the entry point has to ' +
                    'pass `transport` to createRuntime() before a socket is opened or the link is read.'
            );
        }
        return this.configured;
    }
}

export const transportPlatform: ITransportPlatform = new TransportPlatform();
