import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';
import { runtime } from '@chatic/app-runtime';
import { listPhoneCountries } from '@chatic/shared/phone';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { AuthCard } from '../components';
import { PHONE_CODE_LENGTH, usePhoneLogin } from '../hooks/usePhoneLogin';

const fieldClass = cn(
    'focus-ring h-11 rounded-lg border bg-background px-3 text-callout text-foreground outline-none transition-colors',
    'border-control-border focus:border-focus-border disabled:opacity-50'
);

const mmss = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Only a device session may log in by number; a signed-in account would be refused (400). */
const isGuestSession = (): boolean => {
    if (!runtime.session.getIdentityContext().isAuthenticated) return true;
    const user = runtime.session.getRelaySessionUser() as { userRole?: string } | null;
    return !user || user.userRole === 'guest';
};

/** Replacing the session reloads, so the socket, caches and cloud rail start over as the new account. */
const enterApp = () => window.location.replace('/');

/**
 * Sign in with the phone number an account was made with on mobile. Reached from Welcome and, for a
 * guest, from the account hub. Registered on both sides of the router's signed-in switch: sending a
 * code registers the device first, which flips that switch mid-flow, and the page has to survive it.
 *
 * When the number turns out to have no account yet, the server makes one; that is said here before
 * the app opens, because someone expecting their mobile account would otherwise not notice.
 */
export const PhoneLoginPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    // Judged once, on arrival: the sign-in itself turns the session into an account.
    const [allowed] = useState(isGuestSession);
    const [createdAccount, setCreatedAccount] = useState(false);
    const login = usePhoneLogin({
        onSignedIn: ({ isNew }) => (isNew ? setCreatedAccount(true) : enterApp()),
    });
    const countries = useMemo(() => listPhoneCountries(i18n.language), [i18n.language]);

    if (!allowed) return <Navigate to="/" replace />;

    if (createdAccount) {
        return (
            <AuthCard title={t('auth.phone.newAccountTitle')} subtitle={t('auth.phone.newAccountBody')} live>
                <Button size="lg" autoFocus onClick={enterApp}>
                    {t('auth.phone.continue')}
                </Button>
            </AuthCard>
        );
    }

    const isSending = login.busy === 'sending';
    const isConfirming = login.busy === 'confirming';
    const onBack = () => navigate(runtime.session.getIdentityContext().isAuthenticated ? '/' : '/auth/welcome');

    return (
        <AuthCard title={t('auth.phone.title')} subtitle={t('auth.phone.subtitle')} onBack={onBack}>
            <form
                className="flex flex-col gap-3"
                onSubmit={e => {
                    e.preventDefault();
                    if (login.canRequestCode) login.requestCode();
                }}
            >
                <div className="flex gap-2">
                    <label htmlFor="phone-country" className="sr-only">
                        {t('auth.phone.country')}
                    </label>
                    <select
                        id="phone-country"
                        value={login.country ?? ''}
                        onChange={e => login.changeCountry(e.target.value)}
                        disabled={login.busy !== 'idle'}
                        className={cn(fieldClass, 'w-32 shrink-0')}
                    >
                        {!login.country && <option value="">{t('auth.phone.country')}</option>}
                        {countries.map(c => (
                            <option key={c.code} value={c.code}>
                                {`${c.name} ${c.dialCode}`}
                            </option>
                        ))}
                    </select>
                    <label htmlFor="phone-number" className="sr-only">
                        {t('auth.phone.number')}
                    </label>
                    <input
                        id="phone-number"
                        autoFocus
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        value={login.phone}
                        onChange={e => login.changePhone(e.target.value)}
                        placeholder={t('auth.phone.number')}
                        disabled={login.busy !== 'idle'}
                        aria-invalid={login.phoneError ? true : undefined}
                        aria-describedby={login.phoneError ? 'phone-number-error' : undefined}
                        className={cn(fieldClass, 'min-w-0 flex-1')}
                    />
                </div>
                {login.phoneError && (
                    <p id="phone-number-error" role="alert" className="text-callout text-destructive">
                        {t(`auth.phone.error.${login.phoneError}`)}
                    </p>
                )}
                {!login.codeSent && (
                    <Button type="submit" size="lg" disabled={!login.canRequestCode}>
                        {isSending ? t('auth.phone.sending') : t('auth.phone.sendCode')}
                    </Button>
                )}
            </form>

            {login.codeSent && (
                <div className="flex flex-col gap-3">
                    <label htmlFor="phone-code" className="text-callout font-medium text-foreground">
                        {t('auth.phone.code')}
                    </label>
                    <input
                        id="phone-code"
                        autoFocus
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={PHONE_CODE_LENGTH}
                        value={login.otp}
                        onChange={e => login.changeOtp(e.target.value)}
                        disabled={login.busy !== 'idle' || login.isRetry}
                        aria-invalid={login.codeError ? true : undefined}
                        aria-describedby="phone-code-hint"
                        className={cn(fieldClass, 'tracking-[0.3em]')}
                    />
                    <p id="phone-code-hint" className="text-caption text-muted-foreground">
                        {login.countdown && !login.countdown.isExpired
                            ? `${t('auth.phone.codeHint')} ${t('auth.phone.expiresIn', { time: mmss(login.countdown.secondsLeft) })}`
                            : t('auth.phone.codeHint')}
                    </p>
                    {login.codeError && (
                        <p role="alert" className="text-callout text-destructive">
                            {t(`auth.phone.error.${login.codeError}`)}
                        </p>
                    )}
                    {login.isRetry ? (
                        <Button size="lg" onClick={login.retrySwitch} disabled={isConfirming}>
                            {isConfirming ? t('auth.phone.confirming') : t('auth.phone.retry')}
                        </Button>
                    ) : (
                        isConfirming && (
                            <p className="text-center text-callout text-muted-foreground" aria-live="polite">
                                {t('auth.phone.confirming')}
                            </p>
                        )
                    )}
                    {!login.isRetry && (
                        <Button variant="link" size="sm" onClick={login.resend} disabled={!login.canResend}>
                            {t('auth.phone.resend')}
                        </Button>
                    )}
                </div>
            )}
        </AuthCard>
    );
};
