import type { ClientSocketMessageEvent, ClientSocketState, SocketMessage } from '@lemoncloud/chatic-sockets-lib';
import type { ISocketClient } from '../../sockets';

/**
 * SocketClient의 목업 구현체입니다.
 * 테스트 환경에서 사용되며, 메서드 호출 추적 및 응답 시뮬레이션 기능을 제공합니다.
 */
export class MockSocketClient implements ISocketClient {
    // state 및 기타 필드
    state: ClientSocketState = 'connected';
    deviceDefaults?: any;
    timerScheduler?: any;
    keepAlive?: any;
    reconnect?: any;

    // 리스너 저장
    private messageListeners: Array<(event: ClientSocketMessageEvent) => void> = [];
    private typeListeners: Map<string, Array<(msg: SocketMessage) => void>> = new Map();

    // 메서드 호출 추적
    send = jest.fn<void, [any?, any?]>();
    request = jest.fn<Promise<any>, [any, any?, any?]>();
    connect = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
    disconnect = jest.fn<Promise<void>, [number?, string?]>().mockResolvedValue(undefined);
    onState = jest.fn<() => void, [any]>().mockReturnValue(() => undefined);
    onError = jest.fn<() => void, [any]>().mockReturnValue(() => undefined);
    destroy = jest.fn<void, []>();

    constructor() {
        // 기본적으로 request는 빈 객체를 resolve하는 Promise를 반환
        this.request.mockResolvedValue({});
    }

    onMessage(listener: (event: ClientSocketMessageEvent) => void): () => void {
        this.messageListeners.push(listener);
        return () => {
            this.messageListeners = this.messageListeners.filter(l => l !== listener);
        };
    }

    onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void {
        if (!this.typeListeners.has(type)) {
            this.typeListeners.set(type, []);
        }
        this.typeListeners.get(type)!.push(listener as (msg: SocketMessage) => void);
        return () => {
            const listeners = this.typeListeners.get(type)?.filter(l => l !== listener);
            this.typeListeners.set(type, listeners || []);
        };
    }

    // --- 테스트용 헬퍼 메서드 ---

    /**
     * 테스트에서 가짜 소켓 메시지 수신을 시뮬레이션합니다.
     * @param message 시뮬레이션할 SocketMessage
     */
    _simulateIncomingMessage<T>(message: SocketMessage<T>) {
        const event: ClientSocketMessageEvent<T> = {
            message,
            raw: JSON.stringify(message),
        };

        // onMessage 리스너들에게 전달
        [...this.messageListeners].forEach(listener => listener(event));

        // onType 리스너들에게 전달
        const typeListeners = this.typeListeners.get(message.type) || [];
        [...typeListeners].forEach(listener => listener(message));
    }

    /**
     * 특정 요청(request)에 대한 목업 응답을 설정합니다.
     * @param type 요청 타입
     * @param response 반환할 응답 데이터
     */
    _setMockResponse(type: string, response: unknown) {
        this.request.mockImplementation(async reqType => {
            if (reqType === type) {
                return response;
            }
            return {};
        });
    }
}
