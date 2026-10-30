import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { QrCode, Smartphone } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { canRequestPairing } from '../../pairing/utils/devicePairing';
import { AuthCard, GoogleIcon } from '../components';
import { useGuestLogin } from '../hooks/useGuestLogin';
import { useAttemptExpired } from '../hooks/useAttemptExpired';
import { useSocialLogin } from '../hooks/useSocialLogin';
import { selectAttemptBusy, useOAuthAttemptStore, type OAuthAttempt } from '../stores/useOAuthAttemptStore';
import { PHONE_BUTTON_CLASS, isPhoneLoginEnabled, isSocialLoginEnabled, phoneSignupNoteKey } from '../utils';

/**
 * The Google sign-in is out in the system browser. Said here, with the ways out, rather than leaving
 * the person on a page that looks like nothing happened: open the browser again, sign in with the
 * phone number instead, or cancel, which undoes the device registration the start made.
 */
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
        // Navigate first: the cancel releases the held Welcome route, and phone sign-in needs the
        // device session this start registered, so it stays.
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
                        : 'auth.social.waitingBody'
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

/**
 * First-run landing. Leads with the invite link, then offers a one-tap guest start
 * (device-register into the Default Cloud's Self Channel) and the sign-in paths. Replaces the
 * invite-only gate as the default unauthenticated screen.
 */
export const WelcomePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const noteId = useId();
    const { submit, isSubmitting, isError } = useGuestLogin();
    const { start: startSocialLogin, isStarting, isError: isSocialError } = useSocialLogin();
    const attempt = useOAuthAttemptStore(s => (s.attempt?.intent === 'login' ? s.attempt : null));
    const attemptFailed = useOAuthAttemptStore(s => s.failed);
    const isBusy = isSubmitting || isStarting;

    // From the moment the start begins, retries included: a second start from the buttons below would
    // write a second record over the first one's nonce.
    if (attempt) return <SocialLoginWaiting attempt={attempt} failed={attemptFailed} />;

    return (
        <AuthCard title={t('welcome.title')} subtitle={t('welcome.subtitle')}>
            {(isError || isSocialError) && (
                <p role="alert" className="-mt-2 text-callout text-destructive">
                    {t('welcome.registerFailed')}
                </p>
            )}

            {/* One filled primary leads and it is the invite link: someone who installed the app without
                a link is here to join something, and the other ways in sit under it. */}
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
                {/* The button mints a guest account. Saying so here, not only in the
                    logout confirmation, is the difference between a choice and a surprise. */}
                <p
                    id="welcome-guest-note"
                    className="-mt-0.5 break-keep text-center text-caption text-muted-foreground"
                >
                    {t('welcome.guestNote')}
                </p>
                {/* Phone before Google, and weighted above it: someone who signed up on mobile with a
                    number gets a second, empty account from Google until Google is linked to theirs. The
                    order steers them; nothing stops someone who signed up with Google. */}
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
                            onClick={() => void startSocialLogin('google')}
                            disabled={isBusy}
                            aria-describedby={noteId}
                        >
                            <GoogleIcon />
                            {isStarting ? t('welcome.starting') : t('auth.social.google')}
                        </Button>
                        {/* Said before the tap: someone who signed up on mobile with a phone number
                            and never linked Google there gets a new, empty account from this button. */}
                        <p id={noteId} className="-mt-0.5 break-keep text-center text-caption text-muted-foreground">
                            {t(phoneSignupNoteKey())}
                        </p>
                    </>
                )}
                {/* A browser can borrow the session of an app that is already signed in, by showing a code
                    that app approves. Not in the desktop app, which is the approving side. */}
                {canRequestPairing() && (
                    <Button variant="outline" size="lg" onClick={() => navigate('/auth/pair')} disabled={isBusy}>
                        <QrCode className="h-4 w-4" />
                        {t('pairing.welcome.start')}
                    </Button>
                )}
                {/* Dev-only email/password sign-in. Gated on import.meta.env.DEV so it's
                    dead-code-eliminated from production builds — mirrors the /auth/debug
                    route guard in routes.tsx; never ships in the installed app. */}
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
