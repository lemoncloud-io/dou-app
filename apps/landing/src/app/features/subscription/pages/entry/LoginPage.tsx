import { type JSX, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import iconApple from '../../../../../assets/subscription/icon-apple.svg';
import iconGoogle from '../../../../../assets/subscription/icon-google.svg';
import { AuthCard } from '../../components';
import { Banner, type BannerTone } from '../../components/ui';
import { useStartSignIn } from '../../hooks';
import { safeNext } from '../../lib/safeNext';
import { cn } from '../../utils';
import { type SignInReason, signInReasonOf } from './signInReason';

import type { SignInProvider } from '../../types';

const REASON_TONES: Record<SignInReason, BannerTone> = {
    canceled: 'neutral',
    'expired-attempt': 'warning',
    failed: 'danger',
    'session-ended': 'info',
};

/** A provider's button: its mark on the left, its name centred — the spacer on the right keeps it so. */
const ProviderButton = ({
    icon,
    dark = false,
    disabled,
    onClick,
    children,
}: {
    icon: string;
    dark?: boolean;
    disabled: boolean;
    onClick: () => void;
    children: ReactNode;
}): JSX.Element => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
            'flex h-[52px] w-full items-center gap-3 rounded-full px-6 text-base font-semibold transition-opacity',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 disabled:pointer-events-none disabled:opacity-40',
            dark ? 'bg-navy text-white hover:opacity-90' : 'border border-[#e5e5e8] bg-white text-ink hover:bg-muted'
        )}
    >
        <img src={icon} alt="" aria-hidden className="size-5 shrink-0" />
        <span className="flex-1 text-center">{children}</span>
        <span aria-hidden className="size-5 shrink-0" />
    </button>
);

/**
 * W-02 — sign in with Google or Apple. Signing in leaves this site for the provider and comes back
 * to the callback page, which decides where the reader goes; this page only starts the trip. A
 * `reason` in the query says why the reader is here again and is shown above the buttons.
 *
 * Signing in by phone number is not here: the web has no SMS sign-in, and a reader who joined the app
 * that way is told to link Google or Apple in the app first.
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
        <AuthCard>
            <header className="flex flex-col gap-2">
                <h1 className="text-[22px] font-bold leading-[1.5] text-ink md:text-2xl">
                    {t('subscription.entry.login.title')}
                </h1>
                <p className="text-sm font-medium leading-[1.5] text-mute md:text-[15px]">
                    {t('subscription.entry.login.body')}
                </p>
            </header>

            {reason && <Banner tone={REASON_TONES[reason]} title={t(`subscription.entry.login.reason.${reason}`)} />}

            <div className="flex flex-col gap-3">
                <ProviderButton dark icon={iconApple} disabled={startSignIn.isPending} onClick={() => start('apple')}>
                    {t('subscription.entry.login.apple')}
                </ProviderButton>
                <ProviderButton icon={iconGoogle} disabled={startSignIn.isPending} onClick={() => start('google')}>
                    {t('subscription.entry.login.google')}
                </ProviderButton>
                <div className="flex items-center gap-3 py-2">
                    <span className="h-px flex-1 bg-[#e5e5e8]" />
                    <span className="text-[13px] font-medium text-[#999ca3]">{t('subscription.entry.login.or')}</span>
                    <span className="h-px flex-1 bg-[#e5e5e8]" />
                </div>
                <div className="rounded-xl bg-note px-4 py-3.5">
                    <p className="text-[13px] font-bold text-ink">{t('subscription.entry.login.phoneTitle')}</p>
                    <p className="mt-1.5 text-[13px] font-medium leading-[1.6] text-[#666b78]">
                        {t('subscription.entry.login.phoneBody')}
                    </p>
                </div>
            </div>

            <p className="text-xs font-medium text-mute">{t('subscription.entry.login.noNewAccounts')}</p>
        </AuthCard>
    );
};
