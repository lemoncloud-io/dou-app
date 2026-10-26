import { type JSX, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button } from '../../components/ui';
import { useBillingInfo, useRequestEmailCode, useVerifyEmailCode } from '../../hooks';
import { isPortError } from '../../lib/port';
import { isEmailShaped } from './flow';

/** A verified billing address: what the checkout sends to `startCheckout`. */
export interface VerifiedEmail {
    id: string;
    address: string;
}

const inputClass =
    'h-12 w-full rounded-xl border border-border bg-white px-4 text-[15px] text-navy outline-none focus:border-navy/40 disabled:bg-muted';

/**
 * W-08's billing email: an address the receipts go to, verified by a code before the checkout may
 * continue. An account that already has a verified primary address starts with it; anyone else starts
 * from the sign-in address, which they can change.
 */
export const BillingEmailField = ({
    defaultAddress,
    value,
    onChange,
}: {
    /** The sign-in address, offered when there is no verified billing address yet. */
    defaultAddress?: string;
    value: VerifiedEmail | undefined;
    onChange: (email: VerifiedEmail | undefined) => void;
}): JSX.Element => {
    const { t } = useTranslation();
    const { data: billing, refetch: reloadBillingInfo } = useBillingInfo();
    const requestCode = useRequestEmailCode();
    const verifyCode = useVerifyEmailCode();

    const [address, setAddress] = useState(defaultAddress ?? '');
    const [pendingId, setPendingId] = useState<string>();
    const [code, setCode] = useState('');
    const [error, setError] = useState<string>();
    const [seeded, setSeeded] = useState(false);

    // Seeded once from the account's verified primary address. After that the reader's own edits win,
    // including clearing it with "change".
    useEffect(() => {
        if (seeded || !billing) return;
        setSeeded(true);
        const primary = billing.emails.find(email => email.primary && email.status === 'verified');
        if (primary && !value) onChange({ id: primary.id, address: primary.address });
    }, [billing, seeded, value, onChange]);

    const errorKey = (err: unknown): string => {
        if (isPortError(err, 'invalidCode')) return 'subscription.checkout.email.error.invalidCode';
        if (isPortError(err, 'limit')) return 'subscription.checkout.email.error.limit';
        if (isPortError(err, 'network')) return 'subscription.common.error.network';
        return 'subscription.common.error.unknown';
    };

    const onRequest = () => {
        setError(undefined);
        const trimmed = address.trim();
        requestCode.mutate(trimmed, {
            onSuccess: ({ emailId }) => {
                setPendingId(emailId);
                setCode('');
            },
            onError: async err => {
                // Already verified for this account: nothing to send, use it as it is.
                if (isPortError(err, 'conflict')) {
                    const info = await reloadBillingInfo();
                    const known = info.data?.emails.find(
                        email => email.address.toLowerCase() === trimmed.toLowerCase() && email.status === 'verified'
                    );
                    if (known) {
                        onChange({ id: known.id, address: known.address });
                        return;
                    }
                }
                setError(errorKey(err));
            },
        });
    };

    const onVerify = () => {
        if (!pendingId) return;
        setError(undefined);
        verifyCode.mutate(
            { emailId: pendingId, code: code.trim() },
            {
                onSuccess: email => {
                    setPendingId(undefined);
                    onChange({ id: email.id, address: email.address });
                },
                onError: err => setError(errorKey(err)),
            }
        );
    };

    const onEdit = () => {
        if (value) setAddress(value.address);
        setPendingId(undefined);
        setError(undefined);
        onChange(undefined);
    };

    const label = <span className="text-[13px] text-desc-alt">{t('subscription.checkout.billing.email')}</span>;

    if (value) {
        return (
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    {label}
                    <Button size="sm" variant="secondary" onClick={onEdit}>
                        {t('subscription.checkout.email.change')}
                    </Button>
                </div>
                <div className="flex h-12 items-center justify-between rounded-xl border border-border px-4">
                    <span className="truncate text-[15px] text-navy">{value.address}</span>
                    <Badge tone="success">{t('subscription.checkout.email.verified')}</Badge>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <label htmlFor="checkout-email">{label}</label>
            <div className="flex gap-2">
                <input
                    id="checkout-email"
                    type="email"
                    autoComplete="email"
                    value={address}
                    disabled={!!pendingId}
                    onChange={event => setAddress(event.target.value)}
                    className={inputClass}
                />
                {!pendingId && (
                    <Button
                        size="lg"
                        variant="secondary"
                        className="shrink-0"
                        disabled={!isEmailShaped(address) || requestCode.isPending}
                        onClick={onRequest}
                    >
                        {t('subscription.checkout.email.sendCode')}
                    </Button>
                )}
            </div>
            {pendingId && (
                <div className="flex flex-col gap-2">
                    <label htmlFor="checkout-email-code" className="text-[13px] text-desc-alt">
                        {t('subscription.checkout.email.codeSent', { address: address.trim() })}
                    </label>
                    <div className="flex gap-2">
                        <input
                            id="checkout-email-code"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            value={code}
                            onChange={event => setCode(event.target.value)}
                            className={inputClass}
                        />
                        <Button
                            size="lg"
                            className="shrink-0"
                            disabled={!code.trim() || verifyCode.isPending}
                            onClick={onVerify}
                        >
                            {t('subscription.checkout.email.verify')}
                        </Button>
                    </div>
                    <div className="flex gap-3 text-[13px]">
                        <button
                            type="button"
                            className="text-subtitle underline"
                            disabled={requestCode.isPending}
                            onClick={onRequest}
                        >
                            {t('subscription.checkout.email.resend')}
                        </button>
                        <button type="button" className="text-subtitle underline" onClick={onEdit}>
                            {t('subscription.checkout.email.otherAddress')}
                        </button>
                    </div>
                </div>
            )}
            {error && (
                <p role="alert" className="text-[13px] text-status-danger">
                    {t(error)}
                </p>
            )}
        </div>
    );
};
