import type { EventMessage, RequestMessage, ResponseMessage } from '../../common';
import type { BridgeAdapter } from './types';
import type { IAppBridgeHost } from '../../app';
import { JsonProtocol } from '../../common';

export class InMemoryAdapter implements BridgeAdapter {
    private handler?: (message: ResponseMessage | EventMessage) => void;
    private appHost?: IAppBridgeHost;

    public setAppHost(appHost: IAppBridgeHost): void {
        this.appHost = appHost;
    }

    public postMessage(message: RequestMessage): void {
        if (!this.appHost) {
            console.warn('[InMemoryAdapter] no AppBridgeHost is connected');
            return;
        }

        const encoded = JsonProtocol.encode(message);
        setTimeout(() => {
            if (this.appHost) {
                void this.appHost.handleMessage(encoded as string);
            }
        }, 0);
    }

    public onMessage(handler: (message: ResponseMessage | EventMessage) => void): () => void {
        this.handler = handler;
        return () => {
            this.handler = undefined;
        };
    }

    public receiveFromApp(message: ResponseMessage | EventMessage): void {
        if (this.handler) {
            this.handler(message);
        }
    }
}
