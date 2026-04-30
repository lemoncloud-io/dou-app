import type { WSSActionType, WSSEventDomainType } from '@lemoncloud/chatic-sockets-api';

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
