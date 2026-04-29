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

/**
 * DataSource 계층에서 사용할 순수 HTTP 통신 인터페이스
 */
export interface IHttpClient {
    /**
     * GET
     * @param path API 경로
     * @param params 쿼리 파라미터
     */
    get<T>(path: string, params?: Record<string, any>): Promise<T>;

    /**
     * POST
     * @param path API 경로
     * @param body 요청 본문
     * @param params 쿼리 파라미터
     */
    post<T>(path: string, body?: Record<string, any>, params?: Record<string, any>): Promise<T>;

    /**
     * PUT 요청을 수행합니다.
     */
    put<T>(path: string, body?: Record<string, any>, params?: Record<string, any>): Promise<T>;

    /**
     * DELETE 요청을 수행합니다.
     */
    delete<T>(path: string, params?: Record<string, any>): Promise<T>;
}
