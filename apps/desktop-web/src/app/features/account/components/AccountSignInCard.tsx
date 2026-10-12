import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Smartphone } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { GoogleIcon, isPhoneLoginEnabled, isSocialLoginEnabled, phoneSignupNoteKey, useSocialLogin } from '../../auth';
import { linkedSignInOf, type RelaySignInUser } from '../utils/linkedSignIn';

const providerLabel = (provider: string | undefined, fallback: string): string => {
    if (!provider) return fallback;
    return provider.charAt(0).toUpperCase() + provider.slice(1);
};

/**
 * The guest's ways in, each replacing the guest session on this device: the phone number an account was
 * made with on mobile (when the build allows it), placed first so a phone sign-up does not reach for
 * Google and get a second account, and Google (when the build allows it).
 */
const GuestSignIn = ({ google, phone }: { google: boolean; phone: boolean }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { start, isStarting } = useSocialLogin();
    const noteId = useId();
    return (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-callout font-medium text-foreground">{t('account.signIn.guestTitle')}</span>
                <span className="text-caption text-muted-foreground">{t('profile.signInGoogleHint')}</span>
                {google && (
                    <span id={noteId} className="text-caption text-muted-foreground">
                        {t(phoneSignupNoteKey())}
                    </span>
                )}
            </div>
            <div className="flex shrink-0 flex-col gap-2">
                {phone && (
                    <Button variant="secondary" size="sm" className="gap-2" onClick={() => navigate('/auth/phone')}>
                        <Smartphone className="h-4 w-4" />
                        {t('auth.phone.start')}
                    </Button>
                )}
                {google && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => void start('google')}
                        disabled={isStarting}
                        aria-describedby={noteId}
                    >
                        <GoogleIcon />
                        {t('auth.social.google')}
                    </Button>
                )}
            </div>
        </div>
    );
};

/**
 * How this account signs in. A guest gets the ways to sign in the build allows — Google, with the note
 * for people who signed up with a phone number, and phone-number sign-in; a signed-in account sees its
 * method and nothing to press — linking another method is not offered on desktop. When the relay user carries no `link$`
 * slot the card is left out rather than claiming there is no method.
 */
export const AccountSignInCard = ({ account }: { account: RelaySignInUser | null }) => {
    const { t } = useTranslation();
    const signIn = linkedSignInOf(account);

    if (signIn.kind === 'unknown') return null;
    if (signIn.kind === 'guest') {
        const google = isSocialLoginEnabled();
        const phone = isPhoneLoginEnabled();
        return google || phone ? <GuestSignIn google={google} phone={phone} /> : null;
    }

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
