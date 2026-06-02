import type { BridgeAdapter } from './adapters';
import type { EventMessage, IMessageQueue, RequestMessage, ResponseMessage } from '../common';
import { MessageQueue } from '../common';
import type { IWebBridgeClient } from './IWebBridgeClient';
import {
    WEB_MESSAGE_RESPONSE_TYPE,
    type AppMessageData,
    type AppMessageType,
    type BaseMessage,
    type BridgeError,
    type WebMessageData,
    type WebMessageRequestParams,
    type WebMessageSuccessResponse,
    type WebMessageType,
} from '@chatic/app-messages';
import { BRIDGE_PROTOCOL_VERSION } from '../version';

export interface WebBridgeClientConfig {
    adapter: BridgeAdapter;
    version?: string;
    timeoutMs?: number;
    pendingBuffer?: IMessageQueue<RequestMessage>;
}

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeoutId?: ReturnType<typeof setTimeout>;
    timeoutMs: number;
    /** 응답 type mismatch와 timeout 로그에서 원 요청을 복원하기 위해 refId와 함께 보관합니다. */
    requestType: WebMessageType;
    expectedResponseType: AppMessageType;
}

export class WebBridgeClient implements IWebBridgeClient {
    private adapter: BridgeAdapter;
    private version: string;
    private timeoutMs: number;

    private eventListeners = new Map<string, Set<(message: any) => void>>();
    private pendingRequests = new Map<string, PendingRequest>();

    private isReady = false;
    private pendingBuffer: IMessageQueue<RequestMessage>;

    constructor(config: WebBridgeClientConfig) {
        this.adapter = config.adapter;
        this.version = config.version ?? BRIDGE_PROTOCOL_VERSION;
        this.timeoutMs = config.timeoutMs ?? 10000;
        this.pendingBuffer = config.pendingBuffer ?? new MessageQueue();

        this.adapter.onMessage(this.handleMessage);
        this.initBridgeDetection();
    }

    private checkBridgeAvailable(): boolean {
        if (typeof window === 'undefined') return false;
        return !!(
            window.ReactNativeWebView?.postMessage ||
            window.ChaticMessageHandler?.postMessage ||
            window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage
        );
    }

    private initBridgeDetection(): void {
        if (this.checkBridgeAvailable()) {
            this.isReady = true;
            this.flushBuffer();
            return;
        }

        const intervalId = setInterval(() => {
            if (this.checkBridgeAvailable()) {
                clearInterval(intervalId);
                this.isReady = true;
                this.flushBuffer();
            }
        }, 50);

        setTimeout(() => clearInterval(intervalId), 10000);
    }

    private flushBuffer(): void {
        while (!this.pendingBuffer.isEmpty()) {
            const message = this.pendingBuffer.dequeue();
            if (message) {
                const refId = message.refId;
                if (refId && this.pendingRequests.has(refId)) {
                    this.dispatchRequest(message);
                } else {
                    this.adapter.postMessage(message);
                }
            }
        }
    }

    private dispatchRequest(message: RequestMessage): void {
        const refId = message.refId;

        if (refId) {
            const pending = this.pendingRequests.get(refId);
            if (pending) {
                // 버퍼에 쌓인 요청은 native로 실제 dispatch된 뒤부터 timeout을 시작합니다.
                pending.timeoutId = setTimeout(() => {
                    this.pendingRequests.delete(refId);
                    pending.reject({
                        code: 'TIMEOUT',
                        message: `Request timed out after ${pending.timeoutMs}ms`,
                        reason: 'No response was received before the configured timeout.',
                        requestType: pending.requestType,
                        expectedResponseType: pending.expectedResponseType,
                        protocolVersion: this.version,
                        webVersion: this.version,
                        recoverable: true,
                    });
                }, pending.timeoutMs);
            }
        }

        this.adapter.postMessage(message);
    }

    private handleMessage = (message: ResponseMessage | EventMessage): void => {
        const refId = message.refId; // 지역 변수 할당

        if ('success' in message && refId && this.pendingRequests.has(refId)) {
            this.handleResponse(message as ResponseMessage);
        } else {
            this.handleEvent(message as EventMessage);
        }
    };

    private handleResponse(message: ResponseMessage): void {
        const refId = message.refId;
        if (!refId) return;

        const pending = this.pendingRequests.get(refId);
        if (!pending) return;

        if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
        }
        this.pendingRequests.delete(refId);

        if (!message.success) {
            pending.reject(message.error);
            return;
        }

        // 구버전 모바일은 WebAppReady 요청에 WebAppReady type으로 응답할 수 있습니다.
        if (pending.requestType === 'WebAppReady' && message.type === 'WebAppReady') {
            pending.resolve(this.normalizeLegacyWebAppReady(message));
            return;
        }

        // 웹/모바일 배포 싱크가 어긋난 경우를 조기에 드러내기 위한 runtime guard입니다.
        if (message.type !== pending.expectedResponseType) {
            pending.reject(
                this.createResponseTypeMismatchError(
                    pending,
                    typeof message.type === 'string' ? message.type : undefined
                )
            );
            return;
        }

        pending.resolve(message);
    }

    private handleEvent(message: EventMessage): void {
        const listeners = this.eventListeners.get(message.type);
        listeners?.forEach(listener => listener(message));
    }

    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    public post<K extends WebMessageType>(message: WebMessageData<K>): void;
    /**
     * @deprecated 현재 Web -> 과거 App 호환을 위해서만 유지합니다.
     * 새 호출부는 `post({ type, data })` message object 형태를 사용하세요.
     */
    public post<K extends WebMessageType>(type: K, messageParams?: WebMessageRequestParams<K>): void;
    public post<K extends WebMessageType>(
        messageOrType: K | WebMessageData<K>,
        messageParams?: WebMessageRequestParams<K>
    ): void {
        const message = this.createRequestMessage(messageOrType, messageParams);

        if (!this.isReady) {
            this.pendingBuffer.enqueue(message);
        } else {
            this.adapter.postMessage(message);
        }
    }

    public request<K extends WebMessageType>(
        message: WebMessageData<K>,
        options?: { timeoutMs?: number }
    ): Promise<WebMessageSuccessResponse<K>>;
    /**
     * @deprecated 현재 Web -> 과거 App 호환을 위해서만 유지합니다.
     * 새 호출부는 `request({ type, data }, options)` message object 형태를 사용하세요.
     */
    public request<K extends WebMessageType>(
        type: K,
        messageParams?: WebMessageRequestParams<K>,
        customTimeoutMs?: number
    ): Promise<WebMessageSuccessResponse<K>>;
    public request<K extends WebMessageType>(
        messageOrType: K | WebMessageData<K>,
        messageParamsOrOptions?: WebMessageRequestParams<K> | { timeoutMs?: number },
        customTimeoutMs?: number
    ): Promise<WebMessageSuccessResponse<K>> {
        const requestOptions =
            typeof messageOrType === 'string' ? undefined : (messageParamsOrOptions as { timeoutMs?: number });
        const messageParams =
            typeof messageOrType === 'string' ? (messageParamsOrOptions as WebMessageRequestParams<K>) : undefined;
        const requestType = typeof messageOrType === 'string' ? messageOrType : messageOrType.type;
        const expectedResponseType = WEB_MESSAGE_RESPONSE_TYPE[requestType];
        return new Promise((resolve, reject) => {
            const message = this.createRequestMessage(messageOrType, messageParams);
            const refId = message.refId ?? this.generateRefId();
            message.refId = refId;

            this.pendingRequests.set(refId, {
                resolve,
                reject,
                timeoutMs: customTimeoutMs ?? requestOptions?.timeoutMs ?? this.timeoutMs,
                requestType,
                expectedResponseType,
            });

            if (!this.isReady) {
                this.pendingBuffer.enqueue(message);
            } else {
                this.dispatchRequest(message);
            }
        });
    }

    public onEvent<K extends AppMessageType>(type: K, handler: (message: AppMessageData<K>) => void): () => void {
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

    private createRequestMessage<K extends WebMessageType>(
        messageOrType: K | WebMessageData<K>,
        messageParams?: WebMessageRequestParams<K>
    ): RequestMessage {
        if (typeof messageOrType !== 'string') {
            return {
                version: this.version,
                ...messageOrType,
                refId: messageOrType.refId ?? this.generateRefId(),
            } as unknown as RequestMessage;
        }

        const normalizedParams = this.normalizeLegacyRequestParams(messageParams);

        return {
            type: messageOrType,
            ...normalizedParams,
            version: normalizedParams.version ?? this.version,
            refId: normalizedParams.refId ?? this.generateRefId(),
        } as unknown as RequestMessage;
    }

    private normalizeLegacyRequestParams<K extends WebMessageType>(
        messageParams?: WebMessageRequestParams<K>
    ): BaseMessage & { data: unknown } {
        if (!messageParams) {
            return { data: {} };
        }

        if ('data' in messageParams) {
            return messageParams as BaseMessage & { data: unknown };
        }

        const params = messageParams as BaseMessage & Record<string, unknown>;
        const { refId, version, nonce, ...payload } = params;
        return {
            refId,
            version,
            nonce,
            data: payload,
        };
    }

    private normalizeLegacyWebAppReady(message: ResponseMessage): WebMessageSuccessResponse<'WebAppReady'> {
        // legacy 응답을 신규 OnWebAppReady shape로 맞춰 caller가 분기 없이 처리하게 합니다.
        return {
            ...message,
            type: 'OnWebAppReady',
            success: true,
            data: {
                protocolVersion: message.version ?? this.version,
                supportedWebMessages: [],
                supportedAppMessages: [],
                capabilities: {
                    legacyWebAppReady: true,
                },
            },
        } as WebMessageSuccessResponse<'WebAppReady'>;
    }

    private createResponseTypeMismatchError(pending: PendingRequest, actualResponseType?: string): BridgeError {
        // payload 원문 대신 request/response type과 버전 정보만 남겨 민감정보 노출을 피합니다.
        return {
            code: 'RESPONSE_TYPE_MISMATCH',
            message: `Unexpected bridge response type: expected ${pending.expectedResponseType}, received ${actualResponseType ?? 'unknown'}.`,
            reason: 'The native app and web bundle may be using different bridge protocol versions.',
            requestType: pending.requestType,
            expectedResponseType: pending.expectedResponseType,
            actualResponseType,
            protocolVersion: this.version,
            webVersion: this.version,
            recoverable: true,
        };
    }
}
