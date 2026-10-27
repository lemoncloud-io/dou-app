import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Dialog, useToast } from '../../components/ui';
import { useRequestEmailCode, useSetPrimaryEmail, useVerifyEmailCode } from '../../hooks';
import { isPortError } from '../../lib/port';
import { cn } from '../../utils';
import { useReportPortError } from './BillingPage';
import { isEmailAddress } from './display';

import type { BillingEmail } from '../../types';

/**
 * Which way into the dialog: adding another address, replacing the primary one (verify a new address,
 * then make it the primary), or finishing the verification of an address already waiting for it.
 */
export type BillingEmailDialogMode =
    | { kind: 'add' }
    | { kind: 'change'; current: BillingEmail }
    | { kind: 'resume'; email: BillingEmail };

type Step = 'address' | 'code' | 'verified';

const INPUT =
    'h-12 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm text-navy outline-none ' +
    'placeholder:text-subtitle/60 focus:border-navy read-only:bg-muted';

/**
 * Verifying a billing address: send a code to it, type the code back. The address joins the list as
 * soon as a code is sent (waiting for verification) and starts receiving mail once verified; a change
 * of primary waits for the reader to confirm. Mounted only while open, so every opening starts clean.
 */
export const BillingEmailDialog = ({
    mode,
    onClose,
}: {
    mode: BillingEmailDialogMode;
    onClose: () => void;
}): JSX.Element => {
    const { t } = useTranslation();
    const toast = useToast();
    const report = useReportPortError();
    const requestCode = useRequestEmailCode();
    const verifyCode = useVerifyEmailCode();
    const setPrimary = useSetPrimaryEmail();

    const resuming = mode.kind === 'resume' ? mode.email : undefined;
    const [step, setStep] = useState<Step>(resuming ? 'code' : 'address');
    const [address, setAddress] = useState(resuming?.address ?? '');
    const [emailId, setEmailId] = useState(resuming?.id ?? '');
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);

    const pending = requestCode.isPending || verifyCode.isPending || setPrimary.isPending;
    const changing = mode.kind === 'change';

    const onRequestError = (err: unknown) => {
        if (isPortError(err, 'limit')) setError(t('subscription.billing.info.dialog.limit'));
        else if (isPortError(err, 'conflict')) setError(t('subscription.billing.info.dialog.alreadyVerified'));
        else report(err);
    };

    const sendCode = () => {
        if (!isEmailAddress(address)) {
            setError(t('subscription.billing.info.dialog.invalidAddress'));
            return;
        }
        setError(null);
        requestCode.mutate(address.trim(), {
            onSuccess: ({ emailId: id }) => {
                setEmailId(id);
                setStep('code');
            },
            onError: onRequestError,
        });
    };

    const resend = () => {
        setError(null);
        requestCode.mutate(address.trim(), { onSuccess: ({ emailId: id }) => setEmailId(id), onError: onRequestError });
    };

    const verify = () => {
        setError(null);
        verifyCode.mutate(
            { emailId, code: code.trim() },
            {
                onSuccess: () => setStep('verified'),
                onError: err =>
                    isPortError(err, 'invalidCode')
                        ? setError(t('subscription.billing.info.dialog.invalidCode'))
                        : report(err),
            }
        );
    };

    const reenter = () => {
        setStep('address');
        setAddress('');
        setCode('');
        setError(null);
    };

    const finish = () => {
        if (!changing) {
            toast(t('subscription.billing.info.dialog.added'));
            onClose();
            return;
        }
        setPrimary.mutate(emailId, {
            onSuccess: () => {
                toast(t('subscription.billing.info.dialog.changed'));
                onClose();
            },
            onError: report,
        });
    };

    return (
        <Dialog
            open
            onOpenChange={open => !open && !pending && onClose()}
            className="max-w-[528px]"
            title={t(
                changing ? 'subscription.billing.info.dialog.titleChange' : 'subscription.billing.info.dialog.titleAdd'
            )}
            description={t(
                changing ? 'subscription.billing.info.dialog.bodyChange' : 'subscription.billing.info.dialog.bodyAdd'
            )}
            footer={
                <>
                    <Button variant="secondary" size="lg" disabled={pending} onClick={onClose}>
                        {t('subscription.common.actions.cancel')}
                    </Button>
                    <Button size="lg" disabled={step !== 'verified' || pending} onClick={finish}>
                        {t(
                            changing
                                ? 'subscription.billing.info.dialog.confirmChange'
                                : 'subscription.billing.info.dialog.confirmAdd'
                        )}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                {mode.kind === 'change' && (
                    <div className="flex flex-col gap-2">
                        <span className="text-[13px] font-medium text-navy">
                            {t('subscription.billing.info.dialog.current')}
                        </span>
                        <div className="flex h-12 items-center justify-between rounded-lg bg-muted px-3 text-sm text-navy">
                            {mode.current.address}
                            <Badge tone="info">{t('subscription.billing.info.emails.primary')}</Badge>
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    <label htmlFor="billing-email-address" className="text-[13px] font-medium text-navy">
                        {t('subscription.billing.info.dialog.newAddress')}
                    </label>
                    <div className="flex gap-2">
                        <div className="relative flex min-w-0 flex-1">
                            <input
                                id="billing-email-address"
                                type="email"
                                autoComplete="email"
                                className={cn(INPUT, step === 'verified' && 'pr-24')}
                                placeholder={t('subscription.billing.info.dialog.addressPlaceholder')}
                                value={address}
                                readOnly={step !== 'address'}
                                onChange={event => setAddress(event.target.value)}
                                onKeyDown={event =>
                                    event.key === 'Enter' && step === 'address' && !pending && sendCode()
                                }
                            />
                            {step === 'verified' && (
                                <Badge tone="success" className="absolute right-3 top-1/2 -translate-y-1/2">
                                    ✓ {t('subscription.billing.info.dialog.verified')}
                                </Badge>
                            )}
                        </div>
                        {step === 'address' && (
                            <Button
                                variant="secondary"
                                size="lg"
                                disabled={pending || !address.trim()}
                                onClick={sendCode}
                            >
                                {t('subscription.billing.info.dialog.sendCode')}
                            </Button>
                        )}
                        {step === 'code' && (
                            <Button variant="secondary" size="lg" disabled={pending} onClick={resend}>
                                {t('subscription.billing.info.dialog.resend')}
                            </Button>
                        )}
                        {step === 'verified' && !resuming && (
                            <Button variant="secondary" size="lg" disabled={pending} onClick={reenter}>
                                {t('subscription.billing.info.dialog.reenter')}
                            </Button>
                        )}
                    </div>

                    {step === 'code' && (
                        <>
                            <div className="flex gap-2">
                                <input
                                    aria-label={t('subscription.billing.info.dialog.code')}
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    className={cn(INPUT, 'max-w-[200px]')}
                                    placeholder={t('subscription.billing.info.dialog.code')}
                                    value={code}
                                    onChange={event => setCode(event.target.value)}
                                    onKeyDown={event => event.key === 'Enter' && code.trim() && !pending && verify()}
                                />
                                <Button size="lg" disabled={pending || !code.trim()} onClick={verify}>
                                    {t('subscription.billing.info.dialog.verify')}
                                </Button>
                            </div>
                            <p className="text-xs text-desc-alt">
                                {t('subscription.billing.info.dialog.sent', { address })}
                            </p>
                        </>
                    )}
                    {step === 'verified' && (
                        <p className="text-xs text-status-success">
                            {t(
                                changing
                                    ? 'subscription.billing.info.dialog.verifiedChange'
                                    : 'subscription.billing.info.dialog.verifiedAdd'
                            )}
                        </p>
                    )}
                    {error && (
                        <p role="alert" className="text-xs text-status-danger">
                            {error}
                        </p>
                    )}
                </div>

                <p className="rounded-lg bg-muted px-4 py-3 text-xs leading-5 text-desc-alt">
                    {t('subscription.billing.info.dialog.hint')}
                </p>
            </div>
        </Dialog>
    );
};
