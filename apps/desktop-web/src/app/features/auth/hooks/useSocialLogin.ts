import { useCallback, useRef, useState } from 'react';

import { isNative, logger } from '@chatic/bridges';
import {
    createCredentialsByProvider,
    getIdentityContext,
    reportError,
    startWebCoreInit,
    useRefreshRelaySession,
} from '@chatic/web-core';

import { toError } from '../../../shared';
import { buildAuthorizeUrl } from '../utils';

/**
 * Social Login (ADR 0009). `start` sends the OAuth Relay authorize URL to a
 * real browser — in the shell via window.open (the window-open handler routes
 * untrusted https to the system browser; in-window navigation is blocked by
 * will-navigate), in a plain browser by direct navigation (admin pattern).
 * `complete` exchanges the relay code for credentials then hydrates the relay
 * session — replacing whatever session (e.g. a Guest Session) was on the device.
 * Mirrors apps/web useOAuthLogin (createCredentialsByProvider + refreshRelaySession).
 */
export const useSocialLogin = () => {
    const { refreshRelaySession } = useRefreshRelaySession();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isError, setIsError] = useState(false);
    // The relay code is single-use: guard against double completion
    // (StrictMode re-run, deeplink + hand-off page racing).
    const completingRef = useRef(false);

    const start = useCallback((provider: string) => {
        const url = buildAuthorizeUrl(provider);
        if (isNative()) window.open(url, '_blank');
        else window.location.assign(url);
    }, []);

    const complete = useCallback(
        async (provider: string, code: string): Promise<boolean> => {
            if (completingRef.current) return false;
            completingRef.current = true;
            setIsSubmitting(true);
            setIsError(false);
            // In-app login (e.g. a Guest Session linking from the Profile page)
            // swaps the live session — reload so the whole engine (socket, caches,
            // cloud rail) re-bootstraps from the new credentials.
            const wasAuthenticated = getIdentityContext().isAuthenticated;
            try {
                await startWebCoreInit();
                await createCredentialsByProvider(provider, code);
                // Credential exchange only builds transport credentials — refresh the
                // relay session (syncProfile) to hydrate identity + auth state. Social
                // Login replaces any prior (guest/cloud) session on this device.
                await refreshRelaySession({ syncProfile: true });
                if (wasAuthenticated) window.location.replace('/');
                return true;
            } catch (error) {
                const err = toError(error);
                logger.error('AUTH', '[useSocialLogin] code exchange failed', { error: err });
                reportError(err);
                setIsError(true);
                completingRef.current = false; // allow a retry with a fresh code
                return false;
            } finally {
                setIsSubmitting(false);
            }
        },
        [refreshRelaySession]
    );

    return { start, complete, isSubmitting, isError };
};
