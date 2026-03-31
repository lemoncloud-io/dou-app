import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { webCore } from '@chatic/web-core';

import { useNavigateWithTransition } from '@chatic/shared';
import { getMobileAppInfo, postMessage, useHandleAppMessage } from '@chatic/app-messages';
import type { OAuthTokenResult } from '@chatic/app-messages';
import { useVerifyNativeAppToken } from '@chatic/users';
import type { LemonOAuthToken } from '@lemoncloud/lemon-web-core';

export const LoginPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { toast } = useToast();
    const [isOAuthPending, setIsOAuthPending] = useState(false);

    const { isOnMobileApp, isIOS } = getMobileAppInfo();
    const { mutateAsync: verifyNativeAppToken, isPending: isVerifyNativeAppTokenPending } = useVerifyNativeAppToken();

    const handleOAuthLogin = (provider: 'google' | 'apple') => {
        setIsOAuthPending(true);
        postMessage({ type: 'OAuthLogin', data: { provider } });
    };

    useHandleAppMessage('OnOAuthLogin', async message => {
        setIsOAuthPending(false);
        const result: OAuthTokenResult | null = message.data.result;
        if (!result) {
            toast({ title: t('mypageLogin.oauthFailed'), variant: 'destructive' });
            return;
        }

        try {
            const res = await verifyNativeAppToken(result);
            await webCore.buildCredentialsByToken(res?.Token as unknown as LemonOAuthToken);
            window.location.href = '/';
        } catch (e) {
            console.error('[LoginPage] OAuth login failed:', e);
            toast({
                title: t('mypageLogin.error'),
                description: t('mypageLogin.errorDescription'),
                variant: 'destructive',
            });
        }
    });

    const isLoading = isOAuthPending || isVerifyNativeAppTokenPending;

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <header className="flex items-center px-[6px]">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-none px-4 pb-safe-bottom">
                <div className="mt-6 mb-8">
                    <h1 className="text-[20px] font-semibold leading-[1.35]">{t('mypageLogin.title')}</h1>
                </div>

                {isOnMobileApp ? (
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => handleOAuthLogin('google')}
                            disabled={isLoading}
                            className="flex w-full items-center justify-center gap-3 rounded-[100px] border border-[#E5E7EB] bg-white py-3 text-[15px] font-medium text-[#222325] disabled:opacity-50 dark:border-[#3A3A3A] dark:bg-[#1C1C1E] dark:text-white"
                        >
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path
                                    d="M19.6 10.227c0-.709-.064-1.39-.182-2.045H10v3.868h5.382a4.6 4.6 0 0 1-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.35Z"
                                    fill="#4285F4"
                                />
                                <path
                                    d="M10 20c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.595-4.123H1.064v2.59A9.996 9.996 0 0 0 10 20Z"
                                    fill="#34A853"
                                />
                                <path
                                    d="M4.405 11.9A6.01 6.01 0 0 1 4.09 10c0-.663.114-1.308.314-1.9V5.51H1.064A9.996 9.996 0 0 0 0 10c0 1.614.386 3.14 1.064 4.49l3.34-2.59Z"
                                    fill="#FBBC05"
                                />
                                <path
                                    d="M10 3.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C14.959.99 12.695 0 10 0A9.996 9.996 0 0 0 1.064 5.51l3.34 2.59C5.192 5.736 7.396 3.977 10 3.977Z"
                                    fill="#EA4335"
                                />
                            </svg>
                            {t('mypageLogin.continueWithGoogle')}
                        </button>

                        {isIOS && (
                            <button
                                onClick={() => handleOAuthLogin('apple')}
                                disabled={isLoading}
                                className="flex w-full items-center justify-center gap-3 rounded-[100px] bg-[#222325] py-3 text-[15px] font-medium text-white disabled:opacity-50 dark:bg-white dark:text-[#222325]"
                            >
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M13.5 1c.1 1.4-.4 2.7-1.2 3.7-.8.9-2 1.6-3.2 1.5-.1-1.3.5-2.7 1.3-3.6C11.2 1.6 12.5 1 13.5 1ZM17.9 14.5c-.5 1.1-1 2-1.8 2.9-.7.9-1.5 1.8-2.7 1.8-1.1 0-1.5-.7-2.8-.7-1.4 0-1.8.7-2.9.7-1.1 0-1.9-.8-2.7-1.8C3.8 16 2.9 13.8 2.9 11.7c0-3.5 2.3-5.4 4.5-5.4 1.2 0 2.2.8 2.9.8.7 0 1.9-.8 3.3-.8 1.1 0 2.9.6 3.9 2.3-3.4 1.9-2.8 6.8.4 5.9Z" />
                                </svg>
                                {t('mypageLogin.continueWithApple')}
                            </button>
                        )}
                    </div>
                ) : (
                    <p className="text-center text-[14px] text-muted-foreground">
                        {t('mypageLogin.mobileOnly', { defaultValue: 'Please use the mobile app to sign in.' })}
                    </p>
                )}
            </div>
        </div>
    );
};
