import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { GoogleIcon, isSocialLoginEnabled, useSocialLogin } from '../../auth';
import { linkedSignInOf, type RelaySignInUser } from '../utils/linkedSignIn';

const providerLabel = (provider: string | undefined, fallback: string): string => {
    if (!provider) return fallback;
    return provider.charAt(0).toUpperCase() + provider.slice(1);
};

/** The guest's way in: Google sign-in replaces the guest session on this device. */
const GuestGoogleSignIn = () => {
    const { t } = useTranslation();
    const { start, isStarting } = useSocialLogin();
    const noteId = useId();
    return (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-callout font-medium text-foreground">{t('profile.signInGoogle')}</span>
                <span className="text-caption text-muted-foreground">{t('profile.signInGoogleHint')}</span>
                <span id={noteId} className="text-caption text-muted-foreground">
                    {t('auth.social.phoneSignupNote')}
                </span>
            </div>
            <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-2"
                onClick={() => void start('google')}
                disabled={isStarting}
                aria-describedby={noteId}
            >
                <GoogleIcon />
                {t('auth.social.google')}
            </Button>
        </div>
    );
};

/**
 * How this account signs in. A guest gets the Google sign-in start (when the build allows it) and the
 * note for people who signed up with a phone number; a signed-in account sees its method and nothing to
 * press — linking another method is not offered on desktop. When the relay user carries no `link$`
 * slot the card is left out rather than claiming there is no method.
 */
export const AccountSignInCard = ({ account }: { account: RelaySignInUser | null }) => {
    const { t } = useTranslation();
    const signIn = linkedSignInOf(account);

    if (signIn.kind === 'unknown') return null;
    if (signIn.kind === 'guest') return isSocialLoginEnabled() ? <GuestGoogleSignIn /> : null;

    const value =
        signIn.kind === 'social'
            ? [providerLabel(signIn.provider, t('account.signIn.social')), signIn.hint].filter(Boolean).join(' · ')
            : signIn.kind === 'phone'
              ? signIn.hint
                  ? t('account.signIn.phoneHint', { last4: signIn.hint })
                  : t('account.signIn.phone')
              : signIn.kind === 'email'
                ? [t('account.signIn.email'), signIn.hint].filter(Boolean).join(' · ')
                : t('account.signIn.none');

    return (
        <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-card p-5">
            <span className="text-callout font-medium text-foreground">{t('account.signIn.title')}</span>
            <span className="truncate text-caption text-muted-foreground">{value}</span>
        </div>
    );
};
