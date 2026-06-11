import type {
    AppMessageData,
    AppMessageType,
    WebMessageData,
    WebMessageResponse,
    WebMessageType,
} from '@chatic/app-messages';
import type { EnvironmentConfig, IMessageQueue, RequestMessage } from '../common';
import type { BridgeAdapter } from './adapters/types';

/**
 * Web과 App 간의 펜딩 중인 비동기 요청 상태를 나타내는 내부 인터페이스입니다.
 */
export interface PendingRequest {
    /** 성공적으로 응답을 받았을 때 호출할 Resolve 콜백 */
    resolve: (value: any) => void;
    /** 에러가 나거나 타임아웃되었을 때 호출할 Reject 콜백 */
    reject: (reason: any) => void;
    /** 타임아웃 감시용 타이머 ID */
    timeoutId?: ReturnType<typeof setTimeout>;
    /** 이 요청에 지정된 최대 대기 시간(ms) */
    timeoutMs: number;
    /** 웹이 요청한 원래 메시지 타입 */
    requestType: WebMessageType;
    /** 네이티브가 보내줘야 하는 기대 응답 메시지 타입 */
    expectedResponseType: AppMessageType;
}

/**
 * WebBridgeClient 생성을 위한 설정 스펙입니다.
 */
export interface WebBridgeClientConfig {
    /** 사용할 실제 물리 통신 어댑터 */
    adapter: BridgeAdapter;
    /** 브릿지 프로토콜 버전 (기본값: 라이브러리 내장 프로토콜 버전) */
    version?: string;
    /** 기본 요청 타임아웃 시간 (기본값: 10000ms) */
    timeoutMs?: number;
    /** 네이티브 브릿지 준비 대기 타임아웃 시간 (기본값: 10000ms) */
    bridgeReadyTimeoutMs?: number;
    /** 현재 환경에서 네이티브 브릿지가 주입되었는지 여부를 확인하는 함수 (기본값: window 객체 자동 검출) */
    isBridgeAvailable?: () => boolean;
    /** 브릿지 준비 전까지 요청을 버퍼링하는 메시지 큐 (기본값: in-memory MessageQueue) */
    pendingBuffer?: IMessageQueue<RequestMessage>;
    /** 테스트/시뮬레이션용 환경 설정 옵션 */
    environment?: EnvironmentConfig;
}

/**
 * Web 환경에서 App(Native)과 통신하기 위한 브릿지 클라이언트 표준 인터페이스입니다.
 */
export interface IWebBridgeClient {
    /**
     * [Web -> App] 응답을 기다리지 않는 단방향 메시지 전송 (Fire-and-Forget)
     * @param message 전송할 WebMessage 규격의 객체
     */
    post<K extends WebMessageType>(message: WebMessageData<K>): void;

    /**
     * [Web -> App] 앱에 요청을 보내고 상응하는 성공 응답을 비동기로 대기합니다. (Request-Response)
     * 브릿지 에러 및 네이티브 핸들러 에러 발생 시 reject됩니다.
     * @param message 전송할 WebMessage 규격의 객체
     * @param options 추가 옵션 (예: 개별 timeoutMs 지정)
     */
    request<K extends WebMessageType>(
        message: WebMessageData<K>,
        options?: { timeoutMs?: number }
    ): Promise<WebMessageResponse<K>>;

    /**
     * [App -> Web] 네이티브 앱에서 자발적으로 발생하는 단방향 이벤트를 구독합니다. (Event Subscription)
     * @param type 구독할 AppMessage 타입
     * @param handler 이벤트를 수신할 콜백 함수
     * @returns 구독을 해제하는 정리(unsubscribe) 함수
     */
    onEvent<K extends AppMessageType>(type: K, handler: (message: AppMessageData<K>) => void): () => void;

    /**
     * 테스트 및 디버깅을 위해 브릿지 실행 환경(지연, 드롭, 강제 실패 등)을 런타임에 동적으로 변경합니다.
     * @param config 변경할 환경 설정 객체 (생략하거나 undefined 주입 시 기본 상태로 복원)
     */
    configureEnvironment(config?: EnvironmentConfig): void;

    /**
     * 브릿지 클라이언트를 해제하고 폴링 타이머 및 등록된 이벤트 리스너를 정리합니다. (메모리 누수 방지)
     */
    destroy(): void;
}
