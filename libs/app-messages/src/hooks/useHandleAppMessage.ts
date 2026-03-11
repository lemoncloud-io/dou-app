import { useCallback, useEffect, useRef } from 'react';

import { useAppMessageStore } from '../stores';

import type { MessageHandler } from '../stores';
import type { AppMessage, AppMessageType } from '../types';

/**
 * 특정 메시지를 구독하기 위한 React Hook
 *
 * @example```
 * useHandleAppMessage('OnOpenShareSheet', (message) => {
 *     console.log('공유 시트 열기 요청 받음:', message.data);
 *  });
 * ```
 *
 * @param type 구독할 메시지 타입
 * @param handler 메시지 핸들러
 *
 */
export const useHandleAppMessage: <T extends AppMessageType>(type: T, handler: MessageHandler<T>) => void = <
    T extends AppMessageType,
>(
    type: T,
    handler: MessageHandler<T>
) => {
    const { addHandler, removeHandler } = useAppMessageStore();
    const handlerRef = useRef(handler);

    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    const memoizedHandler = useCallback((message: Extract<AppMessage, { type: T }>) => {
        handlerRef.current(message);
    }, []);

    useEffect(() => {
        addHandler(type, memoizedHandler);
        return () => removeHandler(type, memoizedHandler);
    }, [type, addHandler, removeHandler, memoizedHandler]);
};
