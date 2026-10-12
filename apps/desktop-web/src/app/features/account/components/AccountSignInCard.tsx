import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Smartphone } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { GoogleIcon, isPhoneLoginEnabled, isSocialLoginEnabled, phoneSignupNoteKey, useSocialLogin } from '../../auth';
import { linkedSignInOf, type LinkedMethod, type RelaySignInUser } from '../utils/linkedSignIn';

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
 * Links Google to the account signed in here. The browser round trip is the sign-in one; the code that
 * comes back is linked rather than signed in with, so the session stays and nothing reloads.
 */
const LinkGoogle = () => {
    const { t } = useTranslation();
    const { startLink } = useSocialLogin();
    const hintId = useId();
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <span id={hintId} className="min-w-0 flex-1 text-caption text-muted-foreground">
                {t('account.signIn.link.hint')}
            </span>
            <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-2"
                onClick={() => startLink('google')}
                aria-describedby={hintId}
            >
                <GoogleIcon />
                {t('account.signIn.link.google')}
            </Button>
        </div>
    );
};

/**
 * How this account signs in. A guest gets the ways to sign in the build allows — Google, with the note
 * for people who signed up with a phone number, and phone-number sign-in. A signed-in account sees every
 * method linked to it and, while it has no social account and the build allows Google, a button that
 * links Google. When the relay user carries no `link$` slot the card is left out rather than claiming
 * there is no method.
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

    const methods = signIn.kind === 'linked' ? signIn.methods : [];
    const label = (method: LinkedMethod): string =>
        method.kind === 'social'
            ? [providerLabel(method.provider, t('account.signIn.social')), method.hint].filter(Boolean).join(' · ')
            : method.kind === 'phone'
              ? method.hint
                  ? t('account.signIn.phoneHint', { last4: method.hint })
                  : t('account.signIn.phone')
              : [t('account.signIn.email'), method.hint].filter(Boolean).join(' · ');
    // The server keeps one social slot per account: with one taken, another is refused (`type-linked`).
    const canLinkGoogle = isSocialLoginEnabled() && !methods.some(method => method.kind === 'social');

    return (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col gap-0.5">
                <span className="text-callout font-medium text-foreground">{t('account.signIn.title')}</span>
                {methods.length ? (
                    methods.map(method => (
                        <span key={method.kind} className="truncate text-caption text-muted-foreground">
                            {label(method)}
                        </span>
                    ))
                ) : (
                    <span className="text-caption text-muted-foreground">{t('account.signIn.none')}</span>
                )}
            </div>
            {canLinkGoogle && <LinkGoogle />}
        </div>
    );
};
