import { logger } from '@chatic/logger';

import type { BridgeAdapter } from './adapters/types';
import type { EventMessage, RequestMessage, ResponseMessage, EnvironmentConfig, IMessageQueue } from '../common';
import { MessageQueue } from '../common';
import type { IWebBridgeClient, WebBridgeClientConfig, PendingRequest } from './types';
import {
    WEB_MESSAGE_RESPONSE_TYPE,
    type AppMessageData,
    type AppMessageType,
    type BridgeError,
    type WebMessageData,
    type WebMessageResponse,
    type WebMessageType,
} from '@chatic/app-messages';
import { BRIDGE_PROTOCOL_VERSION } from '../version';

/**
 * 웹(Web) 런타임 환경에서 동작하는 브릿지 클라이언트 핵심 구현 클래스입니다.
 * 네이티브 채널의 준비 여부를 감지하고, 비동기 요청(Request-Response) 및 이벤트 리스너 구독을 총괄합니다.
 */
export class WebBridgeClient implements IWebBridgeClient {
    private adapter: BridgeAdapter;
    private version: string;
    private timeoutMs: number;
    private bridgeReadyTimeoutMs: number;
    private isBridgeAvailable: () => boolean;
    private environment?: EnvironmentConfig;

    /** 수신된 네이티브 이벤트를 라우팅할 리스너 맵 */
    private eventListeners = new Map<string, Set<(message: any) => void>>();
    /** 현재 응답을 대기 중인 펜딩 요청 맵 (key: refId) */
    private pendingRequests = new Map<string, PendingRequest>();

    /** 브릿지 채널 준비 완료 상태 플래그 */
    private isReady = false;
    /** 브릿지 준비 대기 타임아웃 만료로 준비 실패했는지의 여부 */
    private availabilityFailed = false;
    /** 브릿지가 준비되기 전까지 요청들을 임시 보관하는 인메모리 버퍼 */
    private pendingBuffer: IMessageQueue<RequestMessage>;

    /** 어댑터 메시지 수신 해제 콜백 */
    private unsubscribeAdapter?: () => void;
    /** 네이티브 브릿지 유무 감지용 폴링 타이머 ID */
    private detectionIntervalId?: ReturnType<typeof setInterval>;
    /** 네이티브 브릿지 준비 대기 한계 시간 타임아웃 ID */
    private detectionTimeoutId?: ReturnType<typeof setTimeout>;

    constructor(config: WebBridgeClientConfig) {
        this.adapter = config.adapter;
        this.version = config.version ?? BRIDGE_PROTOCOL_VERSION;
        this.timeoutMs = config.timeoutMs ?? 10000;
        this.bridgeReadyTimeoutMs = config.bridgeReadyTimeoutMs ?? 10000;
        this.isBridgeAvailable = config.isBridgeAvailable ?? this.checkNativeBridgeAvailable;
        this.pendingBuffer = config.pendingBuffer ?? new MessageQueue();
        this.environment = config.environment;

        // 어댑터로부터 들어오는 메시지 수신 리스너를 바인딩하고 해제 함수를 저장합니다.
        this.unsubscribeAdapter = this.adapter.onMessage(this.handleMessage);

        // 네이티브 브릿지 감지 감시 가동
        this.initBridgeDetection();
    }

    /**
     * [Internal] 브라우저 전역 객체(window)의 각 플랫폼별 브릿지 주입 여부를 실시간 확인합니다.
     */
    private checkNativeBridgeAvailable = (): boolean => {
        if (typeof window === 'undefined') return false;
        return !!(
            window.ReactNativeWebView?.postMessage ||
            window.ChaticMessageHandler?.postMessage ||
            window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage
        );
    };

    /**
     * [Internal] 브릿지가 아직 감지되지 않았다면 감지될 때까지 폴링 루프를 실행합니다.
     * SSR(Server-Side) 환경에서는 즉시 준비 실패(NATIVE_NOT_SUPPORTED)로 상태를 마감합니다.
     */
    private initBridgeDetection(): void {
        // 1. SSR 환경 대응: window가 존재하지 않으면 대기 없이 즉시 실패 처리하여 타이머 리소스 방지
        if (typeof window === 'undefined') {
            this.failBufferedRequests();
            return;
        }

        // 2. 이미 브릿지가 사용 가능하면 즉시 ready 처리
        if (this.isBridgeAvailable()) {
            this.isReady = true;
            this.flushBuffer();
            return;
        }

        // 3. 브릿지가 생길 때까지 50ms 간격으로 감지 폴링 가동
        this.detectionIntervalId = setInterval(() => {
            if (this.isBridgeAvailable()) {
                this.clearDetectionTimers();
                this.isReady = true;
                this.flushBuffer();
            }
        }, 50);

        // 4. 감지 대기 타임아웃(기본 10초) 가동
        this.detectionTimeoutId = setTimeout(() => {
            this.clearDetectionTimers();
            if (!this.isReady) {
                this.failBufferedRequests();
            }
        }, this.bridgeReadyTimeoutMs);
    }

    /**
     * [Internal] 감시용 타이머 리소스를 안전하게 초기화합니다.
     */
    private clearDetectionTimers(): void {
        if (this.detectionIntervalId) {
            clearInterval(this.detectionIntervalId);
            this.detectionIntervalId = undefined;
        }
        if (this.detectionTimeoutId) {
            clearTimeout(this.detectionTimeoutId);
            this.detectionTimeoutId = undefined;
        }
    }

    /**
     * [Internal] 브릿지가 활성화되었을 때 대기 큐(Buffer)에 누적되어 있던 메시지들을 네이티브로 방출합니다.
     */
    private flushBuffer(): void {
        while (!this.pendingBuffer.isEmpty()) {
            const message = this.pendingBuffer.dequeue();
            if (message) {
                const refId = message.refId;
                // request 타입의 요청은 타이머를 가동해야 하므로 dispatchRequest로 위임
                if (refId && this.pendingRequests.has(refId)) {
                    this.dispatchRequest(message);
                } else {
                    this.adapter.postMessage(message);
                }
            }
        }
    }

    /**
     * [Internal] 요청 메시지를 실제로 어댑터로 발송하고, 해당 요청의 타임아웃 카운트를 개시합니다.
     */
    private dispatchRequest(message: RequestMessage): void {
        const refId = message.refId;

        if (refId) {
            const pending = this.pendingRequests.get(refId);
            if (pending) {
                // 버퍼에 쌓여있던 요청은 실제로 디스패치된 직후부터 타임아웃 대기를 시작합니다.
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

    /**
     * [Internal] 브릿지 활성화 대기가 최종 만료되었을 때, 큐와 펜딩 상태의 모든 요청을 에러 처리합니다.
     */
    private failBufferedRequests(): void {
        this.availabilityFailed = true;
        this.pendingBuffer.clear();

        // 펜딩 상태 중 아직 실제로 네이티브로 보내지지 못한(타임아웃 감시가 켜지지 않은) 것들을 거절 처리
        this.pendingRequests.forEach(pending => {
            if (pending.timeoutId) return;
            pending.reject(this.createNativeNotSupportedError(pending.requestType));
        });

        // 거절 처리된 요청을 펜딩 맵에서 확실하게 정리
        [...this.pendingRequests.entries()].forEach(([refId, pending]) => {
            if (!pending.timeoutId) this.pendingRequests.delete(refId);
        });
    }

    /**
     * [Internal] 어댑터로부터 전달받은 로우 메시지의 유효성 및 타깃을 선별하여 라우팅합니다.
     */
    private handleMessage = (message: ResponseMessage | EventMessage): void => {
        // 드롭 시뮬레이션 설정 시 이벤트 조기 드롭
        if (this.shouldDrop()) return;

        // RTT 딜레이 시뮬레이션 설정 시 디코딩 딜레이 적용
        const delay = (this.environment?.rttDelayMs ?? 0) / 2;
        if (delay > 0) {
            setTimeout(() => this.processReceivedMessage(message), delay);
        } else {
            this.processReceivedMessage(message);
        }
    };

    /**
     * [Internal] 실제로 수신된 메시지의 응답(Response)과 이벤트(Event) 분기를 최종 수행합니다.
     */
    private processReceivedMessage(message: ResponseMessage | EventMessage): void {
        const refId = message.refId;

        // success 속성이 들어있고 펜딩 맵에 refId가 대기 중이면 request에 대한 응답(Response)
        if ('success' in message && refId && this.pendingRequests.has(refId)) {
            // 시뮬레이션: 깨진 데이터 주입 유도
            if (this.environment?.malformedResponse) {
                this.handleResponse({
                    refId,
                    version: message.version,
                    type: 'ERROR',
                    success: true,
                } as unknown as ResponseMessage);
                return;
            }

            // 시뮬레이션: 응답 타입 불일치 가짜 주입 유도
            if (this.environment?.responseTypeMismatch && message.success) {
                const mismatchType =
                    typeof this.environment.responseTypeMismatch === 'string'
                        ? this.environment.responseTypeMismatch
                        : 'OnFetchSafeArea';
                this.handleResponse({
                    ...message,
                    type: mismatchType,
                } as ResponseMessage);
                return;
            }

            this.handleResponse(message as ResponseMessage);
        } else {
            // 펜딩에 존재하지 않거나 단방향 데이터인 경우 이벤트로 처리
            this.handleEvent(message as EventMessage);
        }
    }

    /**
     * [Internal] 매칭된 펜딩 요청의 수명을 종료하고 약속(Promise)을 이행(resolve/reject)시킵니다.
     */
    private handleResponse(message: ResponseMessage): void {
        const refId = message.refId;
        if (!refId) return;

        const pending = this.pendingRequests.get(refId);
        if (!pending) return;

        // 타임아웃 감시 정지
        if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
        }
        this.pendingRequests.delete(refId);

        // 앱/네이티브 비즈니스 로직 에러 수신 시 거절 처리
        if (!message.success) {
            pending.reject(message.error);
            return;
        }

        // 런타임 프로토콜 가드: 약속된 응답 유형과 다른 결과물이 온 경우 차단
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

    /**
     * [Internal] 등록되어 있는 이벤트 리스너들에게 데이터 객체를 배포합니다.
     */
    private handleEvent(message: EventMessage): void {
        const listeners = this.eventListeners.get(message.type);
        listeners?.forEach(listener => listener(message));
    }

    /**
     * [Internal] 펜딩 맵 관리를 위해 고유 식별자 키(refId)를 발급합니다.
     */
    private generateRefId(): string {
        return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    /**
     * [Web -> App] 응답이 필요 없는 네이티브 명령을 단방향 발송합니다.
     */
    public post<K extends WebMessageType>(message: WebMessageData<K>): void {
        const type = message.type;
        if (this.availabilityFailed) {
            // `createNativeForwarder`는 `NativeBridgeAdapter`를 직접 쓰므로 이 클래스는
            // 로그 전달 경로 밖이다 — logger를 써도 재귀하지 않는다.
            //
            // warn이 아니라 debug인 이유: 네이티브 셸 밖(브라우저·데스크톱)에서는 인터페이스가
            // 없는 게 정상이고, 그런 환경에서 post 한 번마다 warn이 나가면 상시 업로드에서
            // 이 한 줄이 배치 대부분을 차지한다(SetBadgeCount 하나에 수십 건). debug는
            // 링버퍼와 breadcrumb에는 그대로 남고 error가 낀 배치에만 동봉되므로,
            // 진짜 문제가 생긴 순간의 진단 가치는 잃지 않는다.
            logger.debug('BRIDGE', `[WebBridgeClient] post [${String(type)}] ignored — no native bridge interface`);
            return;
        }

        if (this.shouldDrop()) return;

        const requestMessage = this.createRequestMessage(message);

        const send = () => {
            if (!this.isReady) {
                this.pendingBuffer.enqueue(requestMessage);
            } else {
                this.adapter.postMessage(requestMessage);
            }
        };

        const delay = (this.environment?.rttDelayMs ?? 0) / 2;
        if (delay > 0) {
            setTimeout(send, delay);
        } else {
            send();
        }
    }

    /**
     * [Web -> App] 네이티브 앱에 명령을 발송하고 결과 응답 프로미스를 리턴합니다.
     */
    public request<K extends WebMessageType>(
        message: WebMessageData<K>,
        options?: { timeoutMs?: number }
    ): Promise<WebMessageResponse<K>> {
        const requestType = message.type;
        const expectedResponseType = WEB_MESSAGE_RESPONSE_TYPE[requestType];
        if (this.availabilityFailed) {
            return Promise.reject(this.createNativeNotSupportedError(requestType));
        }

        // 시뮬레이션: 강제 즉시 에러 발생 설정 시 즉각 거절
        if (this.environment?.forceFailure) {
            const failure = typeof this.environment.forceFailure === 'object' ? this.environment.forceFailure : {};
            const delay = this.environment?.rttDelayMs ?? 0;
            return new Promise((_, reject) => {
                setTimeout(() => {
                    reject({
                        code: failure.code ?? 'BRIDGE_SIMULATION_FAILURE',
                        message: failure.message ?? '브릿지 시뮬레이션 설정에 의해 요청이 실패했습니다.',
                        reason: 'The bridge simulation was configured to fail before reaching the app host.',
                        requestType,
                        expectedResponseType,
                        protocolVersion: this.version,
                        webVersion: this.version,
                        recoverable: failure.recoverable ?? true,
                    });
                }, delay);
            });
        }

        // 시뮬레이션: 무한 응답 지연 타임아웃 발생 유도 시
        if (this.environment?.timeoutMode) {
            const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
            return new Promise((resolve, reject) => {
                const refId = this.generateRefId();
                const timeoutId = setTimeout(() => {
                    this.pendingRequests.delete(refId);
                    reject({
                        code: 'TIMEOUT',
                        message: `Request timed out after ${timeoutMs}ms`,
                        reason: 'No response was received before the configured timeout.',
                        requestType,
                        expectedResponseType,
                        protocolVersion: this.version,
                        webVersion: this.version,
                        recoverable: true,
                    });
                }, timeoutMs);

                this.pendingRequests.set(refId, {
                    resolve,
                    reject,
                    timeoutId,
                    timeoutMs,
                    requestType,
                    expectedResponseType,
                });
            });
        }

        if (this.shouldDrop()) {
            return new Promise(() => {
                /* drop, never resolves */
            });
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

            const send = () => {
                if (!this.isReady) {
                    this.pendingBuffer.enqueue(requestMessage);
                } else {
                    this.dispatchRequest(requestMessage);
                }
            };

            const delay = (this.environment?.rttDelayMs ?? 0) / 2;
            if (delay > 0) {
                setTimeout(send, delay);
            } else {
                send();
            }
        });
    }

    /**
     * [App -> Web] 네이티브 단방향 이벤트를 감시할 핸들러 함수를 바인딩합니다.
     */
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

    /**
     * [Internal] 드롭률 시뮬레이션 설정값에 기인한 메시지 유실 여부를 판단합니다.
     */
    private shouldDrop(): boolean {
        const rate = this.environment?.dropRate ?? 0;
        if (rate <= 0) return false;
        if (rate >= 1) return true;
        const rand = this.environment?.random ?? Math.random;
        return rand() < rate;
    }

    /**
     * 테스트 및 디버깅을 위해 브릿지 런타임 통신 거동을 유도하는 시뮬레이션 변수들을 덮어씁니다.
     */
    public configureEnvironment(config?: EnvironmentConfig): void {
        this.environment = config;
    }

    /**
     * 브릿지 클라이언트 가동 상태를 해제하고, 생성되었던 타이머 및 어댑터 리스너 결합을 제거합니다.
     */
    public destroy(): void {
        // 1. 감지 폴러 및 타이머 제거
        this.clearDetectionTimers();

        // 2. 어댑터 이벤트 결합 해제
        if (this.unsubscribeAdapter) {
            this.unsubscribeAdapter();
            this.unsubscribeAdapter = undefined;
        }

        // 3. 대기 버퍼 큐 비우기
        this.pendingBuffer.clear();

        // 4. 대기(펜딩) 중이었던 프로미스 모두 거절 처리 후 맵 정리
        this.pendingRequests.forEach(pending => {
            if (pending.timeoutId) {
                clearTimeout(pending.timeoutId);
            }
            pending.reject({
                code: 'DESTROYED',
                message: '브릿지 클라이언트가 파괴되어 대기 중인 비동기 약속이 거절되었습니다.',
                requestType: pending.requestType,
                expectedResponseType: pending.expectedResponseType,
                recoverable: false,
            });
        });
        this.pendingRequests.clear();
        this.eventListeners.clear();
        this.isReady = false;
    }

    /**
     * 실행 중에 브릿지의 물리 전송 어댑터를 동적으로 교체합니다.
     */
    public setAdapter(adapter: BridgeAdapter): void {
        if (this.unsubscribeAdapter) {
            this.unsubscribeAdapter();
        }
        this.adapter = adapter;
        this.unsubscribeAdapter = this.adapter.onMessage(this.handleMessage);
    }

    /**
     * [Internal] 웹 호출 규격 데이터를 브릿지 프레임워크 전송 메시지 객체로 포장합니다.
     */
    private createRequestMessage<K extends WebMessageType>(message: WebMessageData<K>): RequestMessage {
        return {
            version: this.version,
            ...message,
            refId: message.refId ?? this.generateRefId(),
        } as unknown as RequestMessage;
    }

    /**
     * [Internal] 기대했던 응답 타입과 다를 때 반환할 오류 규격을 생성합니다.
     */
    private createResponseTypeMismatchError(pending: PendingRequest, actualResponseType?: string): BridgeError {
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

    /**
     * [Internal] 네이티브 브릿지가 가용하지 않은 일반 브라우저에서 요청이 시도되었을 때 반환할 오류 규격을 생성합니다.
     */
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
