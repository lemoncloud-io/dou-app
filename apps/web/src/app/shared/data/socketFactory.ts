import { useEffect, useMemo } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import {
    SocketDispatcher,
    type EventBusEngine,
    type IWebSocketClient,
    type MutableRepositoryContext,
    type SocketContext,
    type SocketEventMap,
} from '@chatic/data';
import type { WSSActionType, WSSEnvelope, WSSEventDomainType } from '@lemoncloud/chatic-sockets-api';

const createSocketContext = (context: MutableRepositoryContext): SocketContext => ({
    cloudId: context.getContext().cid ?? 'default',
});

/**
 * WebSocket 송수신을 Repository 파이프라인과 연결합니다.
 *
 * 발신:
 * RemoteDataSource가 IWebSocketClient.send를 호출하면 useWebSocketV2의 인증 발신으로 변환합니다.
 *
 * 수신:
 * WebSocket worker가 받은 envelope를 SocketDispatcher로 전달합니다.
 * 이후 흐름은 socketEventBus -> RemoteDataSource -> domainEventBus -> SocketRequestManager 순서입니다.
 */
const useDataSocket = ({
    context,
    dispatcher,
}: {
    context: MutableRepositoryContext;
    dispatcher: SocketDispatcher;
}): IWebSocketClient => {
    const { emitAuthenticated } = useWebSocketV2();
    const lastMessage = useWebSocketV2Store((state: { lastMessage?: WSSEnvelope | null }) => state.lastMessage) ?? null;
    // RemoteDataSource는 IWebSocketClient만 의존한다.
    // web에서는 useWebSocketV2의 emitAuthenticated를 해당 인터페이스로 어댑팅한다.
    const wssClient = useMemo<IWebSocketClient>(
        () => ({
            send: (domain: WSSEventDomainType, action: WSSActionType, payload: unknown, ref?: string) => {
                emitAuthenticated({
                    type: domain,
                    action,
                    payload,
                    meta: ref ? { ref, ts: Date.now() } : undefined,
                });
            },
        }),
        [emitAuthenticated]
    );

    useEffect(() => {
        if (!lastMessage) return;

        // 메시지를 실제로 처리하는 시점에 holder를 다시 읽어, cid 변경 직후 수신된 envelope도 최신 SocketContext로 dispatch합니다.
        const socketContext: SocketContext = createSocketContext(context);
        dispatcher.dispatch(lastMessage, socketContext);
    }, [context, dispatcher, lastMessage]);

    return wssClient;
};

/**
 * 소켓 계층에 필요한 생성과 context 주입을 한 곳에서 처리합니다.
 * DataProvider는 socketEventBus와 Repository context만 넘기고, dispatcher/wssClient 조립은 이 factory에 위임합니다.
 */
export const useSocketFactory = ({
    context,
    socketEventBus,
}: {
    context: MutableRepositoryContext;
    socketEventBus: EventBusEngine<SocketEventMap>;
}): { wssClient: IWebSocketClient } => {
    const dispatcher = useMemo(() => new SocketDispatcher(socketEventBus), [socketEventBus]);
    const wssClient = useDataSocket({ context, dispatcher });

    return { wssClient };
};
