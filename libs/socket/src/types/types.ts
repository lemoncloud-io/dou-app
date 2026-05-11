import type { SocketMessage } from '@lemoncloud/chatic-sockets-api';

/**
 * ClientSocketV2의 연결 상태를 나타냅니다.
 TODO: 이후 서버에서 내려주는 에러 타입 고려
 */
export type ClientSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * ClientSocketV2에서 발생하는 에러 정보를 나타냅니다.
 * TODO: 이후 서버에서 내려주는 에러 타입 고려
 */
export interface ClientSocketError {
    /** 에러 코드 */
    code: number;
    /** 에러 메시지 */
    reason: string;
    /** 에러가 재연결로 해결될 수 있는지 여부 */
    willReconnect: boolean;
}

/**
 * v2 웹소켓의 순수한 네트워크 전송 계층 인터페이스입니다.
 * 실제 웹소켓 연결을 관리하고 원시 문자열 메시지를 송수신합니다.
 * TODO: 이후 서버에서 내려주는 타입 고려
 */
export interface ClientSocketV2 {
    /**
     * 서버에 연결을 시도합니다.
     */
    connect(): Promise<void>;

    /**
     * 연결을 종료합니다.
     * @param code WebSocket close 코드 (선택)
     * @param reason 종료 사유 (선택)
     */
    disconnect(code?: number, reason?: string): Promise<void>;

    /**
     * 현재 연결 상태를 반환합니다.
     */
    isConnected(): boolean;

    /**
     * SocketMessage를 서버로 전송합니다. 응답을 기다리지 않습니다.
     * @param message 전송할 SocketMessage
     */
    send<T = unknown>(message: SocketMessage<T>): void;

    /**
     * 모든 수신 SocketMessage에 대한 리스너를 등록합니다.
     * @param listener 메시지를 처리할 콜백 함수
     * @returns 리스너를 제거하는 함수
     */
    onMessage<T = unknown>(listener: (message: SocketMessage<T>) => void): () => void;

    /**
     * 연결 상태 변경에 대한 리스너를 등록합니다.
     * @param listener 상태 변경을 처리할 콜백 함수
     * @returns 리스너를 제거하는 함수
     */
    onStatus(listener: (status: ClientSocketStatus) => void): () => void;

    /**
     * 소켓 에러에 대한 리스너를 등록합니다.
     * @param listener 에러를 처리할 콜백 함수
     * @returns 리스너를 제거하는 함수
     */
    onError(listener: (error: ClientSocketError) => void): () => void;
}
