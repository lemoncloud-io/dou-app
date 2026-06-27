import { useCallback, useEffect, useRef, useState } from 'react';

import { useWebCoreStore } from '@chatic/web-core';

import { DEBUG_STORAGE_KEY } from '../consts';

const TAP_THRESHOLD = 10;
const TAP_RESET_MS = 3000;

const readEnabled = () => sessionStorage.getItem(DEBUG_STORAGE_KEY) === 'true';

/**
 * Controls the hidden debug-mode gate.
 *
 * - `isEnabled`: whether debug tools are currently unlocked (sessionStorage-backed).
 * - `registerTap`: tap the app version 10 times within 3s to unlock debug mode.
 * - `disable`: lock debug tools again.
 *
 * Debug mode is automatically cleared on logout.
 */
export const useDebugMode = () => {
    const [isEnabled, setIsEnabled] = useState(readEnabled);
    const tapCountRef = useRef(0);
    const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const registerLogoutCallback = useWebCoreStore(s => s.registerLogoutCallback);

    useEffect(
        () => registerLogoutCallback(() => sessionStorage.removeItem(DEBUG_STORAGE_KEY)),
        [registerLogoutCallback]
    );

    useEffect(() => {
        return () => {
            if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        };
    }, []);

    const registerTap = useCallback(() => {
        tapCountRef.current += 1;
        if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        tapTimerRef.current = setTimeout(() => {
            tapCountRef.current = 0;
        }, TAP_RESET_MS);

        if (tapCountRef.current >= TAP_THRESHOLD) {
            tapCountRef.current = 0;
            sessionStorage.setItem(DEBUG_STORAGE_KEY, 'true');
            setIsEnabled(true);
        }
    }, []);

    const disable = useCallback(() => {
        sessionStorage.removeItem(DEBUG_STORAGE_KEY);
        setIsEnabled(false);
    }, []);

    return { isEnabled, registerTap, disable };
};
