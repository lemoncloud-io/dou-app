import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';
import { toast } from '@chatic/ui-kit';

import type { LinkedAccountsView, LinkVerifiedView } from '@lemoncloud/chatic-backend-api';

import { socketErrorStatus, toError, toastFailure } from '../../../shared';
import { useOAuthAttemptStore, type LinkFailure } from '../stores/useOAuthAttemptStore';
import {
    buildAuthorizeUrl,
    createOAuthLoginStart,
    ensureDeviceSession,
    evaluateOAuthDeeplink,
    isAccountMadeSince,
    isUsedOAuthNonce,
    oauthProviderName,
    rememberUsedOAuthNonce,
    saveOAuthLoginStart,
    saveSignInNotice,
    takeOAuthLoginStart,
    type OAuthDeeplinkPayload,
    type OAuthProvider,
    type OAuthStartIntent,
} from '../utils';
import { useSignOutGuest } from './useSignOutGuest';

const refusalOf = (check: LinkVerifiedView): LinkFailure =>
    check.reason === 'occupied' ? 'occupied' : check.reason === 'type-linked' ? 'typeLinked' : 'failed';

const openAuthorize = (provider: OAuthProvider, intent: OAuthStartIntent, account?: string): void => {
    const record = createOAuthLoginStart(provider, Date.now(), intent, account);
    saveOAuthLoginStart(record);
    useOAuthAttemptStore.getState().opened(record.startedAt, record.nonce);
    openBrowser(buildAuthorizeUrl(provider, record.nonce));
};

const openBrowser = (url: string): void => {
    const relay = runtime.signIn.relayOAuth;
    if (relay) relay.openAuthorize(url);
    else logger.error('AUTH', '[useSocialLogin] this host has no relay sign-in to open');
};

const signedInAccountId = (): string | null => {
    if (!runtime.session.getIdentityContext().isAuthenticated) return null;
    const user = runtime.session.getRelaySessionUser() as { id?: unknown; userRole?: string } | null;
    if (!user || user.userRole === 'guest' || typeof user.id !== 'string') return null;
    return user.id;
};

export const useSocialLogin = () => {
    const { t } = useTranslation();
    const { deviceId } = runtime.session.useDynamicDeviceId();
    const { mutateAsync: loginGuest } = runtime.session.useLoginRelayGuestByDevice();
    const { auth } = runtime.data.useRuntimeRepositories();
    const signOutGuest = useSignOutGuest();
    const [isStarting, setIsStarting] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isError, setIsError] = useState(false);
    const completingRef = useRef(false);
    const startingRef = useRef(false);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const start = useCallback(
        async (provider: OAuthProvider): Promise<boolean> => {
            if (startingRef.current) return false;
            startingRef.current = true;
            setIsStarting(true);
            setIsError(false);
            const { attempt: previous, begin, clear } = useOAuthAttemptStore.getState();
            begin({
                provider,
                intent: 'login',
                signedOutAtStart:
                    !runtime.session.getIdentityContext().isAuthenticated ||
                    (previous?.intent === 'login' && previous.signedOutAtStart),
            });
            const begun = useOAuthAttemptStore.getState().attempt;
            try {
                await ensureDeviceSession(() => loginGuest(deviceId));
            } catch (error) {
                const err = toError(error);
                logger.error('AUTH', '[useSocialLogin] device registration failed', { error: err });
                clear();
                if (mountedRef.current) setIsError(true);
                return false;
            } finally {
                startingRef.current = false;
                if (mountedRef.current) setIsStarting(false);
            }
            if (useOAuthAttemptStore.getState().attempt !== begun) return false;
            openAuthorize(provider, 'login');
            return true;
        },
        [deviceId, loginGuest]
    );

    const startLink = useCallback((provider: OAuthProvider): boolean => {
        const account = signedInAccountId();
        if (!account || useOAuthAttemptStore.getState().attempt) return false;
        useOAuthAttemptStore.getState().begin({ provider, intent: 'link', signedOutAtStart: false });
        openAuthorize(provider, 'link', account);
        return true;
    }, []);

    const reopen = useCallback((): boolean => {
        const attempt = useOAuthAttemptStore.getState().attempt;
        if (!attempt?.nonce) return false;
        openBrowser(buildAuthorizeUrl(attempt.provider, attempt.nonce));
        return true;
    }, []);

    const cancel = useCallback(
        async ({ keepSession = false }: { keepSession?: boolean } = {}): Promise<void> => {
            const { attempt, clear, completing } = useOAuthAttemptStore.getState();
            if (completing) return;
            takeOAuthLoginStart();
            const mintedGuest = attempt?.intent === 'login' && attempt.signedOutAtStart;
            if (keepSession || !mintedGuest || !runtime.session.getIdentityContext().isAuthenticated) {
                clear();
                return;
            }
            try {
                await signOutGuest();
            } catch (error) {
                logger.error('AUTH', '[useSocialLogin] signing out the guest of a cancelled login failed', { error });
                toastFailure(t('auth.social.cancelFailed'), error);
            } finally {
                clear();
            }
        },
        [signOutGuest, t]
    );

    const link = useCallback(
        async (provider: string, code: string, account: string | undefined): Promise<boolean> => {
            if (completingRef.current) return false;
            completingRef.current = true;
            useOAuthAttemptStore.getState().setCompleting(true);
            setIsSubmitting(true);
            setIsError(false);
            const fail = (failure: LinkFailure) => {
                setIsError(true);
                useOAuthAttemptStore.getState().setLinkFailure(failure);
                completingRef.current = false;
                return false;
            };
            try {
                const signedIn = signedInAccountId();
                if (!signedIn || signedIn !== account) {
                    logger.warn('AUTH', '[useSocialLogin] link deeplink arrived for another session', {
                        signedIn: !!signedIn,
                    });
                    return fail('failed');
                }
                const tokens = { provider, code };
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
                toast({
                    description: t('account.signIn.link.done', {
                        provider: oauthProviderName(linked.provider ?? provider),
                    }),
                });
                completingRef.current = false;
                return true;
            } catch (error) {
                const status = socketErrorStatus(error);
                logger.error('AUTH', `[useSocialLogin] social link failed (status=${status ?? '-'})`, { error });
                return fail(status === 409 ? 'occupied' : 'failed');
            } finally {
                useOAuthAttemptStore.getState().setCompleting(false);
                setIsSubmitting(false);
            }
        },
        [auth, t]
    );

    const complete = useCallback(
        async (provider: string, code: string, startedAt: number, notifyFailure: boolean): Promise<boolean> => {
            if (completingRef.current) return false;
            completingRef.current = true;
            useOAuthAttemptStore.getState().setCompleting(true);
            setIsSubmitting(true);
            setIsError(false);
            const wasAuthenticated = runtime.session.getIdentityContext().isAuthenticated;
            try {
                const account = await runtime.session.createCredentialsByProvider(provider, code, {
                    linkCurrentSession: true,
                });
                saveSignInNotice({ provider, isNew: isAccountMadeSince(account, startedAt) });
                if (wasAuthenticated) window.location.replace('/');
                return true;
            } catch (error) {
                const err = toError(error);
                logger.error('AUTH', '[useSocialLogin] code exchange failed', { error: err });
                setIsError(true);
                if (notifyFailure) toastFailure(t('auth.social.failed'), err);
                completingRef.current = false;
                return false;
            } finally {
                useOAuthAttemptStore.getState().setCompleting(false);
                setIsSubmitting(false);
            }
        },
        [t]
    );

    const completeFromHandoff = useCallback(
        async (payload: OAuthDeeplinkPayload, { notifyFailure = false } = {}): Promise<OAuthStartIntent | false> => {
            if (completingRef.current) return false;
            if (isUsedOAuthNonce(payload.nonce)) {
                logger.info('AUTH', '[useSocialLogin] ignored a repeat of a used OAuth deeplink');
                return false;
            }
            const start = takeOAuthLoginStart();
            if (start) rememberUsedOAuthNonce(start.nonce);
            const verdict = evaluateOAuthDeeplink(start, payload, Date.now());
            const attempts = useOAuthAttemptStore.getState();
            if (!verdict.ok) {
                logger.warn('AUTH', '[useSocialLogin] ignored an OAuth deeplink', { reason: verdict.reason });
                setIsError(true);
                attempts.fail();
                toast({
                    variant: 'destructive',
                    description: t(verdict.reason === 'expired' ? 'auth.social.expired' : 'auth.social.notStarted'),
                });
                return false;
            }
            if (start?.intent === 'link') {
                await link(payload.provider, payload.code, start.account);
                attempts.clear();
                return 'link';
            }
            const startedAt = start?.startedAt ?? Date.now();
            const done = await complete(payload.provider, payload.code, startedAt, notifyFailure);
            if (done) attempts.clear();
            else attempts.fail();
            return done && 'login';
        },
        [complete, link, t]
    );

    return { start, startLink, reopen, cancel, completeFromHandoff, isStarting, isSubmitting, isError };
};
