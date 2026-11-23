import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { cn } from '@chatic/ui-kit';
import { runtime } from '@chatic/runtime';
import { listPhoneCountries } from '@chatic/shared/phone';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { AuthCard, NewAccountName } from '../components';
import { PHONE_CODE_LENGTH, usePhoneLogin } from '../hooks/usePhoneLogin';
import { useSignOutGuest } from '../hooks/useSignOutGuest';

export interface PhoneLoginEntry {
    from?: string;
    signOutOnBack?: boolean;
}

const fieldClass = cn(
    'focus-ring h-11 rounded-lg border bg-background px-3 text-callout text-foreground outline-none transition-colors',
    'border-control-border focus:border-focus-border disabled:opacity-50'
);

const mmss = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const isGuestSession = (): boolean => {
    if (!runtime.session.getIdentityContext().isAuthenticated) return true;
    const user = runtime.session.getRelaySessionUser() as { userRole?: string } | null;
    return !user || user.userRole === 'guest';
};

const enterApp = () => window.location.replace('/');

export const PhoneLoginPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const entry = (useLocation().state ?? {}) as PhoneLoginEntry;
    const signOutGuest = useSignOutGuest();
    const [allowed] = useState(isGuestSession);
    const [arrivedSignedOut] = useState(() => !runtime.session.getIdentityContext().isAuthenticated);
    const [leaving, setLeaving] = useState(false);
    const [createdAccount, setCreatedAccount] = useState(false);
    const login = usePhoneLogin({
        onSignedIn: ({ isNew }) => (isNew ? setCreatedAccount(true) : enterApp()),
    });
    const countries = useMemo(() => listPhoneCountries(i18n.language), [i18n.language]);

    if (!allowed) return <Navigate to="/" replace />;

    if (createdAccount) {
        return (
            <AuthCard title={t('auth.phone.newAccountTitle')} subtitle={t('auth.phone.newAccountBody')} live>
                <NewAccountName onDone={enterApp} />
            </AuthCard>
        );
    }

    const isSending = login.busy === 'sending';
    const isConfirming = login.busy === 'confirming';
    const onBack = () => {
        const signedIn = runtime.session.getIdentityContext().isAuthenticated;
        if (signedIn && (arrivedSignedOut || entry.signOutOnBack) && isGuestSession()) {
            setLeaving(true);
            void signOutGuest().catch(() => {
                setLeaving(false);
                navigate('/', { replace: true });
            });
            return;
        }
        navigate(entry.from ?? (signedIn ? '/' : '/auth/welcome'));
    };

    return (
        <AuthCard
            title={t('auth.phone.title')}
            subtitle={t('auth.phone.subtitle')}
            onBack={leaving ? undefined : onBack}
        >
            <form
                className="flex flex-col gap-3"
                onSubmit={e => {
                    e.preventDefault();
                    void login.requestCode();
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
                                {`${c.dialCode} ${c.name}`}
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
                    <Button type="submit" size="lg" disabled={login.busy !== 'idle'}>
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
                    <p id="phone-code-hint" className="break-keep text-caption text-muted-foreground">
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
                            {login.resendIn > 0
                                ? t('auth.phone.resendIn', { time: mmss(login.resendIn) })
                                : t('auth.phone.resend')}
                        </Button>
                    )}
                </div>
            )}
        </AuthCard>
    );
};
