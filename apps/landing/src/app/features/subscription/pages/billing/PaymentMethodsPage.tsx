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
import { currencyOfProvider } from '../../lib/billingCountry';
import { canRemovePaymentMethod } from '../../lib/canRemovePaymentMethod';
import { EMPTY_PAYER, type PayerDraft, isPayerComplete, payerOf } from '../../lib/payer';
import { cardGroupsOf, defaultCardOf } from '../../lib/paymentMethods';
import { savePendingCardChange, takePendingCardChange } from '../../lib/pendingCheckout';
import { isPortError, useSupports, useToday } from '../../lib/port';
import { useManagementScreens } from '../../lib/screens';
import { type SceneBanner, sceneOf } from '../../lib/sceneOf';
import { cn, formatDate, formatMoney } from '../../utils';
import { BillingPageHeader, LoadFailed, useReportPortError } from './BillingPage';
import { addedCardOf, cardExpiry, cardExpiryMonth } from './display';
import { useCardWindowReturn } from './useCardWindowReturn';

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
 * Cards belong to the provider that registered them — one for payments in won, one for payments in
 * dollars — and each provider has a default of its own. The cards of the provider the subscription is
 * charged by come first; any of the other's are listed under their own heading, named by currency, and
 * their default is changed among themselves.
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
    const supports = useSupports();
    // The billing addresses are read only where their screens exist; elsewhere the payer's address is
    // the sign-in one.
    const billing = useBillingInfo({ enabled: useManagementScreens().emails });
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

    const failToAdd = (error: unknown) => {
        if (isPortError(error, 'limit')) setNotice('attemptLimit');
        else report(error);
    };
    // A phone's card window comes back here with its result in the address.
    const returning = useCardWindowReturn({
        onResult: ({ outcome }) => {
            if (outcome === 'failed') setNotice('declined');
            if (outcome === 'registered') toast(t('subscription.billing.paymentMethods.addedBack'));
        },
        onError: failToAdd,
    });

    // The panel appears below the list, out of sight of the button that opened it.
    useEffect(() => {
        if (replacement) replacementHeading.current?.focus();
    }, [replacement]);

    const scene = subscription ? sceneOf(subscription, today) : undefined;
    const failing = !!scene?.actions.includes('updatePaymentMethod');
    const overdue = subscription?.nextAmount ?? plan?.monthly;
    // Paying needs the amount, and a server for the retried charge; without either, choosing a card
    // falls back to an ordinary default change.
    const offersPayment = failing && !!overdue && supports('retryPayment');
    const label = (card: PaymentMethod) =>
        t('subscription.billing.card.label', { brand: card.brand, last4: card.last4 });
    const money = (value: Money) => formatMoney(value, i18n.language);

    if (methods.isPending || returning) return <PageLoader />;
    if (methods.isError) return <LoadFailed error={methods.error} onRetry={methods.refetch} />;

    const openDialog = (next: DialogState) => {
        if (next.kind === 'add') setPayer(EMPTY_PAYER);
        setDialog(next);
        setDialogOpen(true);
    };
    const closeDialog = () => setDialogOpen(false);

    const cards = methods.data;
    const groups = cardGroupsOf(cards, subscription?.provider);
    // The card that matters is the default of the provider in use — or, with nothing in use, of the
    // first group.
    const inUse = subscription?.provider ?? groups[0]?.provider;
    const defaultCard = inUse ? defaultCardOf(cards, inUse) : undefined;
    const chargesSubscription = (card: PaymentMethod) => !!subscription && card.provider === subscription.provider;

    const addCard = async () => {
        closeDialog();
        setNotice(null);
        setReplacement(null);
        const holder = payerOf(payer, payerEmail ?? '');
        // On a phone the window is the provider's own page and this call never returns: the payer waits
        // for the way back (`useCardWindowReturn`).
        savePendingCardChange(holder);
        try {
            const { outcome } = await registration.mutateAsync({ purpose: 'addCard', payer: holder });
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
            failToAdd(error);
        } finally {
            takePendingCardChange();
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
            // The payment service decides what may go; past the default card, which has no button here,
            // its refusal is the card a subscription in use is charged to.
            onError: error => {
                closeDialog();
                if (isPortError(error, 'conflict')) toast(t('subscription.billing.paymentMethods.removeRefused'));
                else report(error);
            },
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
        if (offersPayment && chargesSubscription(card)) setReplacement(card);
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
                barTitle={t('subscription.billing.paymentMethods.barTitle')}
                titleOnPhone
                action={
                    <Button
                        size="lg"
                        className="max-md:h-[52px] max-md:px-4"
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
                    <div className="rounded-2xl bg-note px-6 py-10 text-center">
                        <p className="text-[15px] font-bold text-ink">
                            {t('subscription.billing.paymentMethods.empty.title')}
                        </p>
                        <p className="mt-1.5 text-sm font-medium text-mute">
                            {t('subscription.billing.paymentMethods.empty.body')}
                        </p>
                    </div>
                ) : (
                    groups.map(group => {
                        const heading = t(
                            `subscription.billing.paymentMethods.group.${currencyOfProvider(group.provider)}`
                        );
                        const inUseGroup = group.provider === inUse;
                        return (
                            <div key={group.provider} className="flex flex-col gap-2.5">
                                {/* One provider's cards need no heading; two do, to keep their defaults apart. */}
                                {groups.length > 1 && <h2 className="text-[13px] font-bold text-mute">{heading}</h2>}
                                <ul
                                    className="flex flex-col gap-4"
                                    aria-label={
                                        groups.length > 1 ? heading : t('subscription.billing.paymentMethods.title')
                                    }
                                >
                                    {group.cards.map(card => (
                                        <CardRow
                                            key={card.id}
                                            card={card}
                                            label={label(card)}
                                            failing={failing && card.isDefault && chargesSubscription(card)}
                                            failureReason={subscription?.failureReason}
                                            urgeDefault={inUseGroup && !!defaultCard?.expiringSoon && !card.isDefault}
                                            busy={busy}
                                            onMakeDefault={() => askMakeDefault(card)}
                                            onRemove={() => askRemove(card)}
                                        />
                                    ))}
                                </ul>
                            </div>
                        );
                    })
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
                    <div className="rounded-[14px] bg-note p-4 md:rounded-2xl md:px-6 md:py-5">
                        <p className="text-[13px] font-bold text-ink">
                            {t('subscription.billing.paymentMethods.notes.title')}
                        </p>
                        <ul className="mt-1.5 text-[13px] font-medium leading-[1.6] text-[#666b78] md:leading-normal">
                            {(['removeDefault', 'removeLast', 'domestic', 'noCharge'] as const).map(note => (
                                <li key={note}>• {t(`subscription.billing.paymentMethods.notes.${note}`)}</li>
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
                    (subscription?.nextBillingAt && subscription.nextAmount && chargesSubscription(dialog.card)
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
    // Small pill buttons: a phone's are the tall, two-line-weight ones of the design, the wide ones a
    // hairline pill. Deleting is red, and greyed on the default card, where it only explains why not.
    const small = 'max-md:h-[50px] max-md:px-4 max-md:text-[15px] md:h-9 md:border md:border-line md:px-4';
    return (
        <li
            className={cn(
                'flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[14px] border bg-card p-4 md:flex-nowrap md:px-[21px] md:py-4',
                card.isDefault && card.expiringSoon
                    ? 'border-status-warning'
                    : card.isDefault
                      ? 'border-2 border-main-green max-md:bg-[#f5ffe5] md:px-5'
                      : 'border-line'
            )}
        >
            <div className="flex min-w-0 items-center gap-4 max-md:w-full md:gap-3.5">
                <span className="flex h-6 w-9 shrink-0 items-center justify-center rounded bg-navy text-[11px] font-bold text-white md:h-[30px] md:w-11 md:rounded-md">
                    {card.brand}
                </span>
                <div className="flex min-w-0 flex-col gap-1 md:gap-0.5">
                    <p className="text-[15px] font-bold leading-normal text-ink">{label}</p>
                    {cardExpiry(card) && (
                        <p
                            className={cn(
                                'text-xs font-medium leading-normal',
                                failing ? 'text-[#c1292e]' : 'text-mute'
                            )}
                        >
                            {t('subscription.billing.card.expires', { expiry: cardExpiry(card) })}
                        </p>
                    )}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                {card.isDefault && (
                    <Badge className="bg-main-green font-semibold text-ink max-md:px-2 max-md:py-1 max-md:text-[11px]">
                        {t('subscription.billing.card.default')}
                    </Badge>
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
                        className={urgeDefault ? 'max-md:h-[50px] max-md:text-[15px] md:h-9' : small}
                        onClick={onMakeDefault}
                    >
                        {t('subscription.billing.paymentMethods.makeDefault')}
                    </Button>
                )}
                {/* The payment service refuses the default card, so its button only opens the explanation. */}
                <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    className={cn(
                        small,
                        card.isDefault
                            ? 'text-mute max-md:opacity-50 md:text-[#999ca3]'
                            : 'text-[#e5484d] max-md:border-[#f3c2c4] md:text-[#c1292e]'
                    )}
                    onClick={onRemove}
                >
                    {t('subscription.billing.paymentMethods.remove')}
                </Button>
            </div>
        </li>
    );
};
