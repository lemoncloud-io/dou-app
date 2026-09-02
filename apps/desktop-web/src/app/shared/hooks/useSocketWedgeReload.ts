import { useEffect, useRef } from 'react';

import { isNative, logger } from '@chatic/bridges';
import { getSocketManager, useRuntimeSocketState } from '@chatic/app-runtime';
import { useSessionAuth } from '@chatic/app-runtime';

// After a long sleep the cloud token refresh 400s and the socket sticks at
// isVerified=false: useCloudTokenRefresh's isAuthError path clears creds and
// keeps re-emitting the expired token, so it loops forever and live messages
// (hence same-cloud OS notifications) stop arriving until a manual reload. A
// full page reload recovers because it re-bootstraps AWSCore credentials
// ("initialized with token!"), which the refresh endpoint then accepts.
//
// Reproduce that reload automatically: when a socket that verified at least once
// this session stays unverified past the grace window, reload once. Electron
// only (isNative) — in a plain browser tab the page is the user's own and must
// never be auto-reloaded out from under them.
const WEDGE_GRACE_MS = 25_000; // let the normal recovery (supervisor probe,
// auth.update retries ~14s, periodic refresh) run before we force a reload.
const RELOAD_GUARD_MS = 5 * 60_000; // never auto-reload more than once per 5 min:
// if a reload didn't fix it, it's a genuine expiry, not a stale credential.
const RELOAD_AT_KEY = 'chatic:wedge-reload-at';

const readReloadAt = (): number => {
    try {
        return Number(sessionStorage.getItem(RELOAD_AT_KEY)) || 0;
    } catch {
        return 0; // private mode / storage disabled
    }
};

/**
 * Self-heal a socket wedged unverified after sleep/wake by reloading the Electron
 * renderer — the automatic equivalent of the user's manual ctrl+r. No-op in a
 * plain browser and until the socket has verified at least once this session
 * (so a slow cold start is never mistaken for a wedge).
 */
export const useSocketWedgeReload = (): void => {
    const { isAuthenticated } = useSessionAuth();
    const { isVerified } = useRuntimeSocketState();
    // Arm only against a regression: verified once, then lost it.
    const hasVerifiedRef = useRef(false);

    useEffect(() => {
        if (!isNative()) return;

        if (isVerified) {
            hasVerifiedRef.current = true;
            // Recovered — clear the guard so a later sleep episode can recover too.
            try {
                sessionStorage.removeItem(RELOAD_AT_KEY);
            } catch {
                /* ignore */
            }
            return;
        }

        // Wedge counts only once we've been verified and the user is still logged
        // in (web-core auth survives the socket-level verify loss).
        if (!hasVerifiedRef.current || !isAuthenticated) return;

        const timer = setTimeout(() => {
            if (getSocketManager().getSnapshot().isVerified) return; // recovered meanwhile

            const lastReloadAt = readReloadAt();
            if (lastReloadAt && Date.now() - lastReloadAt < RELOAD_GUARD_MS) return;

            logger.warn('AUTH', '[wedge-reload] socket unverified past grace after wake — reloading');
            try {
                sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
            } catch {
                /* ignore */
            }
            window.location.reload();
        }, WEDGE_GRACE_MS);

        return () => clearTimeout(timer);
    }, [isAuthenticated, isVerified]);
};
