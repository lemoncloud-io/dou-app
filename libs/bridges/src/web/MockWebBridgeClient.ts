import type { BridgeAdapter } from './adapters';
import type { EventMessage, RequestMessage, ResponseMessage } from '../common';
import type { BridgeResponseMessage } from '../common/types';
import type { IWebBridgeClient } from './IWebBridgeClient';
import type { WebMessageType, WebMessageData, EventMessageType, AppMessageData } from '@chatic/app-messages';

export class MockWebBridgeClient implements IWebBridgeClient {
    private adapter: BridgeAdapter;
    private version = '1.0.0-mock';
    private timeoutMs = 5000;

    private eventListeners = new Map<string, Set<(message: any) => void>>();
    private pendingRequests = new Map<
        string,
        { resolve: (value: any) => void; reject: (reason: any) => void; timeoutId: NodeJS.Timeout }
    >();

    constructor(config: { adapter: BridgeAdapter }) {
        this.adapter = config.adapter;
        this.adapter.onMessage(this.handleMessageFromApp);
        console.log('[MockWebBridgeClient] 초기화 및 어댑터와 연결되었습니다.');
    }

    private handleMessageFromApp = (message: ResponseMessage | EventMessage): void => {
        console.log(`[MockWebBridgeClient] App으로부터 메시지 수신:`, message);
        if ('success' in message && message.refId) {
            this.handleResponse(message as ResponseMessage);
        } else {
            this.handleEvent(message as EventMessage);
        }
    };

    private handleResponse(message: ResponseMessage): void {
        const pending = this.pendingRequests.get(message.refId!);
        if (!pending) return;

        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(message.refId!);

        if (message.success) {
            console.log(`[MockWebBridgeClient] 요청 '${message.refId}'에 대한 성공 응답 처리.`);
            pending.resolve(message);
        } else {
            console.log(`[MockWebBridgeClient] 요청 '${message.refId}'에 대한 실패 응답 처리.`);
            pending.reject(message.error);
        }
    }

    private handleEvent(message: EventMessage): void {
        console.log(`[MockWebBridgeClient] '${message.type}' 이벤트 처리.`);
        const listeners = this.eventListeners.get(message.type);
        listeners?.forEach(listener => listener(message));
    }

    private generateRefId = () => Math.random().toString(36).substring(2, 9);

    public post<K extends WebMessageType>(type: K, messageParams?: Omit<WebMessageData<K>, 'type'>): void {
        console.log(`[MockWebBridgeClient] POST 발송: type='${String(type)}'`, messageParams);
        const message = {
            type,
            version: this.version,
            ...messageParams,
            refId: messageParams?.refId ?? this.generateRefId(),
        } as unknown as RequestMessage;

        this.adapter.postMessage(message);
    }

    public request<K extends WebMessageType>(
        type: K,
        messageParams?: Omit<WebMessageData<K>, 'type'>
    ): Promise<BridgeResponseMessage<K>> {
        console.log(`[MockWebBridgeClient] REQUEST 발송: type='${String(type)}'`, messageParams);
        return new Promise((resolve, reject) => {
            const refId = messageParams?.refId ?? this.generateRefId();
            const message = {
                type,
                version: this.version,
                ...messageParams,
                refId,
            } as unknown as RequestMessage;

            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(refId);
                reject({ code: 'TIMEOUT', message: 'Mock Request Timed Out' });
            }, this.timeoutMs);

            this.pendingRequests.set(refId, { resolve, reject, timeoutId });
            this.adapter.postMessage(message);
        });
    }

    public send<K extends WebMessageType>(message: WebMessageData<K>): Promise<BridgeResponseMessage<K>> {
        const { type, ...rest } = message;
        return this.request(type as K, rest as Omit<WebMessageData<K>, 'type'>);
    }

    public onEvent<K extends EventMessageType>(type: K, handler: (message: AppMessageData<K>) => void): () => void {
        const typeStr = type as string;
        console.log(`[MockWebBridgeClient] '${typeStr}' 이벤트 구독 설정.`);
        if (!this.eventListeners.has(typeStr)) {
            this.eventListeners.set(typeStr, new Set());
        }

        const listeners = this.eventListeners.get(typeStr)!;
        listeners.add(handler as any);

        return () => {
            listeners.delete(handler as any);
        };
    }
}
