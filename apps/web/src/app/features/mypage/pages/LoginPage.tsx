import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useLoginRelaySocial } from '@chatic/web-core';

import { isNative, logger } from '@chatic/bridges';

import { PageHeader } from '../../../ui/components';
import { appBridge } from '../../../bridge';
import { AppleIcon, GoogleIcon } from '../components';

export const LoginPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [isOAuthPending, setIsOAuthPending] = useState(false);
    const [activeProvider, setActiveProvider] = useState<'google' | 'apple' | null>(null);

    const isOnMobileApp = isNative();
    const isIOS = isOnMobileApp && typeof window !== 'undefined' && window.CHATIC_APP_PLATFORM?.toLowerCase() === 'ios';
    const { mutateAsync: loginRelaySocial, isPending: isLoginRelaySocialPending } = useLoginRelaySocial();

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

            // Clean up history stack: [/, /mypage, /mypage/login] → [/]
            // Going back to the first entry and replacing prevents a back-navigation loop
            const stepsBack = window.history.length - 1;
            if (stepsBack > 0) {
                window.addEventListener('popstate', () => window.location.replace('/'), { once: true });
                window.history.go(-stepsBack);
            } else {
                window.location.replace('/');
            }
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
                    <p className="text-center text-[14px] text-muted-foreground">
                        {t('mypageLogin.mobileOnly', { defaultValue: 'Please use the mobile app to sign in.' })}
                    </p>
                )}

                <p className="mt-6 text-center text-[12px] leading-[1.5] text-description">
                    {t('mypageLogin.termsAgreement', {
                        defaultValue: 'By continuing, you agree\nto our Terms & Privacy Policy',
                    })}
                </p>
            </div>
        </div>
    );
};
