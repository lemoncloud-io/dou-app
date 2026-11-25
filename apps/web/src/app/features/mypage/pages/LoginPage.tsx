import { Loader2, Mail, MonitorSmartphone, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cn } from '@chatic/ui-kit';
import { BrandMark } from '@chatic/web-ui-kit';
import { runtime } from '@chatic/runtime-react';
import { useNavigateWithTransition } from '@chatic/shared';

import { logger } from '@chatic/bridges';
import type { AppMessageData, OAuthCodeResult, OAuthLoginResult } from '@chatic/bridge-messages';

import { PageHeader } from '../../../ui/components';
import { PhoneVerifySheet } from '../../auth/components/PhoneVerifySheet';
import type { LoginLocationState } from '../../auth/hooks/useNavigateToLogin';
import { canGoBackInApp, readHistoryIndex } from '../../../navigation';
import { ROUTES } from '../../../routes/paths';
import { AppleIcon, GoogleIcon } from '../components';
import { useDevicePairingEnabled } from '../../../hooks/useDevicePairingEnabled';

const isRelayCode = (result: OAuthLoginResult): result is OAuthCodeResult =>
    typeof (result as Partial<OAuthCodeResult>).code === 'string';

export const LoginPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const location = useLocation();
    const navigate = useNavigateWithTransition();
    const [isOAuthPending, setIsOAuthPending] = useState(false);
    const [activeProvider, setActiveProvider] = useState<'google' | 'apple' | null>(null);
    const [isPhoneOpen, setIsPhoneOpen] = useState(false);
    const [isCodeExchangePending, setIsCodeExchangePending] = useState(false);
    const pairingEnabled = useDevicePairingEnabled();
    const emailLoginEnabled = runtime.settings.useConfigValue<boolean>('feature.auth.emailLogin') === true;

    const providerSignIn = runtime.signIn.providerSignIn;
    const offersSocial = providerSignIn !== null;
    const offersApple = providerSignIn?.providers.includes('apple') ?? false;
    const { mutateAsync: loginRelaySocial, isPending: isLoginRelaySocialPending } =
        runtime.session.useLoginRelaySocial();

    const leaveForReturnTo = () => {
        const { returnTo } = (location.state ?? {}) as LoginLocationState;
        const cameFromInsideTheApp = !!returnTo && canGoBackInApp();
        logger.info('AUTH', `leaving login — ${cameFromInsideTheApp ? 'back to origin' : 'fallback to home'}`, {
            hadReturnTo: !!returnTo,
            depth: readHistoryIndex(),
            wentBack: cameFromInsideTheApp,
        });
        const leaving = cameFromInsideTheApp
            ? navigate(-1)
            : navigate(ROUTES.home, { replace: true, transition: true, direction: 'back' });
        void Promise.resolve(leaving).catch(error =>
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

    const handleOAuthResult = (message: AppMessageData<'OnOAuthLogin'>) => {
        setIsOAuthPending(false);
        setActiveProvider(null);

        if (!message.success) {
            reportOAuthFailure(message.error);
            return;
        }

        const result = message.data.result;
        if (!result) {
            logger.warn('AUTH', '[LoginPage] native oauth returned no credential');
            toast({ title: t('mypageLogin.oauthFailed'), variant: 'destructive' });
            return;
        }

        void (async () => {
            try {
                if (isRelayCode(result)) {
                    setIsCodeExchangePending(true);
                    try {
                        await runtime.session.createCredentialsByProvider(result.provider, result.code, {
                            linkCurrentSession: true,
                        });
                    } finally {
                        setIsCodeExchangePending(false);
                    }
                } else {
                    await loginRelaySocial({ body: result, provider: result.provider });
                }
                logger.info('AUTH', '[LoginPage] social login succeeded', {
                    provider: result.provider,
                    via: isRelayCode(result) ? 'relay-code' : 'native-token',
                });

                leaveForReturnTo();
            } catch (e) {
                reportOAuthFailure(e);
            }
        })();
    };

    const handleOAuthResultRef = useRef(handleOAuthResult);
    useEffect(() => {
        handleOAuthResultRef.current = handleOAuthResult;
    });
    useEffect(() => providerSignIn?.onResult(message => handleOAuthResultRef.current(message)), [providerSignIn]);

    const handleOAuthLogin = (provider: 'google' | 'apple') => {
        if (!providerSignIn) return;
        setIsOAuthPending(true);
        setActiveProvider(provider);
        providerSignIn.start(provider);
    };

    const isLoading = isOAuthPending || isLoginRelaySocialPending || isCodeExchangePending;

    const openPolicy = (path: string) => navigate(path);

    const policyLinkClass = 'font-medium text-foreground underline underline-offset-2 disabled:opacity-50';

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title="" />

            <div className="flex flex-1 flex-col justify-center overflow-y-auto overscroll-none px-6 pb-safe-bottom">
                <div className="flex flex-col items-center pb-10">
                    <BrandMark height={40} />
                </div>

                {offersSocial && (
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

                        {offersApple && (
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

                <div className={cn('flex flex-col gap-3', offersSocial && 'mt-8')}>
                    {offersSocial && (
                        <div className="flex items-center gap-3">
                            <span className="h-px flex-1 bg-border" />
                            <span className="text-[13px] text-muted-foreground">{t('mypageLogin.or')}</span>
                            <span className="h-px flex-1 bg-border" />
                        </div>
                    )}

                    <p className="text-center text-[13px] leading-[1.5] text-description">
                        {offersSocial ? t('mypageLogin.socialFirstNotice') : t('mypageLogin.socialFirstNoticeBrowser')}
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

                    {emailLoginEnabled && (
                        <button
                            onClick={() => navigate(ROUTES.mypage.loginEmail, { state: location.state })}
                            disabled={isLoading}
                            data-testid="login-email"
                            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-input-border bg-transparent py-[14px] text-[15px] font-medium text-foreground disabled:opacity-50 dark:border-[#3A3A3A]"
                        >
                            <Mail size={20} aria-hidden />
                            {t('mypageLogin.continueWithEmail')}
                        </button>
                    )}

                    {pairingEnabled && (
                        <button
                            onClick={() => navigate(ROUTES.mypage.pairing.code, { state: location.state })}
                            disabled={isLoading}
                            data-testid="login-pairing"
                            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-input-border bg-transparent py-[14px] text-[15px] font-medium text-foreground disabled:opacity-50 dark:border-[#3A3A3A]"
                        >
                            <MonitorSmartphone size={20} aria-hidden />
                            {t('pairing.entry.login')}
                        </button>
                    )}
                </div>

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

            {isPhoneOpen && (
                <PhoneVerifySheet mode="login" onVerified={leaveForReturnTo} onClose={() => setIsPhoneOpen(false)} />
            )}
        </div>
    );
};
