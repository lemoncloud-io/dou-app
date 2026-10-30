import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BillingEmailChangeDialog, ConfirmDialog, PageLoader } from '../../components';
import { Badge, type BadgeTone, Banner, Button, Card, useToast } from '../../components/ui';
import { useBillingInfo, useRemoveEmail, useSetEmailReceives, useSetPrimaryEmail } from '../../hooks';
import { BillingEmailAddDialog } from './BillingEmailAddDialog';
import { BillingPageHeader, LoadFailed, useReportPortError } from './BillingPage';
import { regionName, toggleReceive } from './display';

import type { BillingEmail } from '../../types';

const STATUS_TONE: Record<Exclude<BillingEmail['status'], 'verified'>, BadgeTone> = {
    pending: 'warning',
    bounced: 'danger',
    unsubscribed: 'neutral',
};

const RECEIVES = ['receipt', 'notice'] as const;

/** Which popup is open: changing an address (the primary's [change]) or adding one, new or waiting. */
type EmailPopup = { kind: 'change'; current: BillingEmail } | { kind: 'add'; waiting?: BillingEmail };

/**
 * W-16 — where billing mail goes and which country the account is billed in.
 *
 * Several addresses can receive billing mail; one is the primary. A new address is verified before it
 * receives anything, and only a verified one can become the primary. Changing the primary address is
 * the shared change popup: once the new address is verified it takes the old one's place at once, so
 * this page has nothing to save. The billing country is shown and not editable: it fixes how the
 * account is charged, so changing it means subscribing again.
 */
export const BillingInfoPage = (): JSX.Element => {
    const { t, i18n } = useTranslation();
    const toast = useToast();
    const report = useReportPortError();
    const billing = useBillingInfo();
    const setPrimary = useSetPrimaryEmail();
    const setReceives = useSetEmailReceives();
    const remove = useRemoveEmail();

    const [emailPopup, setEmailPopup] = useState<EmailPopup | null>(null);
    // Kept after the dialog closes, so its title does not blank while it goes.
    const [removing, setRemoving] = useState<BillingEmail | null>(null);
    const [removeOpen, setRemoveOpen] = useState(false);

    if (billing.isPending) return <PageLoader />;
    if (billing.isError) return <LoadFailed error={billing.error} onRetry={billing.refetch} />;

    const { emails, country } = billing.data;
    const primary = emails.find(email => email.primary);
    const busy = setPrimary.isPending || setReceives.isPending || remove.isPending;

    const makePrimary = (email: BillingEmail) =>
        setPrimary.mutate(email.id, {
            onSuccess: () => toast(t('subscription.billing.info.primaryChanged')),
            onError: report,
        });

    const confirmRemove = (email: BillingEmail) =>
        remove.mutate(email.id, {
            onSuccess: () => {
                setRemoveOpen(false);
                toast(t('subscription.billing.info.removed'));
            },
            onError: report,
        });

    return (
        <section className="max-w-[640px]">
            <BillingPageHeader
                title={t('subscription.billing.info.title')}
                subtitle={t('subscription.billing.info.subtitle')}
            />

            {primary?.status === 'bounced' && (
                <Banner tone="warning" className="mb-4" title={t('subscription.billing.info.bounced.title')}>
                    {t('subscription.billing.info.bounced.body', { address: primary.address })}
                </Banner>
            )}

            <Card className="flex flex-col gap-5 rounded-[14px] border-line p-4 md:gap-6 md:rounded-2xl md:p-[18px]">
                <div className="flex flex-col gap-2.5">
                    <h2 className="text-[13px] font-semibold text-ink">
                        {t('subscription.billing.info.emails.label')}
                    </h2>
                    {emails.length === 0 ? (
                        <p className="rounded-xl bg-note px-4 py-3 text-sm font-medium text-mute">
                            {t('subscription.billing.info.emails.empty')}
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {emails.map(email => (
                                <li key={email.id} className="rounded-xl border border-line px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <span className="min-w-0 truncate text-sm font-medium text-ink">
                                            {email.address}
                                        </span>
                                        {email.primary && (
                                            <Badge className="bg-[#eef3fb] font-semibold text-navy">
                                                {t('subscription.billing.info.emails.primary')}
                                            </Badge>
                                        )}
                                        {email.status !== 'verified' && (
                                            <Badge tone={STATUS_TONE[email.status]}>
                                                {t(`subscription.billing.info.emails.status.${email.status}`)}
                                            </Badge>
                                        )}
                                        <div className="ml-auto flex shrink-0 gap-1.5">
                                            {email.primary && (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    disabled={busy}
                                                    onClick={() => setEmailPopup({ kind: 'change', current: email })}
                                                >
                                                    {t('subscription.billing.info.emails.actions.change')}
                                                </Button>
                                            )}
                                            {email.status === 'pending' && (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    disabled={busy}
                                                    onClick={() => setEmailPopup({ kind: 'add', waiting: email })}
                                                >
                                                    {t('subscription.billing.info.emails.actions.verify')}
                                                </Button>
                                            )}
                                            {!email.primary && email.status === 'verified' && (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    disabled={busy}
                                                    onClick={() => makePrimary(email)}
                                                >
                                                    {t('subscription.billing.info.emails.actions.makePrimary')}
                                                </Button>
                                            )}
                                            {!email.primary && (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    disabled={busy}
                                                    className="text-status-danger"
                                                    onClick={() => {
                                                        setRemoving(email);
                                                        setRemoveOpen(true);
                                                    }}
                                                >
                                                    {t('subscription.billing.info.emails.actions.remove')}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <fieldset className="mt-2 flex items-center gap-4 text-xs text-subtitle">
                                        <legend className="float-left mr-1">
                                            {t('subscription.billing.info.emails.receives.label')}
                                        </legend>
                                        {RECEIVES.map(kind => (
                                            <label key={kind} className="flex items-center gap-1.5 text-desc-alt">
                                                <input
                                                    type="checkbox"
                                                    className="h-3.5 w-3.5 accent-navy"
                                                    checked={email.receives.includes(kind)}
                                                    disabled={busy}
                                                    onChange={event =>
                                                        setReceives.mutate(
                                                            {
                                                                emailId: email.id,
                                                                receives: toggleReceive(
                                                                    email.receives,
                                                                    kind,
                                                                    event.target.checked
                                                                ),
                                                            },
                                                            { onError: report }
                                                        )
                                                    }
                                                />
                                                {t(`subscription.billing.info.emails.receives.${kind}`)}
                                            </label>
                                        ))}
                                    </fieldset>
                                </li>
                            ))}
                        </ul>
                    )}
                    <Button
                        variant="secondary"
                        className="self-start"
                        disabled={busy}
                        onClick={() => setEmailPopup({ kind: 'add' })}
                    >
                        + {t('subscription.billing.info.emails.add')}
                    </Button>
                </div>

                <div className="flex flex-col gap-2.5">
                    <h2 className="text-[13px] font-semibold text-ink">
                        {t('subscription.billing.info.country.label')}
                    </h2>
                    <div className="flex h-12 items-center justify-between rounded-xl border border-line bg-note px-4 text-sm font-semibold text-ink md:h-11 md:bg-transparent md:font-medium">
                        {regionName(country, i18n.language)}
                        <span className="text-xs font-medium text-mute">
                            {t('subscription.billing.info.country.locked')}
                        </span>
                    </div>
                    <p className="text-xs font-medium leading-normal text-mute">
                        {t('subscription.billing.info.country.note')}
                    </p>
                </div>
            </Card>

            {emailPopup?.kind === 'change' && (
                <BillingEmailChangeDialog
                    current={emailPopup.current}
                    where="billing"
                    onClose={() => setEmailPopup(null)}
                />
            )}
            {emailPopup?.kind === 'add' && (
                <BillingEmailAddDialog waiting={emailPopup.waiting} onClose={() => setEmailPopup(null)} />
            )}
            <ConfirmDialog
                open={removeOpen}
                onOpenChange={setRemoveOpen}
                title={removing && t('subscription.billing.info.removeDialog.title', { address: removing.address })}
                description={t('subscription.billing.info.removeDialog.body')}
                cancelLabel={t('subscription.common.actions.close')}
                confirmLabel={t('subscription.billing.info.emails.actions.remove')}
                confirmVariant="danger"
                pending={remove.isPending}
                onConfirm={() => removing && confirmRemove(removing)}
            />
        </section>
    );
};
