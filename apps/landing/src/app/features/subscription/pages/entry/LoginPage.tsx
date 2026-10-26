import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Banner, type BannerTone, Button, Card } from '../../components/ui';
import { useStartSignIn } from '../../hooks';
import { safeNext } from '../../lib/safeNext';
import { type SignInReason, signInReasonOf } from './signInReason';

import type { SignInProvider } from '../../types';

const REASON_TONES: Record<SignInReason, BannerTone> = {
    canceled: 'neutral',
    'expired-attempt': 'warning',
    failed: 'danger',
    'session-ended': 'info',
};

/**
 * W-02 — sign in with Google or Apple. Signing in leaves this site for the provider and comes back
 * to the callback page, which decides where the reader goes; this page only starts the trip. A
 * `reason` in the query says why the reader is here again and is shown above the buttons.
 */
export const LoginPage = (): JSX.Element => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const startSignIn = useStartSignIn();
    const [startFailed, setStartFailed] = useState(false);
    const reason = startFailed ? 'failed' : signInReasonOf(params.get('reason'));

    const start = async (provider: SignInProvider) => {
        setStartFailed(false);
        try {
            const { redirectUrl } = await startSignIn.mutateAsync({
                provider,
                next: safeNext(params.get('next')),
            });
            // A path on this site (the mock's stand-in consent page) stays in the router; a provider's
            // address — `//host` included — is a real departure.
            if (redirectUrl.startsWith('/') && !redirectUrl.startsWith('//')) navigate(redirectUrl);
            else window.location.assign(redirectUrl);
        } catch {
            setStartFailed(true);
        }
    };

    return (
        <div className="flex justify-center pt-6">
            <Card className="flex w-[440px] flex-col gap-5 p-10">
                <header className="flex flex-col gap-3">
                    <h1 className="text-2xl font-bold text-navy">{t('subscription.entry.login.title')}</h1>
                    <p className="text-[15px] leading-relaxed text-subtitle">{t('subscription.entry.login.body')}</p>
                </header>

                {reason && (
                    <Banner tone={REASON_TONES[reason]} title={t(`subscription.entry.login.reason.${reason}`)} />
                )}

                <div className="flex flex-col gap-4">
                    <Button
                        variant="secondary"
                        size="lg"
                        className="rounded-full"
                        disabled={startSignIn.isPending}
                        onClick={() => start('google')}
                    >
                        {t('subscription.entry.login.google')}
                    </Button>
                    <Button
                        size="lg"
                        className="rounded-full bg-navy text-white"
                        disabled={startSignIn.isPending}
                        onClick={() => start('apple')}
                    >
                        {t('subscription.entry.login.apple')}
                    </Button>
                </div>

                <div className="rounded-xl bg-muted px-4 py-3.5">
                    <p className="text-[13px] font-semibold text-navy">{t('subscription.entry.login.phoneTitle')}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-desc-alt">
                        {t('subscription.entry.login.phoneBody')}
                    </p>
                </div>

                <p className="text-xs text-subtitle">{t('subscription.entry.login.noNewAccounts')}</p>
            </Card>
        </div>
    );
};
