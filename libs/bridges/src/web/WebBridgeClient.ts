import type { BridgeAdapter } from './adapters';
import type { EventMessage, IMessageQueue, RequestMessage, ResponseMessage } from '../common';
import { MessageQueue } from '../common';
import type { IWebBridgeClient } from './IWebBridgeClient';
import {
    WEB_MESSAGE_RESPONSE_TYPE,
    type AppMessageData,
    type AppMessageType,
    type BridgeError,
    type WebMessageData,
    type WebMessageSuccessResponse,
    type WebMessageType,
} from '@chatic/app-messages';
import { BRIDGE_PROTOCOL_VERSION } from '../version';

export interface WebBridgeClientConfig {
    adapter: BridgeAdapter;
    version?: string;
    timeoutMs?: number;
    bridgeReadyTimeoutMs?: number;
    isBridgeAvailable?: () => boolean;
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
    private bridgeReadyTimeoutMs: number;
    private isBridgeAvailable: () => boolean;

    private eventListeners = new Map<string, Set<(message: any) => void>>();
    private pendingRequests = new Map<string, PendingRequest>();

    private isReady = false;
    private availabilityFailed = false;
    private pendingBuffer: IMessageQueue<RequestMessage>;

    constructor(config: WebBridgeClientConfig) {
        this.adapter = config.adapter;
        this.version = config.version ?? BRIDGE_PROTOCOL_VERSION;
        this.timeoutMs = config.timeoutMs ?? 10000;
        this.bridgeReadyTimeoutMs = config.bridgeReadyTimeoutMs ?? 10000;
        this.isBridgeAvailable = config.isBridgeAvailable ?? this.checkNativeBridgeAvailable;
        this.pendingBuffer = config.pendingBuffer ?? new MessageQueue();

        this.adapter.onMessage(this.handleMessage);
        this.initBridgeDetection();
    }

    private checkNativeBridgeAvailable = (): boolean => {
        if (typeof window === 'undefined') return false;
        return !!(
            window.ReactNativeWebView?.postMessage ||
            window.ChaticMessageHandler?.postMessage ||
            window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage
        );
    };

    private initBridgeDetection(): void {
        if (this.isBridgeAvailable()) {
            this.isReady = true;
            this.flushBuffer();
            return;
        }

        const intervalId = setInterval(() => {
            if (this.isBridgeAvailable()) {
                clearInterval(intervalId);
                this.isReady = true;
                this.flushBuffer();
            }
        }, 50);

        setTimeout(() => {
            clearInterval(intervalId);
            if (!this.isReady) {
                this.failBufferedRequests();
            }
        }, this.bridgeReadyTimeoutMs);
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

    private failBufferedRequests(): void {
        this.availabilityFailed = true;
        this.pendingBuffer.clear();

        this.pendingRequests.forEach(pending => {
            if (pending.timeoutId) return;
            pending.reject(this.createNativeNotSupportedError(pending.requestType));
        });

        [...this.pendingRequests.entries()].forEach(([refId, pending]) => {
            if (!pending.timeoutId) this.pendingRequests.delete(refId);
        });
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

    public post<K extends WebMessageType>(message: WebMessageData<K>): void {
        const type = message.type;
        if (this.availabilityFailed) {
            console.warn(
                `[WebBridgeClient] post [${String(type)}] 호출이 무시되었습니다. 네이티브 브릿지 인터페이스를 찾을 수 없습니다.`
            );
            return;
        }

        const requestMessage = this.createRequestMessage(message);

        if (!this.isReady) {
            this.pendingBuffer.enqueue(requestMessage);
        } else {
            this.adapter.postMessage(requestMessage);
        }
    }

    public request<K extends WebMessageType>(
        message: WebMessageData<K>,
        options?: { timeoutMs?: number }
    ): Promise<WebMessageSuccessResponse<K>> {
        const requestType = message.type;
        const expectedResponseType = WEB_MESSAGE_RESPONSE_TYPE[requestType];
        if (this.availabilityFailed) {
            return Promise.reject(this.createNativeNotSupportedError(requestType));
        }

        return new Promise((resolve, reject) => {
            const requestMessage = this.createRequestMessage(message);
            const refId = requestMessage.refId ?? this.generateRefId();
            requestMessage.refId = refId;

            this.pendingRequests.set(refId, {
                resolve,
                reject,
                timeoutMs: options?.timeoutMs ?? this.timeoutMs,
                requestType,
                expectedResponseType,
            });

            if (!this.isReady) {
                this.pendingBuffer.enqueue(requestMessage);
            } else {
                this.dispatchRequest(requestMessage);
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

    private createRequestMessage<K extends WebMessageType>(message: WebMessageData<K>): RequestMessage {
        return {
            version: this.version,
            ...message,
            refId: message.refId ?? this.generateRefId(),
        } as unknown as RequestMessage;
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

    private createNativeNotSupportedError(requestType: WebMessageType): BridgeError {
        return {
            code: 'NATIVE_NOT_SUPPORTED',
            message: '일반 브라우저 환경에서는 네이티브 브릿지 기능을 사용할 수 없습니다.',
            reason: 'No native bridge adapter became available before the configured readiness timeout.',
            requestType,
            protocolVersion: this.version,
            webVersion: this.version,
            recoverable: true,
        };
    }
}
