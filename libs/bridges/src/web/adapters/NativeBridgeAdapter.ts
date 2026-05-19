import type { BridgeAdapter } from './BridgeAdapter';
import type { EventMessage, RequestMessage, ResponseMessage, MessageProtocol } from '../../common';
import { JsonProtocol } from '../../common';

declare global {
    interface Window {
        webkit?: { messageHandlers?: { ChaticMessageHandler?: { postMessage: (message: string) => void } } };
        ChaticMessageHandler?: { postMessage?: (message: string) => void };
        ReactNativeWebView?: { postMessage(message: string): void };
    }
}

export class NativeBridgeAdapter implements BridgeAdapter {
    private handlers: ((message: ResponseMessage | EventMessage) => void)[] = [];
    private protocol: MessageProtocol;
    private isListening = false;

    constructor(protocol: MessageProtocol = JsonProtocol) {
        this.protocol = protocol;
    }

    private setupListener() {
        if (!this.isListening && typeof window !== 'undefined') {
            window.addEventListener('message', this.handleNativeMessage);
            document.addEventListener('message', this.handleNativeMessage as EventListener);
            this.isListening = true;
        }
    }

    private teardownListener() {
        if (this.isListening && typeof window !== 'undefined') {
            window.removeEventListener('message', this.handleNativeMessage);
            document.removeEventListener('message', this.handleNativeMessage as EventListener);
            this.isListening = false;
        }
    }

    private handleNativeMessage = (event: MessageEvent) => {
        try {
            const data = event.data;
            if (typeof data !== 'string' && !(data instanceof Uint8Array)) return;

            const parsed = this.protocol.decode(data);
            if (parsed && typeof parsed.type === 'string') {
                this.handlers.forEach(h => h(parsed as ResponseMessage | EventMessage));
            }
        } catch (e) {
            console.error('[NativeBridgeAdapter] 메시지 파싱 실패:', e);
        }
    };

    public postMessage(message: RequestMessage): void {
        try {
            const encoded = this.protocol.encode(message);
            if (typeof encoded === 'string') {
                if (window.ChaticMessageHandler?.postMessage) {
                    window.ChaticMessageHandler.postMessage(encoded);
                } else if (window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage) {
                    window.webkit.messageHandlers.ChaticMessageHandler.postMessage(encoded);
                } else if (window.ReactNativeWebView?.postMessage) {
                    window.ReactNativeWebView.postMessage(encoded);
                } else {
                    console.warn('[NativeBridgeAdapter] 네이티브 브릿지 인터페이스를 찾을 수 없습니다.');
                }
            }
        } catch (e) {
            console.error('[NativeBridgeAdapter] 메시지 인코딩 실패:', e);
        }
    }

    public onMessage(handler: (message: ResponseMessage | EventMessage) => void): () => void {
        this.handlers.push(handler);
        if (this.handlers.length === 1) this.setupListener();

        return () => {
            this.handlers = this.handlers.filter(h => h !== handler);
            if (this.handlers.length === 0) this.teardownListener();
        };
    }
}
