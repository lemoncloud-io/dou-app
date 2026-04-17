import { useEffect, useRef } from 'react';

import { useHandleAppMessage } from '@chatic/app-messages';
import { useWebSocketV2Store } from '@chatic/socket';
import { FOREGROUND_RESYNC_EVENT_NAME } from '@chatic/socket-data';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';

const MIN_HIDDEN_MS = 5_000;

/**
 * Triggers WebSocket data re-sync when app returns to foreground.
 * Handles both:
 * - Web tab visibility change (visibilitychange event)
 * - React Native AppState change (OnBackgroundStatusChanged from PR #186)
 */
export const useForegroundResync = (refreshToken: () => Promise<boolean>) => {
    const { isAuthenticated } = useWebCoreStore();
    const hiddenAtRef = useRef<number | null>(null);

    const triggerResync = async () => {
        if (!isAuthenticated) return;

        await refreshToken();

        if (cloudCore.getSelectedCloudId() && cloudCore.getDelegationToken()) {
            void cloudCore.refreshToken();
        }

        const { isConnected, isVerified } = useWebSocketV2Store.getState();
        if (isConnected && isVerified) {
            window.dispatchEvent(new CustomEvent(FOREGROUND_RESYNC_EVENT_NAME));
        }
    };

    // Native AppState: receive OnBackgroundStatusChanged from mobile shell (PR #186)
    useHandleAppMessage('OnBackgroundStatusChanged', message => {
        if (!isAuthenticated) return;
        const { isForeground } = message.data;
        if (isForeground && hiddenAtRef.current) {
            const elapsed = Date.now() - hiddenAtRef.current;
            hiddenAtRef.current = null;
            if (elapsed >= MIN_HIDDEN_MS) {
                void triggerResync();
            }
        } else if (!isForeground) {
            hiddenAtRef.current = Date.now();
        }
    });

    // Browser tab visibility
    useEffect(() => {
        if (!isAuthenticated) return;

        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAtRef.current = Date.now();
            } else if (document.visibilityState === 'visible' && hiddenAtRef.current) {
                const elapsed = Date.now() - hiddenAtRef.current;
                hiddenAtRef.current = null;
                if (elapsed >= MIN_HIDDEN_MS) {
                    void triggerResync();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [isAuthenticated, refreshToken]);
};
