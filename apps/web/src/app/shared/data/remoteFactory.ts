import { useCallback, useEffect, useMemo } from 'react';
import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import type { IEventBus, ISocketDispatcher, IWebSocketClient, SocketEventMap } from '@chatic/data';
import { createRemoteDataSources, type DomainEventMap, SocketDispatcher } from '@chatic/data';
import type { WSSActionType, WSSEventDomainType } from '@lemoncloud/chatic-sockets-api';

/**
 * WebSocket 수신 메시지를 Dispatcher로 동기적으로 전달하는 전용 훅.
 *
 * 기존 useEffect + lastMessage 패턴은 React 배칭으로 인해
 * 빠르게 연속 도착하는 메시지가 유실될 수 있었음.
 * Zustand subscribe를 직접 사용하여 setLastMessage 호출 시점에
 * 동기적으로 dispatch하여 모든 메시지를 처리합니다.
 */
const useSocketListener = (dispatcher: ISocketDispatcher) => {
    useEffect(() => {
        const unsubscribe = useWebSocketV2Store.subscribe(
            s => s.lastMessage,
            lastMessage => {
                if (lastMessage) {
                    dispatcher.dispatch(lastMessage);
                }
            }
        );
        return unsubscribe;
    }, [dispatcher]);
};

/**
 * IWebSocketClient 인터페이스를 구현하는 송신 객체 생성 훅
 */
const useSocketEmitter = (): IWebSocketClient => {
    const { emitAuthenticated } = useWebSocketV2();

    const send = useCallback(
        (domain: WSSEventDomainType, action: WSSActionType, payload: unknown, ref?: string) => {
            emitAuthenticated({
                type: domain,
                action,
                payload,
                meta: ref ? { ref, ts: Date.now() } : undefined,
            });
        },
        [emitAuthenticated]
    );

    return useMemo(() => ({ send }), [send]);
};

/**
 * 소켓 계층의 생성과 주입을 담당하는 팩토리 훅
 */
export const useSocketFactory = (dispatcher: ISocketDispatcher): { wssClient: IWebSocketClient } => {
    useSocketListener(dispatcher);
    const wssClient = useSocketEmitter();
    return { wssClient };
};

export const useRemoteDataSourcesFactory = ({
    socketEventBus,
    domainEventBus,
}: {
    socketEventBus: IEventBus<SocketEventMap>;
    domainEventBus: IEventBus<DomainEventMap>;
}) => {
    //  Dispatcher 생성
    const dispatcher = useMemo(() => new SocketDispatcher(socketEventBus), [socketEventBus]);

    // 소켓 클라이언트 및 리스너 연결
    const { wssClient } = useSocketFactory(dispatcher);

    //  RemoteDataSource 조립
    const remoteDataSources = useMemo(
        () => createRemoteDataSources({ domainEventBus, socketEventBus, wssClient }),
        [domainEventBus, socketEventBus, wssClient]
    );

    return { remoteDataSources };
};
