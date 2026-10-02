import { Loader2, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cn } from '@chatic/lib/utils';
import { BrandMark } from '@chatic/web-ui-kit';
import { runtime } from '@chatic/app-runtime';
import { useNavigateWithTransition } from '@chatic/shared';

import { isNative, logger } from '@chatic/bridges';

import { PageHeader } from '../../../ui/components';
import { appBridge, useOnOAuthLogin } from '../../../bridge';
import { PhoneVerifySheet } from '../../auth/components/PhoneVerifySheet';
import type { LoginLocationState } from '../../auth/hooks/useNavigateToLogin';
import { canGoBackInApp, readHistoryIndex } from '../../../navigation';
import { ROUTES } from '../../../routes/paths';
import { AppleIcon, GoogleIcon } from '../components';

export const LoginPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const location = useLocation();
    const navigate = useNavigateWithTransition();
    const [isOAuthPending, setIsOAuthPending] = useState(false);
    const [activeProvider, setActiveProvider] = useState<'google' | 'apple' | null>(null);
    const [isPhoneOpen, setIsPhoneOpen] = useState(false);

    const isOnMobileApp = isNative();
    const isIOS = isOnMobileApp && typeof window !== 'undefined' && window.CHATIC_APP_PLATFORM?.toLowerCase() === 'ios';
    const { mutateAsync: loginRelaySocial, isPending: isLoginRelaySocialPending } =
        runtime.session.useLoginRelaySocial();

    /**
     * Leave the login screen for wherever the user came from.
     *
     * `history.back()`, not a replace. The entry point PUSHED this screen (see useNavigateToLogin),
     * so the previous entry is already the screen to return to — going back lands on it and takes
     * the login entry out of the backward path in one move. Replacing instead would overwrite login
     * with a second copy of that screen, leaving two identical adjacent entries: the first back
     * press would appear to do nothing, which reads as broken navigation.
     *
     * A useful side effect: `returnTo` is read as a FLAG (did we get here from inside the app?),
     * never handed to the router as a destination, so there is no path for it to become a redirect
     * target at all.
     *
     * The old implementation rewound the whole history stack and did a full-page
     * `location.replace('/')`. Neither is needed: both sign-in paths install the new identity before
     * this runs (phone via `applySessionToken`, social via `loginRelaySocial`), so a reload fixes
     * nothing and only costs a white flash.
     */
    const leaveForReturnTo = () => {
        const { returnTo } = (location.state ?? {}) as LoginLocationState;
        const cameFromInsideTheApp = !!returnTo && canGoBackInApp();
        // "I signed in and it took me to home instead of where I was" is a report about THIS branch,
        // and its two causes are indistinguishable from the outside: no `returnTo` (an entry point
        // bypassed useNavigateToLogin) or nothing behind this screen in the app's own stack (a fresh
        // WebView load, a deep link, a reload). Recording both inputs beside the branch turns that
        // report into an answer, and marks login completion for whoever is reading the log.
        logger.info('AUTH', `leaving login — ${cameFromInsideTheApp ? 'back to origin' : 'fallback to home'}`, {
            hadReturnTo: !!returnTo,
            // The depth this branch actually read. Logged instead of `history.length`, which is a
            // WebView-global count and so could not explain the branch it used to sit beside.
            depth: readHistoryIndex(),
            wentBack: cameFromInsideTheApp,
        });
        const leaving = cameFromInsideTheApp
            ? navigate(-1)
            : // Deep link or refresh landed here directly, so there is nothing to go back to.
              navigate(ROUTES.home, { replace: true, transition: true, direction: 'back' });
        void Promise.resolve(leaving).catch(error =>
            // The session is already promoted by this point, so a silent failure would strand a
            // signed-in user on the login screen with no feedback.
            logger.error('AUTH', '[LoginPage] Failed to leave the login screen', { error })
        );
    };

    const reportOAuthFailure = (error: unknown) => {
        logger.error('AUTH', '[LoginPage] OAuth login failed', { error });
        toast({
            title: t('mypageLogin.error'),
            description: t('mypageLogin.errorDescription'),
            variant: 'destructive',
        });
    };

    /**
     * The credential comes back HERE, not from the call that started the flow.
     *
     * `startOAuthLogin` only fires the request; the provider's UI then belongs to the user for as
     * long as they need (account chooser, password, 2FA, consent). The request/response pair this
     * replaces gave that a 15s budget and abandoned anything slower — so a user who really did sign
     * in came back to an error toast and the login screen, because their credential arrived to a
     * request that had already been given up on and was dropped (see `appBridge.startOAuthLogin`).
     *
     * Every outcome lands on this one channel: success carries the credential, a cancel carries
     * `result: null`, and a native failure carries `success: false`.
     */
    useOnOAuthLogin(message => {
        setIsOAuthPending(false);
        setActiveProvider(null);

        if (!message.success) {
            reportOAuthFailure(message.error);
            return;
        }

        const result = message.data.result;
        // null result means the user cancelled the native OAuth flow
        if (!result) {
            logger.warn('AUTH', '[LoginPage] native oauth returned no credential');
            toast({ title: t('mypageLogin.oauthFailed'), variant: 'destructive' });
            return;
        }

        void (async () => {
            try {
                // loginRelaySocial verifies the native token, sets the provider, and hydrates the session.
                await loginRelaySocial({ body: result, provider: result.provider });
                logger.info('AUTH', '[LoginPage] social login succeeded', { provider: result.provider });

                leaveForReturnTo();
            } catch (e) {
                reportOAuthFailure(e);
            }
        })();
    });

    const handleOAuthLogin = (provider: 'google' | 'apple') => {
        setIsOAuthPending(true);
        setActiveProvider(provider);
        appBridge.startOAuthLogin(provider);
    };

    const isLoading = isOAuthPending || isLoginRelaySocialPending;

    // Pushed, so the policy page's back button lands here again with this entry's `returnTo` intact.
    const openPolicy = (path: string) => navigate(path);

    const policyLinkClass = 'font-medium text-foreground underline underline-offset-2 disabled:opacity-50';

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title="" />

            <div className="flex flex-1 flex-col justify-center overflow-y-auto overscroll-none px-6 pb-safe-bottom">
                <div className="flex flex-col items-center pb-10">
                    <BrandMark height={40} />
                </div>

                {isOnMobileApp && (
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => handleOAuthLogin('google')}
                            data-testid="login-google"
                            disabled={isLoading}
                            aria-busy={isLoading && activeProvider === 'google'}
                            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-input-border bg-white py-[14px] text-[15px] font-medium text-[#222325] disabled:opacity-50 dark:border-[#3A3A3A] dark:bg-[#1C1C1E] dark:text-white"
                        >
                            {isLoading && activeProvider === 'google' ? (
                                <Loader2 size={20} className="animate-spin" />
                            ) : (
                                <GoogleIcon />
                            )}
                            {t('mypageLogin.continueWithGoogle')}
                        </button>

                        {isIOS && (
                            <button
                                onClick={() => handleOAuthLogin('apple')}
                                disabled={isLoading}
                                aria-busy={isLoading && activeProvider === 'apple'}
                                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#222325] py-[14px] text-[15px] font-medium text-white disabled:opacity-50 dark:bg-white dark:text-[#222325]"
                            >
                                {isLoading && activeProvider === 'apple' ? (
                                    <Loader2 size={20} className="animate-spin" />
                                ) : (
                                    <AppleIcon />
                                )}
                                {t('mypageLogin.continueWithApple')}
                            </button>
                        )}
                    </div>
                )}

                {/*
                 * Phone sits BELOW social on purpose. This screen is where `PhoneVerifyBanner` sends a
                 * user who might already have a social account, and the account-split hazard is one-way:
                 * proving a number on a fresh device mints a SEPARATE user that can never be merged.
                 * Seeing social first, with the warning directly above the number, is the whole
                 * defense — the server cannot prevent this.
                 *
                 * A phone-only user cannot hold a subscription (it attaches to a cloud, and cloud
                 * ownership follows the social account). That is enforced where it costs money — the
                 * purchase refuses before opening the store — so it does not need to gate sign-in here.
                 *
                 * It needs no `isNative()` gate either: the verification is a socket call, so in a
                 * browser it is the one way in. There the warning is also the only mention of social,
                 * which is why the browser drops the divider and folds "social is app-only" into it.
                 */}
                <div className={cn('flex flex-col gap-3', isOnMobileApp && 'mt-8')}>
                    {isOnMobileApp && (
                        <div className="flex items-center gap-3">
                            <span className="h-px flex-1 bg-border" />
                            <span className="text-[13px] text-muted-foreground">{t('mypageLogin.or')}</span>
                            <span className="h-px flex-1 bg-border" />
                        </div>
                    )}

                    <p className="text-center text-[13px] leading-[1.5] text-description">
                        {isOnMobileApp ? t('mypageLogin.socialFirstNotice') : t('mypageLogin.socialFirstNoticeBrowser')}
                    </p>

                    <button
                        onClick={() => setIsPhoneOpen(true)}
                        disabled={isLoading}
                        data-testid="login-phone"
                        className="flex w-full items-center justify-center gap-3 rounded-2xl border border-input-border bg-transparent py-[14px] text-[15px] font-medium text-foreground disabled:opacity-50 dark:border-[#3A3A3A]"
                    >
                        <Smartphone size={20} aria-hidden />
                        {t('mypageLogin.continueWithPhone')}
                    </button>
                </div>

                {/* The translation marks which words are the links, since they sit in a different
                    place in each language's sentence. It is a new key rather than new text under
                    `termsAgreement`: a bundle already running in a WebView refetches the locale file
                    after its cache expires, and would print the tags literally through `t()`.

                    Disabled during OAuth like every other control: the credential is delivered to this
                    screen's subscriber, and leaving would unmount it and drop a completed sign-in. */}
                <p className="mt-6 text-center text-[12px] leading-[1.5] text-description">
                    <Trans
                        i18nKey="mypageLogin.termsAgreementLinks"
                        defaults="By continuing, you agree to our <terms>Terms</terms> & <privacy>Privacy Policy</privacy>"
                        components={{
                            terms: (
                                <button
                                    type="button"
                                    data-testid="login-terms"
                                    disabled={isLoading}
                                    onClick={() => openPolicy(ROUTES.mypage.policy.terms)}
                                    className={policyLinkClass}
                                />
                            ),
                            privacy: (
                                <button
                                    type="button"
                                    data-testid="login-privacy"
                                    disabled={isLoading}
                                    onClick={() => openPolicy(ROUTES.mypage.policy.privacy)}
                                    className={policyLinkClass}
                                />
                            ),
                        }}
                    />
                </p>
            </div>

            {/* `login`: this is a device session proving a number to become that number's main user, so
                a `$token` comes back and `usePhoneVerify` installs it before `onVerified` fires. */}
            {isPhoneOpen && (
                <PhoneVerifySheet mode="login" onVerified={leaveForReturnTo} onClose={() => setIsPhoneOpen(false)} />
            )}
        </div>
    );
};
