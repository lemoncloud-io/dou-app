import type { SocketMessage } from '@lemoncloud/chatic-sockets-lib';

/**
 * 데이터 계층이 의존하는 최소 소켓 규약입니다.
 * 구체 구현(ClientSocketV2 등)은 상위(web) 모듈에서 연결합니다.
 */
export interface ISocketClient {
    request<T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T>;
    send<T = unknown>(message: SocketMessage<T>): void;
    onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void;
}
