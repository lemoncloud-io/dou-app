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
    addressNote,
    verifiedNote,
    policyExtra,
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
    /** A line under the address field, before any code is sent (the Apple note on the email step). */
    addressNote?: ReactNode;
    /** A line once the address is verified (the change popup's "press change" note). */
    verifiedNote?: ReactNode;
    /** More lines inside the code-rules box. */
    policyExtra?: ReactNode;
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
    // Codes for this address are used up until this instant (ISO); the code step is shut until then.
    const [lockedUntil, setLockedUntil] = useState<string>();
    const [checkingKnown, setCheckingKnown] = useState(false);

    const now = useNow(step === 'code');
    const pending = request.isPending || resend.isPending || verify.isPending || checkingKnown;
    useEffect(() => onBusyChange?.(pending), [pending, onBusyChange]);

    const resendIn = ticket ? secondsUntil(ticket.resendAt, now) : 0;
    const remaining = ticket ? secondsUntil(ticket.expiresAt, now) : 0;
    const lockLeft = lockedUntil ? secondsUntil(lockedUntil, now) : 0;
    const locked = lockLeft > 0;
    const expired = step === 'code' && !!ticket && remaining === 0 && !locked;
    // The code field is shut once its code is dead or the address is locked.
    const codeShut = expired || locked;

    const errorFor = (err: unknown): string => {
        if (isPortError(err, 'disposableEmail')) return t(k('error.disposable'));
        if (isPortError(err, 'limit')) return t(k('error.limit'));
        if (isPortError(err, 'invalidCode')) return t(k('error.invalidCode'), { count: err.detail?.attemptsLeft ?? 0 });
        if (isPortError(err, 'tooManyAttempts')) return t(k('error.tooManyAttempts'));
        if (isPortError(err, 'codeExpired')) return t(k('error.expired'));
        if (isPortError(err, 'resendLimit')) {
            const until = err.detail?.retryAt;
            return t(k('error.resendLimit'), {
                count: until ? Math.max(1, Math.round(secondsUntil(until, Date.now()) / 60)) : 0,
                time: until ? formatTimeOfDay(until) : '',
            });
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
                    setCheckingKnown(true);
                    const known = (await billing.refetch().finally(() => setCheckingKnown(false))).data?.emails.find(
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
        resend.mutate(ticket.emailId, {
            onSuccess: next => {
                setLockedUntil(undefined);
                accept(next);
            },
            onError: err => {
                if (isPortError(err, 'resendLimit') && err.detail?.retryAt) setLockedUntil(err.detail.retryAt);
                setError(errorFor(err));
            },
        });
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
        setLockedUntil(undefined);
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
                    <Button
                        variant="secondary"
                        size="lg"
                        disabled={pending || resendIn > 0 || locked}
                        onClick={sendAgain}
                    >
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
                            className={cn(
                                INPUT,
                                'max-w-[200px] disabled:bg-muted',
                                error && !codeShut ? 'border-status-danger' : 'border-border'
                            )}
                            disabled={codeShut}
                            placeholder={t(k('code'))}
                            value={code}
                            onChange={event => setCode(event.target.value)}
                            onKeyDown={event =>
                                event.key === 'Enter' && code.trim() && !pending && remaining > 0 && check()
                            }
                        />
                        <Button size="lg" disabled={pending || !code.trim() || codeShut} onClick={check}>
                            {t(k('verify'))}
                        </Button>
                        <span
                            className={cn(
                                'text-[13px]',
                                codeShut ? 'font-semibold text-status-danger' : 'text-subtitle'
                            )}
                            aria-live="off"
                        >
                            {locked
                                ? t(k('lockedFor'), { time: formatMinutesSeconds(lockLeft) })
                                : expired
                                  ? formatMinutesSeconds(0)
                                  : t(k('remaining'), { time: formatMinutesSeconds(remaining) })}
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
            {step === 'address' && addressNote}
            {step === 'verified' && verifiedNote}
            {/* A code that ran out says so by itself, without waiting for a check to fail. */}
            {(error || expired) && (
                <p role="alert" className="text-xs text-status-danger">
                    {expired && !error ? t(k('error.expired')) : error}
                </p>
            )}
            <EmailCodePolicy extra={policyExtra} />
        </div>
    );
};

/**
 * The code rules box, the same in the form and on the email step's no-code scenes. The rules are
 * copy describing the published policy; the counts the reader acts on come from the port.
 */
export const EmailCodePolicy = ({ extra }: { extra?: ReactNode }): JSX.Element => {
    const { t } = useTranslation();
    return (
        <div className="mt-1 rounded-lg bg-muted px-4 py-3 text-xs leading-5 text-desc-alt">
            <p>{t(k('policyCode'))}</p>
            <p>{t(k('policyResend'))}</p>
            {extra}
        </div>
    );
};
