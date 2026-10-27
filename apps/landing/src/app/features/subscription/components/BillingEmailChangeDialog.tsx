import { type JSX, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBillingInfo, useRemoveEmail, useReplaceEmail } from '../hooks';
import { isPortError } from '../lib/port';
import { EmailVerificationForm } from './EmailVerificationForm';
import { Badge, Button, Dialog, useToast } from './ui';

import type { BillingEmail } from '../types';

const k = (key: string) => `subscription.common.emailChange.${key}`;

/**
 * The billing email change popup, the same from the payment details (W-08) and the billing info page
 * (W-16): verify a new address, then "change" swaps it in at once — it takes the old address's place,
 * primary mark and what it receives included, and the old one is gone. There is nothing to save
 * afterwards.
 *
 * Walking away changes nothing: a new address that was sent a code (or verified) but never swapped in
 * is removed again, so it does not linger in the billing list.
 */
export const BillingEmailChangeDialog = ({
    current,
    where,
    onClose,
    onChanged,
}: {
    current: BillingEmail;
    /** `checkout` marks the current address verified; `billing` marks it primary and adds the notice rule. */
    where: 'checkout' | 'billing';
    onClose: () => void;
    onChanged?: (email: BillingEmail) => void;
}): JSX.Element => {
    const { t } = useTranslation();
    const toast = useToast();
    const billing = useBillingInfo();
    const replace = useReplaceEmail();
    const remove = useRemoveEmail();
    const [verified, setVerified] = useState<BillingEmail>();
    const [error, setError] = useState<string>();
    // While the form waits on a request the popup stays open: closing then would miss the address the
    // request is about to add, and leave it behind.
    const [busy, setBusy] = useState(false);
    // The address this popup added and has not swapped in yet — what to clean up on the way out.
    const started = useRef<string | undefined>(undefined);

    const known = (address: string) =>
        billing.data?.emails.some(email => email.address.toLowerCase() === address.toLowerCase());

    const refuse = (address: string): string | undefined => {
        if (address.toLowerCase() === current.address.toLowerCase()) return 'subscription.common.email.error.same';
        if (known(address)) return 'subscription.common.email.error.registered';
        return undefined;
    };

    const discard = () => {
        const id = started.current;
        started.current = undefined;
        if (id) remove.mutate(id);
    };

    const close = () => {
        discard();
        onClose();
    };

    const change = () => {
        if (!verified) return;
        setError(undefined);
        replace.mutate(
            { emailId: current.id, newEmailId: verified.id },
            {
                onSuccess: () => {
                    started.current = undefined;
                    toast(t(k('changed')));
                    onChanged?.(verified);
                    onClose();
                },
                onError: err =>
                    setError(
                        t(
                            isPortError(err, 'network')
                                ? 'subscription.common.error.network'
                                : 'subscription.common.error.unknown'
                        )
                    ),
            }
        );
    };

    return (
        <Dialog
            open
            onOpenChange={open => !open && !replace.isPending && !busy && close()}
            className="max-w-[528px]"
            title={t(k('title'))}
            description={t(k('body'))}
            footer={
                <>
                    <Button variant="secondary" size="lg" disabled={replace.isPending || busy} onClick={close}>
                        {t('subscription.common.actions.cancel')}
                    </Button>
                    <Button size="lg" disabled={!verified || replace.isPending} onClick={change}>
                        {t(k('confirm'))}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <span className="text-[13px] font-medium text-navy">{t(k('current'))}</span>
                    <div className="flex h-12 items-center justify-between rounded-lg bg-muted px-3 text-sm text-navy">
                        <span className="truncate">{current.address}</span>
                        {where === 'checkout' ? (
                            <Badge tone="success">{t('subscription.common.email.verified')}</Badge>
                        ) : (
                            <Badge tone="info">{t(k('primary'))}</Badge>
                        )}
                    </div>
                </div>
                <EmailVerificationForm
                    idPrefix="billing-email-change"
                    label={t(k('newAddress'))}
                    refuse={refuse}
                    onPending={id => {
                        started.current = id;
                    }}
                    onVerified={email => {
                        // An address verified earlier and reused here was not added by this popup.
                        if (started.current !== email.id) started.current = undefined;
                        setVerified(email);
                    }}
                    onBusyChange={setBusy}
                    onReset={() => {
                        discard();
                        setVerified(undefined);
                    }}
                />
                {!verified && <p className="text-xs text-subtitle">ⓘ {t(k('hintNew'))}</p>}
                {where === 'billing' && <p className="text-xs text-subtitle">{t(k('billingHint'))}</p>}
                {error && (
                    <p role="alert" className="text-xs text-status-danger">
                        {error}
                    </p>
                )}
            </div>
        </Dialog>
    );
};
