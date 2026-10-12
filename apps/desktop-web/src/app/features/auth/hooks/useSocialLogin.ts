import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isNative, logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import type { LinkedAccountsView, LinkVerifiedView } from '@lemoncloud/chatic-backend-api';

import { socketErrorStatus, toError } from '../../../shared';
import {
    buildAuthorizeUrl,
    createOAuthLoginStart,
    ensureDeviceSession,
    evaluateOAuthDeeplink,
    saveOAuthLoginStart,
    takeOAuthLoginStart,
    type OAuthDeeplinkPayload,
    type OAuthStartIntent,
} from '../utils';

/** The toast a refused or failed link shows. */
type LinkFailure = 'occupied' | 'typeLinked' | 'failed';

const linkFailureKey: Record<LinkFailure, string> = {
    occupied: 'account.signIn.link.occupied',
    typeLinked: 'account.signIn.link.typeLinked',
    failed: 'account.signIn.link.failed',
};

/** Why `verify` refused. Only verify names the reason; `link` maps confirm's statuses itself. */
const refusalOf = (check: LinkVerifiedView): LinkFailure =>
    check.reason === 'occupied' ? 'occupied' : check.reason === 'type-linked' ? 'typeLinked' : 'failed';

/**
 * Record that this app began the round trip, then send the browser to the relay. The record is written
 * before the browser opens: the deeplink can come back before this returns.
 */
const openAuthorize = (provider: string, intent: OAuthStartIntent, account?: string): void => {
    const record = createOAuthLoginStart(provider, Date.now(), intent, account);
    saveOAuthLoginStart(record);
    const url = buildAuthorizeUrl(provider, record.nonce);
    if (isNative()) window.open(url, '_blank');
    else window.location.assign(url);
};

/**
 * The relay user id of the account signed in here, or null for no session or a device (guest) one:
 * linking hangs a credential on an account, and a guest has none to hang it on.
 */
const signedInAccountId = (): string | null => {
    if (!runtime.session.getIdentityContext().isAuthenticated) return null;
    const user = runtime.session.getRelaySessionUser() as { id?: unknown; userRole?: string } | null;
    if (!user || user.userRole === 'guest' || typeof user.id !== 'string') return null;
    return user.id;
};

/**
 * Social Login. `start` sends the OAuth Relay authorize URL to a
 * real browser — in the shell via window.open (the window-open handler routes
 * untrusted https to the system browser; in-window navigation is blocked by
 * will-navigate), in a plain browser by direct navigation (admin pattern).
 * `complete` exchanges the relay code for credentials then hydrates the relay
 * session — replacing whatever session (e.g. a Guest Session) was on the device.
 * Mirrors apps/web useOAuthLogin — runtime.session.createCredentialsByProvider commits the session by itself.
 *
 * `start` registers the device first when there is no session — the backend's sign-in contract expects a
 * device session first — and only then records and opens the browser.
 *
 * `start` records that this app began the login and sends the record's nonce along with the relay
 * round trip; `completeFromHandoff` is the only way a code that arrived from outside (the deeplink,
 * the hand-off page) gets exchanged: it needs that record and the nonce coming back with the code.
 * Without them, any link opened on the machine could sign the person in as someone else.
 *
 * `startLink` runs the same round trip for an account that is already signed in, recording the intent
 * `link`: the code that comes back is then sent to `auth.link-account` (social, verify then confirm,
 * the same code both times) instead of being exchanged for a session. The session never changes, so
 * nothing reloads; the relay user's `link$` is patched from the server's answer for the account hub.
 */
export const useSocialLogin = () => {
    const { t } = useTranslation();
    const { deviceId } = runtime.session.useDynamicDeviceId();
    const { mutateAsync: loginGuest } = runtime.session.useLoginRelayGuestByDevice();
    const { auth } = runtime.data.useRuntimeRepositories();
    const [isStarting, setIsStarting] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isError, setIsError] = useState(false);
    // Guard against double completion (StrictMode re-run, deeplink + hand-off page racing): a login
    // would exchange the code twice, a link would send it to the server twice.
    const completingRef = useRef(false);
    const startingRef = useRef(false);
    // Registering the device flips the router to the signed-in branch, which unmounts the Welcome page
    // that called `start` while the registration is still being awaited.
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const start = useCallback(
        async (provider: string): Promise<boolean> => {
            if (startingRef.current) return false;
            startingRef.current = true;
            setIsStarting(true);
            setIsError(false);
            try {
                await ensureDeviceSession(() => loginGuest(deviceId));
            } catch (error) {
                const err = toError(error);
                logger.error('AUTH', '[useSocialLogin] device registration failed', { error: err });
                if (mountedRef.current) setIsError(true);
                return false;
            } finally {
                startingRef.current = false;
                if (mountedRef.current) setIsStarting(false);
            }
            // Written after the registration, so the ten-minute window is not spent on it.
            openAuthorize(provider, 'login');
            return true;
        },
        [deviceId, loginGuest]
    );

    /** Link a provider account to the account signed in here. No device registration: there is a session. */
    const startLink = useCallback((provider: string): boolean => {
        const account = signedInAccountId();
        if (!account) return false;
        openAuthorize(provider, 'link', account);
        return true;
    }, []);

    const link = useCallback(
        async (provider: string, code: string, account: string | undefined): Promise<boolean> => {
            if (completingRef.current) return false;
            completingRef.current = true;
            setIsSubmitting(true);
            setIsError(false);
            const fail = (failure: LinkFailure) => {
                setIsError(true);
                // A link is always one the person pressed for, from either side of the hand-off.
                toast({ variant: 'destructive', description: t(linkFailureKey[failure]) });
                completingRef.current = false;
                return false;
            };
            try {
                // Checked here, not only on the button: the session may have changed while the browser was
                // open. The code goes only to the account that pressed the button, never to whoever is
                // signed in now — on a shared machine that would hand one person's Google to another.
                const signedIn = signedInAccountId();
                if (!signedIn || signedIn !== account) {
                    logger.warn('AUTH', '[useSocialLogin] link deeplink arrived for another session', {
                        signedIn: !!signedIn,
                    });
                    return fail('failed');
                }
                await runtime.boot.startWebTransportInit();
                const tokens = { provider, code };
                // Verify first: it is the only answer that names why a link is refused. The code is not
                // single-use, so confirm sends it again.
                const check = await auth.verifySocialAccount(tokens);
                if (!check.linkable) {
                    logger.warn('AUTH', '[useSocialLogin] social link refused', { reason: check.reason });
                    return fail(refusalOf(check));
                }
                const linked = await auth.confirmSocialAccount(tokens);
                const current = (runtime.session.getRelaySessionUser() as { link$?: LinkedAccountsView } | null)?.link$;
                runtime.session.patchRelaySessionUser({
                    link$: {
                        ...current,
                        social: { provider: linked.provider ?? provider, hint: linked.hint, linkedAt: Date.now() },
                    },
                });
                toast({ description: t('account.signIn.link.done') });
                completingRef.current = false;
                return true;
            } catch (error) {
                const status = socketErrorStatus(error);
                logger.error('AUTH', `[useSocialLogin] social link failed (status=${status ?? '-'})`, { error });
                // 409 is the occupied account. A 403 from confirm can also mean the session is not a main
                // user, so it is not read as "a social account is already linked" — only verify says that.
                return fail(status === 409 ? 'occupied' : 'failed');
            } finally {
                setIsSubmitting(false);
            }
        },
        [auth, t]
    );

    const complete = useCallback(
        async (provider: string, code: string, notifyFailure: boolean): Promise<boolean> => {
            if (completingRef.current) return false;
            completingRef.current = true;
            setIsSubmitting(true);
            setIsError(false);
            // Starting registers the device first, so a login begun from Welcome or Profile alike usually
            // finds a Guest Session here. Replacing the live session reloads, so the whole engine (socket, caches,
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
                // A login the person started must not fail silently.
                if (notifyFailure) toast({ variant: 'destructive', description: t('auth.social.failed') });
                completingRef.current = false; // allow a retry with a fresh code
                return false;
            } finally {
                setIsSubmitting(false);
            }
        },
        [t]
    );

    /**
     * Exchange a code that arrived from outside the app, only if this app started the login.
     * The start record is consumed whatever the verdict, so a link is good once. A refusal never reaches
     * the exchange; it is logged and told to the person, since a login they did start failing silently
     * would read as a broken button. A failed exchange is toasted only for a caller that asks (`notifyFailure`):
     * the deeplink listener has no screen of its own, the hand-off page draws a failure screen and would show it twice.
     */
    const completeFromHandoff = useCallback(
        async (payload: OAuthDeeplinkPayload, { notifyFailure = false } = {}): Promise<OAuthStartIntent | false> => {
            // A second delivery of a link already being exchanged must not consume a record it has no claim on.
            if (completingRef.current) return false;
            const start = takeOAuthLoginStart();
            const verdict = evaluateOAuthDeeplink(start, payload, Date.now());
            if (!verdict.ok) {
                logger.warn('AUTH', '[useSocialLogin] ignored an OAuth deeplink', { reason: verdict.reason });
                setIsError(true);
                toast({
                    variant: 'destructive',
                    description: t(verdict.reason === 'expired' ? 'auth.social.expired' : 'auth.social.notStarted'),
                });
                return false;
            }
            // The record decides, not the link: what the code is for was fixed when this app started it.
            // A link answers `link` whatever its outcome — it has told the person already — so a caller
            // with a screen of its own can leave for the account hub instead of drawing a second one.
            if (start?.intent === 'link') {
                await link(payload.provider, payload.code, start.account);
                return 'link';
            }
            return (await complete(payload.provider, payload.code, notifyFailure)) && 'login';
        },
        [complete, link, t]
    );

    // `complete` and `link` stay private: exposing them would let a caller skip the start check.
    return { start, startLink, completeFromHandoff, isStarting, isSubmitting, isError };
};
