import { useEffect, useMemo } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import type { IWebSocketClient, MutableRepositoryContext, SocketContext, SocketDispatcher } from '@chatic/data';
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
export const useDataSocket = ({
    context,
    dispatcher,
}: {
    context: MutableRepositoryContext;
    dispatcher: SocketDispatcher;
}): IWebSocketClient => {
    const { emitAuthenticated } = useWebSocketV2();
    const lastMessage = useWebSocketV2Store((state: { lastMessage?: WSSEnvelope | null }) => state.lastMessage) ?? null;
    const currentCloudId = context.getContext().cid ?? 'default';

    // SocketDispatcher는 RepositoryContext 전체가 아니라 cloudId만 필요로 하므로 SocketContext로 축소해 주입합니다.
    const socketContext = useMemo<SocketContext>(() => createSocketContext(context), [context, currentCloudId]);

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

        dispatcher.dispatch(lastMessage, socketContext);
    }, [dispatcher, lastMessage, socketContext]);

    return wssClient;
};
