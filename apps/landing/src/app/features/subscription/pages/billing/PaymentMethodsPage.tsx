import { type JSX, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useQueryClient } from '@tanstack/react-query';

import { ROUTES } from '../../../../routes/paths';
import { ConfirmDialog, PageLoader, PayerFields } from '../../components';
import { Badge, Banner, Button, useToast } from '../../components/ui';
import {
    useBillingInfo,
    useCurrentSubscription,
    usePaymentMethods,
    useRemovePaymentMethod,
    useRetryPayment,
    useSession,
    useSetDefaultPaymentMethod,
    useStartPaymentMethodRegistration,
    subscriptionKeys,
} from '../../hooks';
import { primaryVerifiedEmail } from '../../lib/billingEmail';
import { canRemovePaymentMethod } from '../../lib/canRemovePaymentMethod';
import { EMPTY_PAYER, type PayerDraft, isPayerComplete, payerOf } from '../../lib/payer';
import { isPortError, useToday } from '../../lib/port';
import { type SceneBanner, sceneOf } from '../../lib/sceneOf';
import { cn, formatDate, formatMoney } from '../../utils';
import { BillingPageHeader, LoadFailed, useReportPortError } from './BillingPage';
import { addedCardOf, cardExpiry, cardExpiryMonth } from './display';

import type { Money, PaymentMethod, Subscription } from '../../types';

type DialogState =
    | { kind: 'add' }
    | { kind: 'makeDefault'; card: PaymentMethod }
    | { kind: 'remove'; card: PaymentMethod }
    | { kind: 'cannotRemoveDefault' }
    | { kind: 'cannotRemoveLast' };

/** Why the last trip to the payment window did not add a card. */
type RegistrationNotice = 'declined' | 'attemptLimit';

/**
 * W-12 — the cards the subscription is charged to: add one through the payment provider's window,
 * make one the default, remove one.
 *
 * While a payment is failing the page is also where the reader fixes it: choosing another card (or
 * adding one) offers to make it the default and charge the overdue amount there and then, and the
 * charge is followed on the payment status page like any other attempt.
 */
export const PaymentMethodsPage = (): JSX.Element => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const toast = useToast();
    const today = useToday();
    const report = useReportPortError();
    const methods = usePaymentMethods();
    const { subscription, plan } = useCurrentSubscription();
    const registration = useStartPaymentMethodRegistration();
    const setDefault = useSetDefaultPaymentMethod();
    const remove = useRemovePaymentMethod();
    const retry = useRetryPayment();
    const session = useSession();
    const billing = useBillingInfo();
    // Asked again for every card and kept only while the dialog is open (see `PayerFields`).
    const [payer, setPayer] = useState<PayerDraft>(EMPTY_PAYER);
    // Receipts go to the verified billing address; an account that never set one uses its sign-in address.
    const payerEmail = (billing.data && primaryVerifiedEmail(billing.data)?.address) ?? session.data?.email;

    // The dialog's content outlives its closing, so a closing dialog keeps its words until it is gone.
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [notice, setNotice] = useState<RegistrationNotice | null>(null);
    const [replacement, setReplacement] = useState<PaymentMethod | null>(null);
    const replacementHeading = useRef<HTMLParagraphElement>(null);

    // The panel appears below the list, out of sight of the button that opened it.
    useEffect(() => {
        if (replacement) replacementHeading.current?.focus();
    }, [replacement]);

    const scene = subscription ? sceneOf(subscription, today) : undefined;
    const failing = !!scene?.actions.includes('updatePaymentMethod');
    const overdue = subscription?.nextAmount ?? plan?.monthly;
    // Paying needs the amount; without it, choosing a card falls back to an ordinary default change.
    const offersPayment = failing && !!overdue;
    const label = (card: PaymentMethod) =>
        t('subscription.billing.card.label', { brand: card.brand, last4: card.last4 });
    const money = (value: Money) => formatMoney(value, i18n.language);

    if (methods.isPending) return <PageLoader />;
    if (methods.isError) return <LoadFailed error={methods.error} onRetry={methods.refetch} />;

    const openDialog = (next: DialogState) => {
        if (next.kind === 'add') setPayer(EMPTY_PAYER);
        setDialog(next);
        setDialogOpen(true);
    };
    const closeDialog = () => setDialogOpen(false);

    const cards = methods.data;
    const defaultCard = cards.find(card => card.isDefault);

    const addCard = async () => {
        closeDialog();
        setNotice(null);
        setReplacement(null);
        try {
            const { outcome } = await registration.mutateAsync({
                purpose: 'addCard',
                payer: payerOf(payer, payerEmail ?? ''),
            });
            if (outcome === 'failed') setNotice('declined');
            if (outcome !== 'registered') return;
            // The hook has refreshed the card list by the time it resolves.
            const card = addedCardOf(
                cards,
                queryClient.getQueryData<PaymentMethod[]>(subscriptionKeys.paymentMethods()) ?? []
            );
            if (!card) return;
            toast(t('subscription.billing.paymentMethods.added', { card: label(card) }));
            if (offersPayment) setReplacement(card);
        } catch (error) {
            if (isPortError(error, 'limit')) setNotice('attemptLimit');
            else report(error);
        }
    };

    const confirmMakeDefault = (card: PaymentMethod) =>
        setDefault.mutate(card.id, {
            onSuccess: () => {
                closeDialog();
                toast(t('subscription.billing.paymentMethods.defaultChanged'));
            },
            onError: report,
        });

    const confirmRemove = (card: PaymentMethod) =>
        remove.mutate(card.id, {
            onSuccess: () => {
                closeDialog();
                if (replacement?.id === card.id) setReplacement(null);
                toast(t('subscription.billing.paymentMethods.removed'));
            },
            onError: report,
        });

    // The default is switched first, so the retried charge lands on the card the reader chose.
    const payWith = async (card: PaymentMethod, sub: Subscription) => {
        try {
            if (!card.isDefault) await setDefault.mutateAsync(card.id);
            const attempt = await retry.mutateAsync(sub.id);
            navigate(`${ROUTES.subscription.checkoutStatus}?attempt=${encodeURIComponent(attempt.id)}`);
        } catch (error) {
            report(error);
        }
    };

    const askMakeDefault = (card: PaymentMethod) => {
        if (offersPayment) setReplacement(card);
        else openDialog({ kind: 'makeDefault', card });
    };

    const askRemove = (card: PaymentMethod) => {
        const check = canRemovePaymentMethod(card, cards, subscription);
        if (check === 'default') openDialog({ kind: 'cannotRemoveDefault' });
        else if (check === 'last') openDialog({ kind: 'cannotRemoveLast' });
        else openDialog({ kind: 'remove', card });
    };

    const paying = setDefault.isPending || retry.isPending;
    const busy = paying || remove.isPending;

    return (
        <section className="max-w-[1072px]">
            <BillingPageHeader
                title={t('subscription.billing.paymentMethods.title')}
                subtitle={t('subscription.billing.paymentMethods.subtitle')}
                action={
                    <Button
                        size="lg"
                        disabled={registration.isPending || paying}
                        onClick={() => openDialog({ kind: 'add' })}
                    >
                        {t('subscription.billing.paymentMethods.add')}
                    </Button>
                }
            />

            <div className="flex flex-col gap-4">
                {scene && overdue && (scene.banner.kind === 'pastDue' || scene.banner.kind === 'restricted') && (
                    <PastDueBanner banner={scene.banner} overdue={money(overdue)} />
                )}
                {notice && (
                    <Banner
                        tone={notice === 'declined' ? 'danger' : 'warning'}
                        title={t(`subscription.billing.paymentMethods.${notice}.title`)}
                    >
                        {t(`subscription.billing.paymentMethods.${notice}.body`)}
                    </Banner>
                )}
                {!failing && defaultCard?.expiringSoon && (
                    <Banner tone="warning" title={t('subscription.billing.paymentMethods.expiring.title')}>
                        {subscription?.nextBillingAt
                            ? t('subscription.billing.paymentMethods.expiring.body', {
                                  card: label(defaultCard),
                                  expiry: cardExpiryMonth(defaultCard),
                                  date: formatDate(subscription.nextBillingAt),
                              })
                            : t('subscription.billing.paymentMethods.expiring.bodyNoDate', {
                                  card: label(defaultCard),
                                  expiry: cardExpiryMonth(defaultCard),
                              })}
                    </Banner>
                )}

                {cards.length === 0 ? (
                    <div className="rounded-2xl bg-muted px-6 py-10 text-center">
                        <p className="text-[15px] font-semibold text-navy">
                            {t('subscription.billing.paymentMethods.empty.title')}
                        </p>
                        <p className="mt-1.5 text-sm text-subtitle">
                            {t('subscription.billing.paymentMethods.empty.body')}
                        </p>
                    </div>
                ) : (
                    <ul className="flex flex-col gap-4" aria-label={t('subscription.billing.paymentMethods.title')}>
                        {cards.map(card => (
                            <CardRow
                                key={card.id}
                                card={card}
                                label={label(card)}
                                failing={failing && card.isDefault}
                                failureReason={subscription?.failureReason}
                                urgeDefault={!!defaultCard?.expiringSoon && !card.isDefault}
                                busy={busy}
                                onMakeDefault={() => askMakeDefault(card)}
                                onRemove={() => askRemove(card)}
                            />
                        ))}
                    </ul>
                )}

                {replacement && subscription && overdue && (
                    <div className="rounded-2xl border border-border bg-card p-6">
                        <p
                            ref={replacementHeading}
                            tabIndex={-1}
                            className="text-base font-semibold text-navy outline-none"
                        >
                            {t('subscription.billing.paymentMethods.replace.title', { card: label(replacement) })}
                        </p>
                        <dl className="mt-4 flex flex-col gap-3 text-sm">
                            <div className="flex justify-between">
                                <dt className="text-subtitle">
                                    {t('subscription.billing.paymentMethods.replace.amount')}
                                </dt>
                                <dd className="font-semibold text-navy">{money(overdue)}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-subtitle">
                                    {t('subscription.billing.paymentMethods.replace.billingDay')}
                                </dt>
                                <dd className="text-navy">
                                    {t('subscription.billing.paymentMethods.replace.billingDayValue', {
                                        day: subscription.billingDay,
                                    })}
                                </dd>
                            </div>
                        </dl>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <Button
                                variant="secondary"
                                size="lg"
                                disabled={paying}
                                onClick={() => setReplacement(null)}
                            >
                                {t('subscription.common.actions.cancel')}
                            </Button>
                            <Button size="lg" disabled={paying} onClick={() => payWith(replacement, subscription)}>
                                {t('subscription.billing.paymentMethods.replace.confirm', { amount: money(overdue) })}
                            </Button>
                        </div>
                    </div>
                )}

                {!failing && (
                    <div className="rounded-2xl bg-muted px-6 py-5">
                        <p className="text-[13px] font-semibold text-navy">
                            {t('subscription.billing.paymentMethods.notes.title')}
                        </p>
                        <ul className="mt-2 list-inside list-disc text-[13px] leading-6 text-desc-alt">
                            {(['removeDefault', 'removeLast', 'domestic', 'noCharge'] as const).map(note => (
                                <li key={note}>{t(`subscription.billing.paymentMethods.notes.${note}`)}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={dialogOpen && dialog?.kind === 'add'}
                onOpenChange={open => !open && closeDialog()}
                title={t('subscription.billing.paymentMethods.addDialog.title')}
                description={t('subscription.billing.paymentMethods.addDialog.body')}
                cancelLabel={t('subscription.common.actions.close')}
                confirmLabel={t('subscription.billing.paymentMethods.addDialog.open')}
                confirmDisabled={!isPayerComplete(payer) || !payerEmail}
                onConfirm={addCard}
            >
                <PayerFields idPrefix="add-card-payer" value={payer} onChange={setPayer} />
            </ConfirmDialog>
            <ConfirmDialog
                open={dialogOpen && dialog?.kind === 'makeDefault'}
                onOpenChange={open => !open && closeDialog()}
                title={t('subscription.billing.paymentMethods.defaultDialog.title')}
                description={
                    dialog?.kind === 'makeDefault' &&
                    (subscription?.nextBillingAt && subscription.nextAmount
                        ? t('subscription.billing.paymentMethods.defaultDialog.body', {
                              date: formatDate(subscription.nextBillingAt),
                              amount: money(subscription.nextAmount),
                              card: label(dialog.card),
                          })
                        : t('subscription.billing.paymentMethods.defaultDialog.bodyNoNext', {
                              card: label(dialog.card),
                          }))
                }
                cancelLabel={t('subscription.common.actions.close')}
                confirmLabel={t('subscription.billing.paymentMethods.makeDefault')}
                pending={setDefault.isPending}
                onConfirm={() => dialog?.kind === 'makeDefault' && confirmMakeDefault(dialog.card)}
            />
            <ConfirmDialog
                open={dialogOpen && dialog?.kind === 'remove'}
                onOpenChange={open => !open && closeDialog()}
                title={
                    dialog?.kind === 'remove' &&
                    t('subscription.billing.paymentMethods.removeDialog.title', { card: label(dialog.card) })
                }
                description={t('subscription.billing.paymentMethods.removeDialog.body')}
                cancelLabel={t('subscription.common.actions.close')}
                confirmLabel={t('subscription.billing.paymentMethods.remove')}
                confirmVariant="danger"
                pending={remove.isPending}
                onConfirm={() => dialog?.kind === 'remove' && confirmRemove(dialog.card)}
            />
            <ConfirmDialog
                open={dialogOpen && dialog?.kind === 'cannotRemoveDefault'}
                onOpenChange={open => !open && closeDialog()}
                title={t('subscription.billing.paymentMethods.cannotRemoveDefault.title')}
                description={t('subscription.billing.paymentMethods.cannotRemoveDefault.body')}
            />
            <ConfirmDialog
                open={dialogOpen && dialog?.kind === 'cannotRemoveLast'}
                onOpenChange={open => !open && closeDialog()}
                title={t('subscription.billing.paymentMethods.cannotRemoveLast.title')}
                description={t('subscription.billing.paymentMethods.cannotRemoveLast.body')}
                cancelLabel={t('subscription.common.actions.close')}
                confirmLabel={t('subscription.billing.paymentMethods.add')}
                onConfirm={() => openDialog({ kind: 'add' })}
            />
        </section>
    );
};

/** What is owed, and how long until access is restricted or that it already is. */
const PastDueBanner = ({
    banner,
    overdue,
}: {
    banner: Extract<SceneBanner, { kind: 'pastDue' | 'restricted' }>;
    overdue: string;
}): JSX.Element => {
    const { t } = useTranslation();
    const dday = banner.kind === 'pastDue' ? banner.dday : undefined;
    const title =
        banner.kind === 'restricted'
            ? t('subscription.billing.paymentMethods.pastDue.titleRestricted', { amount: overdue })
            : dday === undefined
              ? t('subscription.billing.paymentMethods.pastDue.titleNoDate', { amount: overdue })
              : dday > 0
                ? t('subscription.billing.paymentMethods.pastDue.title', { amount: overdue, count: dday })
                : t('subscription.billing.paymentMethods.pastDue.titleToday', { amount: overdue });
    return (
        <Banner tone="danger" title={title}>
            {t('subscription.billing.paymentMethods.pastDue.body')}
        </Banner>
    );
};

const CardRow = ({
    card,
    label,
    failing,
    failureReason,
    urgeDefault,
    busy,
    onMakeDefault,
    onRemove,
}: {
    card: PaymentMethod;
    label: string;
    /** This card's charge is the one that failed. */
    failing: boolean;
    /** The payment provider's words for the failure, shown as they came. */
    failureReason?: string;
    /** The default card is about to expire, so making this one the default is the next step. */
    urgeDefault: boolean;
    busy: boolean;
    onMakeDefault: () => void;
    onRemove: () => void;
}): JSX.Element => {
    const { t } = useTranslation();
    return (
        <li
            className={cn(
                'flex items-center gap-4 rounded-2xl border bg-card px-5 py-4',
                card.isDefault && card.expiringSoon
                    ? 'border-status-warning'
                    : card.isDefault
                      ? 'border-2 border-main-green'
                      : 'border-border'
            )}
        >
            <span className="flex h-8 w-11 shrink-0 items-center justify-center rounded-md bg-navy text-[11px] font-semibold text-white">
                {card.brand}
            </span>
            <div className="min-w-0">
                <p className="text-[15px] font-semibold text-navy">{label}</p>
                {cardExpiry(card) && (
                    <p className={cn('mt-0.5 text-xs', failing ? 'text-status-danger' : 'text-subtitle')}>
                        {t('subscription.billing.card.expires', { expiry: cardExpiry(card) })}
                    </p>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                {card.isDefault && (
                    <Badge className="bg-main-green text-navy">{t('subscription.billing.card.default')}</Badge>
                )}
                {card.expiringSoon && <Badge tone="warning">{t('subscription.billing.card.expiringSoon')}</Badge>}
                {failing && (
                    <Badge tone="danger">
                        {failureReason
                            ? t('subscription.billing.card.failedWithReason', { reason: failureReason })
                            : t('subscription.billing.card.failed')}
                    </Badge>
                )}
            </div>
            <div className="ml-auto flex shrink-0 gap-2">
                {!card.isDefault && (
                    <Button
                        size="sm"
                        variant={urgeDefault ? 'primary' : 'secondary'}
                        disabled={busy}
                        onClick={onMakeDefault}
                    >
                        {t('subscription.billing.paymentMethods.makeDefault')}
                    </Button>
                )}
                {/* The default card's button stays clickable: it answers with why it cannot go. */}
                <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    className={card.isDefault ? 'text-subtitle' : 'text-status-danger'}
                    onClick={onRemove}
                >
                    {t('subscription.billing.paymentMethods.remove')}
                </Button>
            </div>
        </li>
    );
};
