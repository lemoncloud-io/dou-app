import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { QrCode, Smartphone } from 'lucide-react';

import { Button } from '@chatic/ui-kit';

import { canRequestPairing } from '../../pairing/utils/devicePairing';
import { AppleIcon, AuthCard, GoogleIcon } from '../components';
import { useGuestLogin } from '../hooks/useGuestLogin';
import { useAttemptExpired } from '../hooks/useAttemptExpired';
import { useSocialLogin } from '../hooks/useSocialLogin';
import { selectAttemptBusy, useOAuthAttemptStore, type OAuthAttempt } from '../stores/useOAuthAttemptStore';
import {
    PHONE_BUTTON_CLASS,
    isPhoneLoginEnabled,
    isSocialLoginEnabled,
    oauthProviderName,
    type OAuthProvider,
    phoneSignupNoteKey,
} from '../utils';

const SocialLoginWaiting = ({ attempt, failed }: { attempt: OAuthAttempt; failed: boolean }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { start, reopen, cancel, isStarting } = useSocialLogin();
    const expired = useAttemptExpired(attempt);
    const [leaving, setLeaving] = useState(false);
    const busy = useOAuthAttemptStore(selectAttemptBusy);
    const stuck = failed || expired;

    const onCancel = () => {
        setLeaving(true);
        void cancel();
    };
    const usePhone = () => {
        navigate('/auth/phone', { state: { from: '/auth/welcome', signOutOnBack: attempt.signedOutAtStart } });
        void cancel({ keepSession: true });
    };

    return (
        <AuthCard
            live
            title={t('auth.social.waitingTitle')}
            subtitle={t(
                failed
                    ? 'auth.social.waitingFailed'
                    : expired
                      ? 'auth.social.waitingExpired'
                      : attempt.startedAt === undefined
                        ? 'welcome.starting'
                        : 'auth.social.waitingBody',
                { provider: oauthProviderName(attempt.provider) }
            )}
        >
            <div className="flex flex-col gap-2">
                {stuck ? (
                    <Button size="lg" onClick={() => void start(attempt.provider)} disabled={isStarting || leaving}>
                        {isStarting ? t('welcome.starting') : t('auth.social.retry')}
                    </Button>
                ) : (
                    <Button size="lg" variant="outline" onClick={reopen} disabled={leaving || !attempt.nonce}>
                        {t('auth.social.reopen')}
                    </Button>
                )}
                {isPhoneLoginEnabled() && (
                    <Button
                        variant="secondary"
                        size="lg"
                        className={PHONE_BUTTON_CLASS}
                        onClick={usePhone}
                        disabled={leaving || busy}
                    >
                        <Smartphone className="h-4 w-4" />
                        {t('auth.phone.start')}
                    </Button>
                )}
                <Button variant="link" onClick={onCancel} disabled={leaving || busy}>
                    {t('auth.social.cancel')}
                </Button>
            </div>
        </AuthCard>
    );
};

export const WelcomePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const noteId = useId();
    const { submit, isSubmitting, isError } = useGuestLogin();
    const { start: startSocialLogin, isStarting, isError: isSocialError } = useSocialLogin();
    const attempt = useOAuthAttemptStore(s => (s.attempt?.intent === 'login' ? s.attempt : null));
    const attemptFailed = useOAuthAttemptStore(s => s.failed);
    const isBusy = isSubmitting || isStarting;
    const [pressed, setPressed] = useState<OAuthProvider>('google');
    const startWith = (provider: OAuthProvider) => {
        setPressed(provider);
        void startSocialLogin(provider);
    };

    if (attempt) return <SocialLoginWaiting attempt={attempt} failed={attemptFailed} />;

    return (
        <AuthCard title={t('welcome.title')} subtitle={t('welcome.subtitle')}>
            {(isError || isSocialError) && (
                <p role="alert" className="-mt-2 text-callout text-destructive">
                    {t('welcome.registerFailed')}
                </p>
            )}

            <div className="flex flex-col gap-2">
                <Button size="lg" onClick={() => navigate('/auth/login')} disabled={isBusy}>
                    {t('welcome.haveInvite')}
                </Button>
                <Button
                    size="lg"
                    variant="outline"
                    onClick={() => void submit()}
                    disabled={isBusy}
                    aria-describedby="welcome-guest-note"
                >
                    {isSubmitting ? t('welcome.starting') : isError ? t('welcome.retry') : t('welcome.start')}
                </Button>
                <p
                    id="welcome-guest-note"
                    className="-mt-0.5 break-keep text-center text-caption text-muted-foreground"
                >
                    {t('welcome.guestNote')}
                </p>
                {isPhoneLoginEnabled() && (
                    <Button
                        variant="secondary"
                        size="lg"
                        className={PHONE_BUTTON_CLASS}
                        onClick={() => navigate('/auth/phone', { state: { from: '/auth/welcome' } })}
                        disabled={isBusy}
                    >
                        <Smartphone className="h-4 w-4" />
                        {t('auth.phone.start')}
                    </Button>
                )}
                {isSocialLoginEnabled() && (
                    <>
                        <Button
                            variant="outline"
                            size="lg"
                            onClick={() => startWith('google')}
                            disabled={isBusy}
                            aria-describedby={noteId}
                        >
                            <GoogleIcon />
                            {isStarting && pressed === 'google' ? t('welcome.starting') : t('auth.social.google')}
                        </Button>
                        <Button
                            variant="outline"
                            size="lg"
                            onClick={() => startWith('apple')}
                            disabled={isBusy}
                            aria-describedby={noteId}
                        >
                            <AppleIcon />
                            {isStarting && pressed === 'apple' ? t('welcome.starting') : t('auth.social.apple')}
                        </Button>
                        <p id={noteId} className="-mt-0.5 break-keep text-center text-caption text-muted-foreground">
                            {t(phoneSignupNoteKey())}
                        </p>
                    </>
                )}
                {canRequestPairing() && (
                    <Button variant="outline" size="lg" onClick={() => navigate('/auth/pair')} disabled={isBusy}>
                        <QrCode className="h-4 w-4" />
                        {t('pairing.welcome.start')}
                    </Button>
                )}
                {import.meta.env.DEV && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="border border-dashed border-border text-muted-foreground"
                        onClick={() => navigate('/auth/debug')}
                        disabled={isBusy}
                    >
                        {t('welcome.debugLogin')}
                    </Button>
                )}
            </div>
        </AuthCard>
    );
};
