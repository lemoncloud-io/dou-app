import type { EventMessage, RequestMessage, ResponseMessage } from '../../common';
import type { BridgeAdapter } from './types';
import type { IAppBridgeHost } from '../../app';
import { JsonProtocol } from '../../common';

/**
 * A test/simulation adapter implementation that enables loopback communication between
 * WebBridgeClient and AppBridgeHost entirely in memory, without a webview or a real native environment.
 */
export class InMemoryAdapter implements BridgeAdapter {
    /** The listener callback that handles incoming messages */
    private handler?: (message: ResponseMessage | EventMessage) => void;
    /** The virtual native app host instance that receives and handles loopback messages */
    private appHost?: IAppBridgeHost;

    /**
     * Injects (sets) the AppBridgeHost instance that will be the loopback target.
     */
    public setAppHost(appHost: IAppBridgeHost): void {
        this.appHost = appHost;
    }

    /**
     * [Web -> App] JSON-serializes the request message sent from the web, then feeds it into
     * AppBridgeHost via a setTimeout scheduler to simulate async behavior and callback ordering.
     */
    public postMessage(message: RequestMessage): void {
        if (!this.appHost) {
            console.warn('[InMemoryAdapter] no AppBridgeHost is connected');
            return;
        }

        const encoded = JsonProtocol.encode(message);
        // Delivered via setTimeout to simulate async behavior and guarantee execution order.
        setTimeout(() => {
            if (this.appHost) {
                void this.appHost.handleMessage(encoded as string);
            }
        }, 0);
    }

    /**
     * [App -> Web] Registers the callback (handler) that receives response or event messages
     * delivered from the native app (AppBridgeHost), etc.
     */
    public onMessage(handler: (message: ResponseMessage | EventMessage) => void): () => void {
        this.handler = handler;
        return () => {
            this.handler = undefined;
        };
    }

    /**
     * [App -> Web External Trigger] A trigger method called from AppBridgeHost's sendToWeb, etc.,
     * to force-feed a message toward the web client (WebBridgeClient).
     */
    public receiveFromApp(message: ResponseMessage | EventMessage): void {
        if (this.handler) {
            this.handler(message);
        }
    }
}
