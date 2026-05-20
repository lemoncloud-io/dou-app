import type { BridgeAdapter } from './BridgeAdapter';
import type { EventMessage, RequestMessage, ResponseMessage } from '../../common';

export class MockBridgeAdapter implements BridgeAdapter {
    private onMessageHandlers = new Set<(message: ResponseMessage | EventMessage) => void>();
    private sendToAppCallback?: (message: RequestMessage) => void;

    constructor(sendToAppCallback?: (message: RequestMessage) => void) {
        this.sendToAppCallback = sendToAppCallback;
        console.log('[MockBridgeAdapter] 초기화. App 연결:', sendToAppCallback ? '✅' : '❌');
    }

    public postMessage(message: RequestMessage): void {
        console.log(`[MockBridgeAdapter] Web -> App 메시지 전송: [${message.type}]`);
        if (this.sendToAppCallback) {
            setTimeout(() => this.sendToAppCallback?.(message), 10);
        }
    }

    public onMessage(handler: (message: ResponseMessage | EventMessage) => void): () => void {
        this.onMessageHandlers.add(handler);
        return () => {
            this.onMessageHandlers.delete(handler);
        };
    }

    public receiveMessageFromApp(message: ResponseMessage | EventMessage): void {
        console.log(`[MockBridgeAdapter] App -> Web 메시지 수신: [${message.type}]`, message);
        this.onMessageHandlers.forEach(handler => handler(message));
    }
}
