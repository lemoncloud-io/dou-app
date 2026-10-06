import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isNative, logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { toError } from '../../../shared';
import {
    buildAuthorizeUrl,
    createOAuthLoginStart,
    evaluateOAuthDeeplink,
    saveOAuthLoginStart,
    takeOAuthLoginStart,
    type OAuthDeeplinkPayload,
} from '../utils';

/**
 * Social Login (ADR 0009). `start` sends the OAuth Relay authorize URL to a
 * real browser — in the shell via window.open (the window-open handler routes
 * untrusted https to the system browser; in-window navigation is blocked by
 * will-navigate), in a plain browser by direct navigation (admin pattern).
 * `complete` exchanges the relay code for credentials then hydrates the relay
 * session — replacing whatever session (e.g. a Guest Session) was on the device.
 * Mirrors apps/web useOAuthLogin — runtime.session.createCredentialsByProvider commits the session by itself.
 *
 * `start` records that this app began the login, and `completeFromHandoff` is the only way a code that
 * arrived from outside (the deeplink, the hand-off page) gets exchanged: it needs that record. Without
 * it, any link opened on the machine could sign the person in as someone else.
 */
export const useSocialLogin = () => {
    const { t } = useTranslation();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isError, setIsError] = useState(false);
    // The relay code is single-use: guard against double completion
    // (StrictMode re-run, deeplink + hand-off page racing).
    const completingRef = useRef(false);

    const start = useCallback((provider: string) => {
        // Written before the browser opens: the deeplink can come back before this call returns control.
        saveOAuthLoginStart(createOAuthLoginStart(provider, Date.now()));
        const url = buildAuthorizeUrl(provider);
        if (isNative()) window.open(url, '_blank');
        else window.location.assign(url);
    }, []);

    const complete = useCallback(async (provider: string, code: string): Promise<boolean> => {
        if (completingRef.current) return false;
        completingRef.current = true;
        setIsSubmitting(true);
        setIsError(false);
        // In-app login (e.g. a Guest Session linking from the Profile page)
        // swaps the live session — reload so the whole engine (socket, caches,
        // cloud rail) re-bootstraps from the new credentials.
        const wasAuthenticated = runtime.session.getIdentityContext().isAuthenticated;
        try {
            await runtime.boot.startWebTransportInit();
            await runtime.session.createCredentialsByProvider(provider, code);
            // Credential exchange only builds transport credentials — refresh the
            // relay session (syncProfile) to hydrate identity + auth state. Social
            // Login replaces any prior (guest/cloud) session on this device.
            if (wasAuthenticated) window.location.replace('/');
            return true;
        } catch (error) {
            const err = toError(error);
            logger.error('AUTH', '[useSocialLogin] code exchange failed', { error: err });
            setIsError(true);
            completingRef.current = false; // allow a retry with a fresh code
            return false;
        } finally {
            setIsSubmitting(false);
        }
    }, []);

    /**
     * Exchange a code that arrived from outside the app, only if this app started the login.
     * The start record is consumed whatever the verdict, so a link is good once. A refusal never reaches
     * the exchange; it is logged and told to the person, since a login they did start failing silently
     * would read as a broken button.
     */
    const completeFromHandoff = useCallback(
        async (payload: OAuthDeeplinkPayload): Promise<boolean> => {
            // A second delivery of a link already being exchanged must not consume a record it has no claim on.
            if (completingRef.current) return false;
            const verdict = evaluateOAuthDeeplink(takeOAuthLoginStart(), payload, Date.now());
            if (!verdict.ok) {
                logger.warn('AUTH', '[useSocialLogin] ignored an OAuth deeplink', { reason: verdict.reason });
                setIsError(true);
                toast({
                    variant: 'destructive',
                    description: t(verdict.reason === 'expired' ? 'auth.social.expired' : 'auth.social.notStarted'),
                });
                return false;
            }
            return complete(payload.provider, payload.code);
        },
        [complete, t]
    );

    // `complete` stays private: exposing the ungated exchange would let a caller skip the start check.
    return { start, completeFromHandoff, isSubmitting, isError };
};
