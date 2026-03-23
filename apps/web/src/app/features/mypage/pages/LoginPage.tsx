import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLogin } from '@chatic/auth';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { webCore } from '@chatic/web-core';

import { useNavigateWithTransition } from '@chatic/shared';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { getMobileAppInfo, postMessage, useHandleAppMessage } from '@chatic/app-messages';
import type { OAuthTokenResult } from '@chatic/app-messages';
import { useVerifyNativeAppToken } from '@chatic/users';
import type { LemonOAuthToken } from '@lemoncloud/lemon-web-core';

export const LoginPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { toast } = useToast();
    const { mutateAsync: login, isPending } = useLogin();

    const [uid, setUid] = useState('');
    const [pwd, setPwd] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isOAuthPending, setIsOAuthPending] = useState(false);

    const { isOnMobileApp, isIOS } = getMobileAppInfo();
    const isBeta = true;

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
            console.log(result, 'received OAuth token, verifying and logging in...');
            const res = await verifyNativeAppToken(result);
            console.log(res);
            console.log(res?.Token, 'received native app token, verifying and logging in...');
            await webCore.buildCredentialsByToken(res?.Token as unknown as LemonOAuthToken);
            window.location.href = '/';
        } catch (e) {
            console.error(e);
            toast({
                title: t('mypageLogin.error'),
                description: t('mypageLogin.errorDescription'),
                variant: 'destructive',
            });
        }
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const { Token } = await login({ uid, pwd });
            await webCore.buildCredentialsByToken(Token as Parameters<typeof webCore.buildCredentialsByToken>[0]);

            window.location.href = '/';
        } catch {
            toast({
                title: t('mypageLogin.error'),
                description: t('mypageLogin.errorDescription'),
                variant: 'destructive',
            });
        }
    };

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <header className="flex items-center px-[6px]">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-none px-4 pb-safe-bottom">
                <div className="mt-6 mb-8">
                    <h1 className="text-[20px] font-semibold leading-[1.35] ">{t('mypageLogin.title')}</h1>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <label className="text-[14px] font-semibold text-label">{t('mypageLogin.emailLabel')}</label>
                        <Input
                            type="email"
                            value={uid}
                            onChange={e => setUid(e.target.value)}
                            placeholder={t('mypageLogin.emailPlaceholder')}
                            required
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[14px] font-semibold text-label">{t('mypageLogin.passwordLabel')}</label>
                        <div className="relative">
                            <Input
                                type={showPassword ? 'text' : 'password'}
                                value={pwd}
                                onChange={e => setPwd(e.target.value)}
                                placeholder={t('mypageLogin.passwordPlaceholder')}
                                className="pr-11"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(prev => !prev)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-placeholder"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                            </button>
                        </div>
                    </div>

                    <div className="mt-4">
                        <button
                            type="submit"
                            disabled={isPending}
                            className="w-full rounded-[100px] bg-[#B0EA10] py-3 text-[16px] font-semibold text-[#222325] disabled:opacity-50"
                        >
                            {isPending ? t('mypageLogin.loading') : t('mypageLogin.submit')}
                        </button>
                    </div>
                </form>

                <div className="mt-6 flex items-center justify-center gap-6">
                    <button
                        type="button"
                        onClick={() => navigate('/account/signup')}
                        className="flex items-center gap-0.5 text-[15px] font-medium text-label"
                    >
                        {t('mypageLogin.signup')}
                        <ChevronRight size={18} />
                    </button>
                    <div className="h-[14px] w-px bg-input-border" />
                    <button
                        type="button"
                        onClick={() => navigate('/account/reset-password')}
                        className="flex items-center gap-0.5 text-[15px] font-medium text-label"
                    >
                        {t('mypageLogin.forgotPassword')}
                        <ChevronRight size={18} />
                    </button>
                </div>

                {!isBeta && isOnMobileApp && (
                    <div className="mt-6 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <div className="h-px flex-1 bg-[#E5E7EB]" />
                            <span className="text-[13px] text-[#9CA3AF]">{t('mypageLogin.orContinueWith')}</span>
                            <div className="h-px flex-1 bg-[#E5E7EB]" />
                        </div>

                        <button
                            onClick={() => handleOAuthLogin('google')}
                            disabled={isOAuthPending || isVerifyNativeAppTokenPending}
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
                                disabled={isOAuthPending || isVerifyNativeAppTokenPending}
                                className="flex w-full items-center justify-center gap-3 rounded-[100px] bg-[#222325] py-3 text-[15px] font-medium text-white disabled:opacity-50 dark:bg-white dark:text-[#222325]"
                            >
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M13.5 1c.1 1.4-.4 2.7-1.2 3.7-.8.9-2 1.6-3.2 1.5-.1-1.3.5-2.7 1.3-3.6C11.2 1.6 12.5 1 13.5 1ZM17.9 14.5c-.5 1.1-1 2-1.8 2.9-.7.9-1.5 1.8-2.7 1.8-1.1 0-1.5-.7-2.8-.7-1.4 0-1.8.7-2.9.7-1.1 0-1.9-.8-2.7-1.8C3.8 16 2.9 13.8 2.9 11.7c0-3.5 2.3-5.4 4.5-5.4 1.2 0 2.2.8 2.9.8.7 0 1.9-.8 3.3-.8 1.1 0 2.9.6 3.9 2.3-3.4 1.9-2.8 6.8.4 5.9Z" />
                                </svg>
                                {t('mypageLogin.continueWithApple')}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
