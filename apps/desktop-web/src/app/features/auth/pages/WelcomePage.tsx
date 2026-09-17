import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { AuthCard, GoogleIcon } from '../components';
import { useGuestLogin } from '../hooks/useGuestLogin';
import { useSocialLogin } from '../hooks/useSocialLogin';
import { isSocialLoginEnabled } from '../utils';

/**
 * First-run landing. Offers a one-tap guest start (device-register into the
 * Default Cloud's Self Channel) plus a secondary path for users who hold an
 * Invite Code. Replaces the invite-only gate as the default unauthenticated screen.
 */
export const WelcomePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { submit, isSubmitting, isError } = useGuestLogin();
    const { start: startSocialLogin } = useSocialLogin();

    return (
        <AuthCard title={t('welcome.title')} subtitle={t('welcome.subtitle')}>
            {isError && (
                <p role="alert" className="-mt-2 text-sm text-destructive">
                    {t('welcome.registerFailed')}
                </p>
            )}

            {/* One filled primary leads; the alternatives sit under it, and the
                invite path is a link rather than a fourth identical pill. */}
            <div className="flex flex-col gap-2">
                <Button
                    size="lg"
                    onClick={() => void submit()}
                    disabled={isSubmitting}
                    aria-describedby="welcome-guest-note"
                >
                    {isSubmitting ? t('welcome.starting') : isError ? t('welcome.retry') : t('welcome.start')}
                </Button>
                {/* The button mints a guest account. Saying so here, not only in the
                    logout confirmation, is the difference between a choice and a surprise. */}
                <p id="welcome-guest-note" className="-mt-0.5 text-center text-caption text-muted-foreground">
                    {t('welcome.guestNote')}
                </p>
                {isSocialLoginEnabled() && (
                    <Button
                        variant="outline"
                        size="lg"
                        onClick={() => startSocialLogin('google')}
                        disabled={isSubmitting}
                    >
                        <GoogleIcon />
                        {t('auth.social.google')}
                    </Button>
                )}
                <Button variant="link" onClick={() => navigate('/auth/login')} disabled={isSubmitting}>
                    {t('welcome.haveInvite')}
                </Button>
                {/* Dev-only email/password sign-in. Gated on import.meta.env.DEV so it's
                    dead-code-eliminated from production builds — mirrors the /auth/debug
                    route guard in routes.tsx; never ships in the installed app. */}
                {import.meta.env.DEV && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="border border-dashed border-border text-muted-foreground"
                        onClick={() => navigate('/auth/debug')}
                        disabled={isSubmitting}
                    >
                        {t('welcome.debugLogin')}
                    </Button>
                )}
            </div>
        </AuthCard>
    );
};
