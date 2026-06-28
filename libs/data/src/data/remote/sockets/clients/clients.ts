import type { SocketMessage } from '@lemoncloud/chatic-sockets-lib';

/**
 * Inbound dispatcher와 socket lifecycle bridge가 의존하는 최소 소켓 규약입니다.
 * RemoteDataSource는 더 이상 이 타입을 사용하지 않고 gateway만 사용합니다.
 */
export interface ISocketClient {
    request<T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T>;
    send<T = unknown>(message: SocketMessage<T>): void;
    onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void;
}
