import { type JSX, type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBillingInfo, useNow, useRequestEmailCode, useResendEmailCode, useVerifyEmailCode } from '../hooks';
import { isPortError } from '../lib/port';
import { cn, formatMinutesSeconds, formatTimeOfDay, isEmailAddress, secondsUntil } from '../utils';
import { Badge, Button } from './ui';

import type { BillingEmail, EmailCodeTicket } from '../types';

type Step = 'address' | 'code' | 'verified';

const INPUT =
    'h-12 min-w-0 flex-1 rounded-lg border bg-card px-3 text-sm text-navy outline-none ' +
    'placeholder:text-subtitle/60 focus:border-navy read-only:bg-muted';

const k = (key: string) => `subscription.common.email.${key}`;

/**
 * Verifying one billing address by code, shared by the email step (W-24) and the change popup:
 * address → "get code" → the code with its countdown → verified. Every limit the reader meets — the
 * code's lifetime, the resend interval, the tries left, the lock — comes from the port's ticket or
 * error, so this form holds no rule of its own.
 *
 * `refuse` turns away an address before any code is sent (the current address, in a change).
 * An address already verified for this account is taken as it is, without a code.
 */
export const EmailVerificationForm = ({
    idPrefix,
    label,
    initialAddress = '',
    refuse,
    onVerified,
    onPending,
    onReset,
    onBusyChange,
}: {
    idPrefix: string;
    label: ReactNode;
    initialAddress?: string;
    /** Returns a copy key when the address is not allowed here. */
    refuse?: (address: string) => string | undefined;
    onVerified: (email: BillingEmail) => void;
    /** An address now waiting for its code — so a caller can clean it up if the reader walks away. */
    onPending?: (emailId: string) => void;
    /** The reader chose another address, after a code was sent or after verifying. */
    onReset?: () => void;
    /** A request is in flight — a popup holding this form should not close under it. */
    onBusyChange?: (busy: boolean) => void;
}): JSX.Element => {
    const { t } = useTranslation();
    const billing = useBillingInfo();
    const request = useRequestEmailCode();
    const resend = useResendEmailCode();
    const verify = useVerifyEmailCode();

    const [step, setStep] = useState<Step>('address');
    const [address, setAddress] = useState(initialAddress);
    const [ticket, setTicket] = useState<EmailCodeTicket>();
    const [sentFor, setSentFor] = useState<number>(0);
    const [code, setCode] = useState('');
    const [error, setError] = useState<string>();

    const now = useNow(step === 'code');
    const pending = request.isPending || resend.isPending || verify.isPending;
    useEffect(() => onBusyChange?.(pending), [pending, onBusyChange]);

    const resendIn = ticket ? secondsUntil(ticket.resendAt, now) : 0;
    const remaining = ticket ? secondsUntil(ticket.expiresAt, now) : 0;

    const errorFor = (err: unknown): string => {
        if (isPortError(err, 'disposableEmail')) return t(k('error.disposable'));
        if (isPortError(err, 'limit')) return t(k('error.limit'));
        if (isPortError(err, 'invalidCode')) return t(k('error.invalidCode'), { count: err.detail?.attemptsLeft ?? 0 });
        if (isPortError(err, 'tooManyAttempts')) return t(k('error.tooManyAttempts'));
        if (isPortError(err, 'codeExpired')) return t(k('error.expired'));
        if (isPortError(err, 'resendLimit')) {
            return t(k('error.resendLimit'), { time: err.detail?.retryAt ? formatTimeOfDay(err.detail.retryAt) : '' });
        }
        if (isPortError(err, 'conflict') && err.detail?.retryAt) return t(k('error.tooSoon'));
        if (isPortError(err, 'network')) return t('subscription.common.error.network');
        return t('subscription.common.error.unknown');
    };

    const accept = (next: EmailCodeTicket) => {
        setTicket(next);
        // The lifetime this code was sent with, for "enter it within N minutes".
        setSentFor(Math.round(secondsUntil(next.expiresAt, Date.now()) / 60));
        setCode('');
        setStep('code');
        onPending?.(next.emailId);
    };

    const sendCode = () => {
        const trimmed = address.trim();
        if (!isEmailAddress(trimmed)) return setError(t(k('error.invalidAddress')));
        const refused = refuse?.(trimmed);
        if (refused) return setError(t(refused));
        setError(undefined);
        request.mutate(trimmed, {
            onSuccess: accept,
            onError: async err => {
                // Already verified for this account: nothing to send, use it as it is.
                if (isPortError(err, 'conflict') && !err.detail) {
                    const known = (await billing.refetch()).data?.emails.find(
                        email => email.address.toLowerCase() === trimmed.toLowerCase() && email.status === 'verified'
                    );
                    if (known) {
                        setStep('verified');
                        onVerified(known);
                        return;
                    }
                }
                setError(errorFor(err));
            },
        });
    };

    const sendAgain = () => {
        if (!ticket) return;
        setError(undefined);
        resend.mutate(ticket.emailId, { onSuccess: accept, onError: err => setError(errorFor(err)) });
    };

    const check = () => {
        if (!ticket) return;
        setError(undefined);
        verify.mutate(
            { emailId: ticket.emailId, code: code.trim() },
            {
                onSuccess: email => {
                    setStep('verified');
                    onVerified(email);
                },
                onError: err => setError(errorFor(err)),
            }
        );
    };

    const startOver = () => {
        setStep('address');
        setAddress('');
        setTicket(undefined);
        setCode('');
        setError(undefined);
        onReset?.();
    };

    return (
        <div className="flex flex-col gap-2">
            <label htmlFor={`${idPrefix}-address`} className="text-[13px] font-medium text-navy">
                {label}
            </label>
            <div className="flex gap-2">
                <div className="relative flex min-w-0 flex-1">
                    <input
                        id={`${idPrefix}-address`}
                        type="email"
                        autoComplete="email"
                        className={cn(
                            INPUT,
                            error && step === 'address' ? 'border-status-danger' : 'border-border',
                            step === 'verified' && 'pr-24'
                        )}
                        placeholder={t(k('placeholder'))}
                        value={address}
                        readOnly={step !== 'address'}
                        onChange={event => setAddress(event.target.value)}
                        onKeyDown={event => event.key === 'Enter' && step === 'address' && !pending && sendCode()}
                    />
                    {step === 'verified' && (
                        <Badge tone="success" className="absolute right-3 top-1/2 -translate-y-1/2">
                            ✓ {t(k('verified'))}
                        </Badge>
                    )}
                </div>
                {step === 'address' && (
                    <Button variant="secondary" size="lg" disabled={pending || !address.trim()} onClick={sendCode}>
                        {t(k('sendCode'))}
                    </Button>
                )}
                {step === 'code' && (
                    <Button variant="secondary" size="lg" disabled={pending || resendIn > 0} onClick={sendAgain}>
                        {resendIn > 0 ? t(k('resendIn'), { seconds: resendIn }) : t(k('resend'))}
                    </Button>
                )}
                {step === 'verified' && (
                    <Button variant="secondary" size="lg" disabled={pending} onClick={startOver}>
                        {t(k('reenter'))}
                    </Button>
                )}
            </div>

            {step === 'code' && (
                <>
                    <div className="flex items-center gap-2">
                        <input
                            id={`${idPrefix}-code`}
                            aria-label={t(k('code'))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            className={cn(INPUT, 'max-w-[200px]', error ? 'border-status-danger' : 'border-border')}
                            placeholder={t(k('code'))}
                            value={code}
                            onChange={event => setCode(event.target.value)}
                            onKeyDown={event =>
                                event.key === 'Enter' && code.trim() && !pending && remaining > 0 && check()
                            }
                        />
                        <Button size="lg" disabled={pending || !code.trim() || remaining === 0} onClick={check}>
                            {t(k('verify'))}
                        </Button>
                        <span className="text-[13px] text-subtitle" aria-live="off">
                            {t(k('remaining'), { time: formatMinutesSeconds(remaining) })}
                        </span>
                    </div>
                    <p className="text-xs text-desc-alt">
                        {t(k('sent'), { address: address.trim(), minutes: sentFor })}
                    </p>
                    <p className="text-xs text-subtitle">
                        {t(k('spam'))} {/* A mistyped address is fixed here, before any code is checked. */}
                        <button
                            type="button"
                            className="underline hover:text-navy"
                            disabled={pending}
                            onClick={startOver}
                        >
                            {t(k('otherAddress'))}
                        </button>
                    </p>
                </>
            )}
            {error && (
                <p role="alert" className="text-xs text-status-danger">
                    {error}
                </p>
            )}
            <div className="mt-1 rounded-lg bg-muted px-4 py-3 text-xs leading-5 text-desc-alt">
                <p>{t(k('policyCode'))}</p>
                <p>{t(k('policyResend'))}</p>
            </div>
        </div>
    );
};
