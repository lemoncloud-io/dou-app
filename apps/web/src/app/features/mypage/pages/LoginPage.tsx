import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useLoginRelaySocial } from '@chatic/web-core';
import { useNavigateWithTransition } from '@chatic/shared';

import { isNative, logger } from '@chatic/bridges';

import { PageHeader } from '../../../ui/components';
import { appBridge } from '../../../bridge';
import { PhoneVerifySheet } from '../../auth/components/PhoneVerifySheet';
import type { LoginLocationState } from '../../auth/hooks/useNavigateToLogin';
import { isDevBuild } from '../../../utils/buildEnv';
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
    /**
     * Phone sign-in is a development-build affordance for now: production keeps social as the only way
     * in. Held back rather than removed because the flow itself is wired and tested — flipping this is
     * how it ships once the account-split guidance and the subscription/email coupling are settled.
     */
    const showPhoneLogin = isDevBuild();
    const { mutateAsync: loginRelaySocial, isPending: isLoginRelaySocialPending } = useLoginRelaySocial();

    /**
     * Leave the login screen for wherever the user came from (`useNavigateToLogin` put it in the
     * router state); home when nothing was passed — a deep link or a refresh landed here directly.
     *
     * `replace` is what keeps back-navigation out of a login the user has already passed: it
     * overwrites this screen's history entry. That is the whole job the previous implementation did
     * by rewinding the stack to its first entry and doing a full-page `location.replace('/')` —
     * which also threw away every screen the user had navigated through, and flashed white on the
     * way out. Neither is needed: both sign-in paths install the new identity BEFORE this runs
     * (phone via `applySessionToken`, social via `loginRelaySocial`), so there is nothing a reload
     * would fix (ADR-0055).
     *
     * `transition`/`direction` are explicit because the transition helper turns animation OFF by
     * default when `replace` is set; coming back should read as going back, not as a hard cut.
     */
    const leaveForReturnTo = () => {
        const { returnTo } = (location.state ?? {}) as LoginLocationState;
        void navigate(returnTo ?? ROUTES.home, { replace: true, transition: true, direction: 'back' });
    };

    const handleOAuthLogin = async (provider: 'google' | 'apple') => {
        setIsOAuthPending(true);
        setActiveProvider(provider);
        try {
            const response = await appBridge.oauthLogin(provider);
            const result = response.data.result;

            setIsOAuthPending(false);
            setActiveProvider(null);

            // null result means the user cancelled the native OAuth flow
            if (!result) {
                toast({ title: t('mypageLogin.oauthFailed'), variant: 'destructive' });
                return;
            }

            // loginRelaySocial verifies the native token, sets the provider, and hydrates the session.
            await loginRelaySocial({ body: result, provider: result.provider });

            leaveForReturnTo();
        } catch (e) {
            setIsOAuthPending(false);
            setActiveProvider(null);
            logger.error('AUTH', '[LoginPage] OAuth login failed', { error: e });
            toast({
                title: t('mypageLogin.error'),
                description: t('mypageLogin.errorDescription'),
                variant: 'destructive',
            });
        }
    };

    const isLoading = isOAuthPending || isLoginRelaySocialPending;

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <PageHeader title="" />

            <div className="flex flex-1 flex-col justify-center overflow-y-auto overscroll-none px-6 pb-safe-bottom">
                <div className="flex flex-col items-center pb-10">
                    <img src="/logo-chatic.svg" alt="DoU" className="h-8" />
                </div>

                {isOnMobileApp ? (
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
                ) : (
                    // Which copy is true depends on whether anything else is offered below: with phone
                    // login hidden the app really is the only way in, but where it shows, only SOCIAL is.
                    <p className="text-center text-[14px] text-muted-foreground">
                        {showPhoneLogin
                            ? t('mypageLogin.socialMobileOnly', {
                                  defaultValue: 'Social sign-in is available in the mobile app.',
                              })
                            : t('mypageLogin.mobileOnly', { defaultValue: 'Please use the mobile app to sign in.' })}
                    </p>
                )}

                {/*
                 * Phone login is held to development builds.
                 *
                 * Where it IS shown it sits BELOW social on purpose. This screen is where
                 * `PhoneVerifyBanner` sends a user who might already have a social account, and the
                 * account-split hazard is one-way: proving a number on a fresh device mints a SEPARATE
                 * user that can never be merged. Seeing social first, with the warning directly above
                 * the number, is the whole defense — the server cannot prevent this (ADR-0042 §9).
                 *
                 * It also needs no `isNative()` gate — a socket call works in a browser — but production
                 * keeps it hidden anyway, so social remains the only production sign-in and the
                 * mobile-only copy above stays the whole truth there.
                 */}
                {showPhoneLogin && (
                    <div className="mt-8 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <span className="h-px flex-1 bg-border" />
                            <span className="text-[13px] text-muted-foreground">{t('mypageLogin.or')}</span>
                            <span className="h-px flex-1 bg-border" />
                        </div>

                        <p className="text-center text-[13px] leading-[1.5] text-description">
                            {isOnMobileApp
                                ? t('mypageLogin.socialFirstNotice')
                                : t('mypageLogin.socialFirstNoticeBrowser')}
                        </p>

                        <button
                            onClick={() => setIsPhoneOpen(true)}
                            disabled={isLoading}
                            data-testid="login-phone"
                            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-input-border bg-transparent py-[14px] text-[15px] font-medium text-foreground disabled:opacity-50 dark:border-[#3A3A3A]"
                        >
                            {t('mypageLogin.continueWithPhone')}
                        </button>
                    </div>
                )}

                <p className="mt-6 text-center text-[12px] leading-[1.5] text-description">
                    {t('mypageLogin.termsAgreement', {
                        defaultValue: 'By continuing, you agree\nto our Terms & Privacy Policy',
                    })}
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
