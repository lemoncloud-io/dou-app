import { useCallback, useEffect, useRef } from 'react';

import { useOnBackgroundStatusChanged } from './useHandleAppMessage';

const VISIBILITY_DEDUP_MS = 1_000;

export const useAppVisibility = (handler: (isForeground: boolean) => void): void => {
    const handlerRef = useRef(handler);
    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    const lastEmittedAtRef = useRef<{ foreground: number; background: number }>({ foreground: 0, background: 0 });
    const emitVisibility = useCallback((isForeground: boolean) => {
        const direction = isForeground ? 'foreground' : 'background';
        const now = Date.now();
        if (now - lastEmittedAtRef.current[direction] < VISIBILITY_DEDUP_MS) return;
        lastEmittedAtRef.current[direction] = now;
        handlerRef.current(isForeground);
    }, []);

    useOnBackgroundStatusChanged(message => emitVisibility(message.data.isForeground));

    useEffect(() => {
        const handleVisibilityChange = () => emitVisibility(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [emitVisibility]);
};
