import type { WSSActionType, WSSEventDomainType } from '@lemoncloud/chatic-sockets-api';
import type { SocketMessage } from '@lemoncloud/chatic-sockets-lib';

/**
 * DataSource 계층에서 사용할 순수 소켓 통신 인터페이스
 */
export interface IWebSocketClient {
    /**
     * 서버로 메시지를 전송합니다.
     * 내부적으로 연결 및 인증 상태를 확인한 후 안전하게 발신(emitAuthenticated)해야 합니다.
     */
    send<T>(domain: WSSEventDomainType, action: WSSActionType, payload: T, ref?: string): void;
}

/** 지원하는 HTTP Method 명세 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * API 요청 시 필요한 모든 설정을 담는 객체
 */
export interface HttpRequestConfig {
    method: HttpMethod;
    path: string;
    params?: Record<string, any>;
    body?: any;
    headers?: Record<string, string>;
    timeout?: number;
}

/**
 * DataSource 계층에서 사용할 단일화된 HTTP 통신 인터페이스
 */
export interface IHttpClient {
    /**
     * 단일 send 메서드를 통해 모든 HTTP 요청을 처리합니다.
     *
     * @example
     * const data = await httpClient.send<MyResponseType>({
     *     method: 'POST',
     *     path: '/v1/users',
     *     body: { name: 'John' },
     *     headers: { 'X-Custom-Header': 'value' }
     * });
     */
    send<T>(config: HttpRequestConfig): Promise<T>;
}

/**
 * v2 웹소켓 클라이언트의 상위 계층 인터페이스입니다.
 * SocketMessage 형식의 메시지 송수신, 요청-응답 매칭, 이벤트 리스닝 기능을 제공합니다.
 * 연결 상태 관리는 하위 ClientSocketV2에 위임합니다.
 */
export interface ISocketClient {
    /**
     * SocketMessage를 서버로 전송합니다. 응답을 기다리지 않습니다.
     * @param message 전송할 SocketMessage
     */
    send<T = unknown>(message: SocketMessage<T>): void;

    /**
     * 특정 타입의 요청을 보내고 응답을 기다립니다.
     * 내부적으로 'mid'를 사용하여 요청과 응답을 매칭합니다.
     * @param type 요청 타입 (예: 'chat.create')
     * @param data 요청 데이터 (선택)
     * @param meta 추가 메타데이터 (선택)
     * @returns 서버 응답 데이터를 포함하는 Promise
     */
    emit<T = unknown, R = unknown>(type: string, data?: T, meta?: Record<string, unknown>): Promise<R>;

    /**
     * 인증된 특정 타입의 요청을 보내고 응답을 기다립니다.
     * 내부적으로 'mid'를 사용하여 요청과 응답을 매칭합니다.
     * @param type 요청 타입 (예: 'chat.create')
     * @param data 요청 데이터 (선택)
     * @param meta 추가 메타데이터 (선택)
     * @returns 서버 응답 데이터를 포함하는 Promise
     */
    emitAuthenticated<T = unknown, R = unknown>(type: string, data?: T, meta?: Record<string, unknown>): Promise<R>;

    /**
     * 모든 수신 SocketMessage에 대한 리스너를 등록합니다.
     * @param listener 메시지를 처리할 콜백 함수
     * @returns 리스너를 제거하는 함수
     */
    onMessage<T = unknown>(listener: (message: SocketMessage<T>) => void): () => void;

    /**
     * 특정 타입의 SocketMessage에 대한 리스너를 등록합니다.
     * @param type 구독할 메시지 타입
     * @param listener 메시지를 처리할 콜백 함수
     * @returns 리스너를 제거하는 함수
     */
    onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void;
}
