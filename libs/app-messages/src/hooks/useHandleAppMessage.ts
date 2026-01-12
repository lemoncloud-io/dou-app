import { useCallback, useEffect, useRef } from 'react';

import { useAppMessageStore } from '../stores';

import type { MessageHandler } from '../stores';
import type { AppMessage, AppMessageType } from '../types';

export const useHandleAppMessage = <T extends AppMessageType>(type: T, handler: MessageHandler<T>) => {
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
