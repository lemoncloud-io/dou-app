import type { BridgeAdapter } from './BridgeAdapter';
import type { MessageProtocol } from '../../common';
import { JsonProtocol } from '../../common';
import type { RequestMessage, ResponseMessage, EventMessage } from '../../common';

declare global {
    interface Window {
        ReactNativeWebView?: {
            postMessage(message: string): void;
        };
    }
}

export class NativeBridgeAdapter implements BridgeAdapter {
    private handlers: ((message: ResponseMessage | EventMessage) => void)[] = [];
    private protocol: MessageProtocol;

    constructor(protocol: MessageProtocol = JsonProtocol) {
        this.protocol = protocol;
        this.setupListener();
    }

    private setupListener() {
        if (typeof window !== 'undefined') {
            window.addEventListener('message', this.handleNativeMessage);
            // In some older Android devices, document is used
            document.addEventListener('message', this.handleNativeMessage as EventListener);
        }
    }

    private handleNativeMessage = (event: MessageEvent) => {
        try {
            const data = event.data;
            if (typeof data !== 'string' && !(data instanceof Uint8Array)) {
                return;
            }

            const parsed = this.protocol.decode(data);

            // Only process if it has a valid type (basic check)
            if (parsed && typeof parsed.type === 'string') {
                this.handlers.forEach(h => h(parsed as ResponseMessage | EventMessage));
            }
        } catch (e) {
            console.error('[NativeBridgeAdapter] Failed to parse message:', e);
        }
    };

    public postMessage(message: RequestMessage): void {
        try {
            const encoded = this.protocol.encode(message);
            // ReactNativeWebView expects a string
            if (typeof encoded === 'string') {
                window.ReactNativeWebView?.postMessage(encoded);
            } else {
                console.error(
                    '[NativeBridgeAdapter] Uint8Array is not directly supported by React Native postMessage without base64 or conversion.'
                );
            }
        } catch (e) {
            console.error('[NativeBridgeAdapter] Failed to encode message:', e);
        }
    }

    public onMessage(handler: (message: ResponseMessage | EventMessage) => void): () => void {
        this.handlers.push(handler);
        return () => {
            this.handlers = this.handlers.filter(h => h !== handler);

            if (this.handlers.length === 0 && typeof window !== 'undefined') {
                window.removeEventListener('message', this.handleNativeMessage);
                document.removeEventListener('message', this.handleNativeMessage as EventListener);
            }
        };
    }
}
