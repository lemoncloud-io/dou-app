import { logger } from '@chatic/logger';

import type { BridgeAdapter, InboundMessageMeta } from './types';
import type { EventMessage, RequestMessage, ResponseMessage, MessageProtocol } from '../../common';
import { JsonProtocol } from '../../common';

export class NativeBridgeAdapter implements BridgeAdapter {
    private handlers = new Set<(message: ResponseMessage | EventMessage, meta?: InboundMessageMeta) => void>();
    private protocol: MessageProtocol;
    private isListening = false;

    constructor(protocol: MessageProtocol = JsonProtocol) {
        this.protocol = protocol;
    }

    private setupListener() {
        if (!this.isListening && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('message', this.handleNativeMessage);
            if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
                document.addEventListener('message', this.handleNativeMessage as EventListener);
            }
            this.isListening = true;
        }
    }

    private teardownListener() {
        if (this.isListening && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('message', this.handleNativeMessage);
            if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
                document.removeEventListener('message', this.handleNativeMessage as EventListener);
            }
            this.isListening = false;
        }
    }

    private handleNativeMessage = (event: MessageEvent) => {
        try {
            const data = event.data;
            if (typeof data !== 'string' && !(data instanceof Uint8Array)) return;

            const parsed = this.protocol.decode(data);
            if (parsed && 'type' in parsed && typeof parsed.type === 'string') {
                const meta: InboundMessageMeta = { length: data.length };
                this.handlers.forEach(handler => handler(parsed as ResponseMessage | EventMessage, meta));
            }
        } catch (e) {
            logger.error('BRIDGE', '[NativeBridgeAdapter] inbound handler threw', { error: e });
        }
    };

    public postMessage(message: RequestMessage): number | void {
        try {
            const encoded = this.protocol.encode(message);

            if (typeof encoded !== 'string') {
                console.warn('[NativeBridgeAdapter] this bridge only sends string payloads');
                return;
            }

            if (typeof window !== 'undefined') {
                if (window.ChaticMessageHandler?.postMessage) {
                    window.ChaticMessageHandler.postMessage(encoded);
                } else if (window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage) {
                    window.webkit.messageHandlers.ChaticMessageHandler.postMessage(encoded);
                } else if (window.ReactNativeWebView?.postMessage) {
                    window.ReactNativeWebView.postMessage(encoded);
                } else {
                    console.warn('[NativeBridgeAdapter] no native bridge interface found');
                    return;
                }
                return encoded.length;
            } else {
                console.warn('[NativeBridgeAdapter] SSR environment exposes no native bridge interface');
            }
        } catch (e) {
            console.error('[NativeBridgeAdapter] failed to encode message:', e);
        }
    }

    public onMessage(
        handler: (message: ResponseMessage | EventMessage, meta?: InboundMessageMeta) => void
    ): () => void {
        this.handlers.add(handler);
        if (this.handlers.size === 1) this.setupListener();

        return () => {
            this.handlers.delete(handler);
            if (this.handlers.size === 0) this.teardownListener();
        };
    }
}
