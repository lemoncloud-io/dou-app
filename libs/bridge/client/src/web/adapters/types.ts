import type { EventMessage, RequestMessage, ResponseMessage } from '@chatic/bridge-host';

export interface InboundMessageMeta {
    length: number;
}

export interface BridgeAdapter {
    postMessage(message: RequestMessage): number | void;

    onMessage(handler: (message: ResponseMessage | EventMessage, meta?: InboundMessageMeta) => void): () => void;
}

declare global {
    interface Window {
        webkit?: {
            messageHandlers?: {
                ChaticMessageHandler?: {
                    postMessage: (message: string) => void;
                };
            };
        };
        ChaticMessageHandler?: {
            postMessage?: (message: string) => void;
        };
        ReactNativeWebView?: {
            postMessage(message: string): void;
        };
    }
}
