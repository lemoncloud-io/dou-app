import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useLoginRelaySocial } from '@chatic/web-core';

import { isNative, logger } from '@chatic/bridges';

import { PageHeader } from '../../../ui/components';
import { appBridge } from '../../../bridge';
import { PhoneVerifySheet } from '../../auth/components/PhoneVerifySheet';
import { AppleIcon, GoogleIcon } from '../components';

export const LoginPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [isOAuthPending, setIsOAuthPending] = useState(false);
    const [activeProvider, setActiveProvider] = useState<'google' | 'apple' | null>(null);
    const [isPhoneOpen, setIsPhoneOpen] = useState(false);

    const isOnMobileApp = isNative();
    const isIOS = isOnMobileApp && typeof window !== 'undefined' && window.CHATIC_APP_PLATFORM?.toLowerCase() === 'ios';
    const { mutateAsync: loginRelaySocial, isPending: isLoginRelaySocialPending } = useLoginRelaySocial();

    /**
     * Clean up the history stack: [/, /mypage, /mypage/login] → [/]. Going back to the first entry and
     * replacing prevents a back-navigation loop into a login page the user has already passed. Shared
     * by both sign-in methods — either one leaves this screen behind for good.
     */
    const leaveForHome = () => {
        const stepsBack = window.history.length - 1;
        if (stepsBack > 0) {
            window.addEventListener('popstate', () => window.location.replace('/'), { once: true });
            window.history.go(-stepsBack);
        } else {
            window.location.replace('/');
        }
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

            leaveForHome();
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
                    // Social sign-in needs the native bridge for a provider's raw token, so the browser
                    // is told so — but this is no longer the whole story: phone login below works here.
                    <p className="text-center text-[14px] text-muted-foreground">
                        {t('mypageLogin.socialMobileOnly', {
                            defaultValue: 'Social sign-in is available in the mobile app.',
                        })}
                    </p>
                )}

                {/*
                 * Phone login sits BELOW social on purpose. This screen is where `PhoneVerifyBanner`
                 * sends a user who might already have a social account, and the account-split hazard is
                 * one-way: proving a number on a fresh device mints a SEPARATE user that can never be
                 * merged. Seeing social first, with the warning directly above the number, is the whole
                 * defense — the server cannot prevent this (ADR-0042 §9).
                 *
                 * No `isNative()` gate: this is a socket call, so it is the first login path that works
                 * in a browser at all.
                 */}
                <div className="mt-8 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <span className="h-px flex-1 bg-border" />
                        <span className="text-[13px] text-muted-foreground">{t('mypageLogin.or')}</span>
                        <span className="h-px flex-1 bg-border" />
                    </div>

                    <p className="text-center text-[13px] leading-[1.5] text-description">
                        {isOnMobileApp ? t('mypageLogin.socialFirstNotice') : t('mypageLogin.socialFirstNoticeBrowser')}
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

                <p className="mt-6 text-center text-[12px] leading-[1.5] text-description">
                    {t('mypageLogin.termsAgreement', {
                        defaultValue: 'By continuing, you agree\nto our Terms & Privacy Policy',
                    })}
                </p>
            </div>

            {/* `login`: this is a device session proving a number to become that number's main user, so
                a `$token` comes back and `usePhoneVerify` installs it before `onVerified` fires. */}
            {isPhoneOpen && (
                <PhoneVerifySheet mode="login" onVerified={leaveForHome} onClose={() => setIsPhoneOpen(false)} />
            )}
        </div>
    );
};
