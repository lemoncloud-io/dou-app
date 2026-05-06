import { useEffect, useMemo, useCallback } from 'react';
import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import type { ISocketDispatcher, IWebSocketClient } from '@chatic/data';
import type { WSSActionType, WSSEnvelope, WSSEventDomainType } from '@lemoncloud/chatic-sockets-api';

/**
 * WebSocket 수신 메시지를 Dispatcher로 전달하는 전용 훅
 */
const useSocketListener = (dispatcher: ISocketDispatcher) => {
    const lastMessage = useWebSocketV2Store((state: { lastMessage?: WSSEnvelope | null }) => state.lastMessage) ?? null;

    useEffect(() => {
        if (lastMessage) {
            dispatcher.dispatch(lastMessage);
        }
    }, [dispatcher, lastMessage]);
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
