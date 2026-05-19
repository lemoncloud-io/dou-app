import type { BridgeAdapter } from './adapters';
import type { RequestMessage, ResponseMessage, EventMessage, WebMessageType, EventMessageType } from '../common';
import type { IWebBridgeClient, ExtractReqData, ExtractResData, ExtractEvtData } from './IWebBridgeClient';

export interface WebBridgeClientConfig {
    adapter: BridgeAdapter;
    version?: string;
    timeoutMs?: number;
}

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Web(React 등) 환경에서 App(React Native, iOS, Android)과 통신하기 위한 브릿지 클라이언트 구현체입니다.
 */
export class WebBridgeClient implements IWebBridgeClient {
    private adapter: BridgeAdapter;
    private version: string;
    private timeoutMs: number;

    private eventListeners: Map<string, Set<(payload: any) => void>> = new Map();
    private pendingRequests: Map<string, PendingRequest> = new Map();

    constructor(config: WebBridgeClientConfig) {
        this.adapter = config.adapter;
        this.version = config.version ?? '2.0.0';
        this.timeoutMs = config.timeoutMs ?? 10000;

        // 브릿지 어댑터로부터 들어오는 메시지 수신부 바인딩
        this.adapter.onMessage(this.handleMessage);
    }

    private handleMessage = (message: ResponseMessage | EventMessage): void => {
        if ('success' in message && message.refId) {
            this.handleResponse(message as ResponseMessage);
        } else {
            this.handleEvent(message as EventMessage);
        }
    };

    private handleResponse(message: ResponseMessage): void {
        const pending = this.pendingRequests.get(message.refId);
        if (!pending) return;

        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(message.refId);

        if (message.success) {
            // 응답 객체의 data(추출된 페이로드)를 그대로 반환
            pending.resolve(message.data);
        } else {
            pending.reject(message.error);
        }
    }

    private handleEvent(message: EventMessage): void {
        const listeners = this.eventListeners.get(message.type);
        // 이벤트 객체의 호환성 필드인 data에서 페이로드 추출
        const payload = (message as any).data !== undefined ? (message as any).data : undefined;
        listeners?.forEach(listener => listener(payload));
    }

    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    public post<K extends WebMessageType>(type: K, payload?: ExtractReqData<K>): void {
        const message = {
            type,
            refId: this.generateRefId(),
            version: this.version,
            data: payload, // 전송 시 호환성 규격을 위해 data 필드에 탑재
        } as unknown as RequestMessage;

        this.adapter.postMessage(message);
    }

    public request<K extends WebMessageType>(
        type: K,
        payload?: ExtractReqData<K>,
        customTimeoutMs?: number
    ): Promise<ExtractResData<K>> {
        return new Promise((resolve, reject) => {
            const refId = this.generateRefId();
            const message = {
                type,
                refId,
                version: this.version,
                data: payload, // 전송 시 호환성 규격을 위해 data 필드에 탑재
            } as unknown as RequestMessage;

            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(refId);
                reject({ code: 'TIMEOUT', message: `Request timed out after ${customTimeoutMs ?? this.timeoutMs}ms` });
            }, customTimeoutMs ?? this.timeoutMs);

            this.pendingRequests.set(refId, { resolve, reject, timeoutId });
            this.adapter.postMessage(message);
        });
    }

    public send<K extends WebMessageType>(
        message: { type: K; payload?: ExtractReqData<K> },
        customTimeoutMs?: number
    ): Promise<ExtractResData<K>> {
        return this.request(message.type, message.payload, customTimeoutMs);
    }

    public onEvent<K extends EventMessageType>(type: K, handler: (payload: ExtractEvtData<K>) => void): () => void {
        const typeStr = type as string;
        if (!this.eventListeners.has(typeStr)) {
            this.eventListeners.set(typeStr, new Set());
        }

        const listeners = this.eventListeners.get(typeStr)!;
        listeners.add(handler as any);

        return () => {
            listeners.delete(handler as any);
            if (listeners.size === 0) this.eventListeners.delete(typeStr);
        };
    }
}
