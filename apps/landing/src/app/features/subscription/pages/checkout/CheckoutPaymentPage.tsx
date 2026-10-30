import { type JSX, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { isDevStage } from '../../../../config/stage';
import { ROUTES } from '../../../../routes/paths';
import { PageLoader } from '../../components';
import { Banner, Button, Card } from '../../components/ui';
import {
    useCompletePaymentMethodRegistration,
    usePreviewCheckout,
    useStartCheckout,
    useStartPaymentMethodRegistration,
} from '../../hooks';
import { currencyOfCountry } from '../../lib/billingCountry';
import { toIsoDate } from '../../lib/calendar';
import { clearPendingCheckout, peekPendingCheckout, savePendingCheckout } from '../../lib/pendingCheckout';
import { isPortError, useToday } from '../../lib/port';
import { formatDate, formatMoney } from '../../utils';
import {
    type CheckoutDetails,
    changePlanUrl,
    checkoutDetailsOf,
    checkoutUrl,
    dayBefore,
    formatShortDate,
    registrationOutcomeUrl,
    statusUrl,
    withCheckoutDetails,
} from './flow';
import { CheckoutLayout, CheckoutSteps, FactRows, LoadError, OrderSummary } from './parts';
import { usePlanRoute } from './usePlanRoute';

import type { CardToken, PlanId } from '../../types';

/** What an unexpected failure said, for a dev host only: a phone has no console to read it from. */
const detailOf = (error: unknown): string | undefined =>
    isDevStage && !isPortError(error) ? (error instanceof Error ? error.message : String(error)) : undefined;

const errorKeyOf = (error: unknown): string => {
    if (isPortError(error, 'limit')) return 'subscription.checkout.payment.error.limit';
    if (isPortError(error, 'invalid')) return 'subscription.checkout.payment.error.invalid';
    if (isPortError(error, 'conflict')) return 'subscription.checkout.payment.error.conflict';
    if (isPortError(error, 'network')) return 'subscription.common.error.network';
    return 'subscription.common.error.unknown';
};

/**
 * W-05 — the card, through the payment provider's window. Once a card is registered the checkout
 * starts and the reader follows it on W-09. A window that fails or is closed has started nothing, so
 * W-09 is told only how it ended.
 *
 * It needs what W-08 settled (country, billing email, payer), carried in the navigation state; without it —
 * a pasted link, or a return after signing in again — it goes back to W-08 rather than skip the
 * consents given there.
 */
export const CheckoutPaymentPage = (): JSX.Element => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { loading, error: loadError, retry, target: plan, route } = usePlanRoute();
    const registration = useStartPaymentMethodRegistration();
    const completeRegistration = useCompletePaymentMethodRegistration();
    const startCheckout = useStartCheckout();
    const [params] = useSearchParams();
    const today = toIsoDate(useToday());
    const [error, setError] = useState<string>();
    const [detail, setDetail] = useState<string>();
    // Once the window has registered a card for this checkout, trying again goes straight to the
    // charge with that card: reopening the window would register (and with a real provider,
    // authorise) another one.
    const [card, setCard] = useState<CardToken>();

    // A phone's payment window is the provider's own page: the browser left for it and came back here
    // with the result in the query. The state W-08 handed over did not survive the trip, so the checkout
    // saved when the window opened stands in for it.
    const [returning] = useState(() => {
        const comesBack = [...params.keys()].some(key => key !== 'plan');
        return comesBack ? peekPendingCheckout(params.get('plan')) : undefined;
    });
    const [resuming, setResuming] = useState(!!returning);
    const resumed = useRef(false);
    // A card dialog left open when the reader goes elsewhere ends as closed; by then this page is gone and
    // has nowhere to send them.
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const details =
        checkoutDetailsOf(location.state) ??
        (returning ? checkoutDetailsOf({ checkout: returning.details }) : undefined);
    // Priced in the billing country's currency, as W-08 showed it.
    const preview = usePreviewCheckout(
        route === 'checkout' && details ? plan?.id : undefined,
        details && currencyOfCountry(details.country)
    );

    // From the registration on: a registered card goes straight on to the charge, anything else to the
    // screen that says how the window ended.
    const charge = async (planId: PlanId, forDetails: CheckoutDetails, registeredCard: CardToken) => {
        const attempt = await startCheckout.mutateAsync({
            planId,
            country: forDetails.country,
            emailId: forDetails.emailId,
            payer: forDetails.payer,
            card: registeredCard,
        });
        // Replaced, not pushed: Back from W-09 should not land on a payment form already paid.
        navigate(statusUrl(attempt.id, planId), { replace: true, ...withCheckoutDetails(forDetails) });
    };

    useEffect(() => {
        if (!returning || resumed.current) return;
        resumed.current = true;
        const settled = checkoutDetailsOf({ checkout: returning.details });
        if (!settled) return;
        clearPendingCheckout();
        completeRegistration
            .mutateAsync({ callback: params, purpose: 'start', payer: settled.payer })
            .then(result => {
                if (result.outcome !== 'registered') {
                    navigate(registrationOutcomeUrl(returning.planId, result.outcome), {
                        replace: true,
                        ...withCheckoutDetails(settled),
                    });
                    return undefined;
                }
                setCard(result.card);
                return charge(returning.planId, settled, result.card);
            })
            .catch((err: unknown) => {
                // A lost session is the route root's to handle; it has already moved the reader on.
                if (!isPortError(err, 'unauthenticated')) {
                    setError(errorKeyOf(err));
                    setDetail(detailOf(err));
                }
                setResuming(false);
            });
        // Once per arrival: the saved checkout is taken away above, so a second run would find nothing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) return <PageLoader />;
    if (loadError) return <LoadError error={loadError} onRetry={retry} />;
    if (!plan) return <Navigate to={ROUTES.subscription.plans} replace />;
    // The window's result is being read and the charge started: nothing for the reader to press yet.
    if (resuming) return <PageLoader />;
    // Back from W-09 or W-06, or a second tab: a subscriber has nothing left to buy here.
    if (route === 'change') return <Navigate to={changePlanUrl(plan.id)} replace />;
    if (route === 'plans') return <Navigate to={ROUTES.subscription.plans} replace />;
    if (!details) return <Navigate to={checkoutUrl(plan.id)} replace />;
    if (preview.isError) return <LoadError error={preview.error} onRetry={preview.refetch} />;
    if (!preview.data || preview.isPlaceholderData) return <PageLoader />;

    const { withTrial, firstChargeAt, amountToday } = preview.data;
    const { monthly } = preview.data.plan;
    const money = (amount: typeof amountToday) => formatMoney(amount, i18n.language);
    const busy = registration.isPending || startCheckout.isPending;
    const day = Number(firstChargeAt.slice(8, 10));

    const onPay = async () => {
        setError(undefined);
        setDetail(undefined);
        try {
            let registeredCard = card;
            if (!registeredCard) {
                // On a phone this call never returns: the page leaves for the provider's, and what was
                // settled here has to be waiting when it comes back.
                savePendingCheckout({ planId: plan.id, details });
                const result = await registration.mutateAsync({
                    purpose: 'start',
                    planId: plan.id,
                    country: details.country,
                    payer: details.payer,
                });
                clearPendingCheckout();
                if (!mounted.current) return;
                if (result.outcome !== 'registered') {
                    navigate(registrationOutcomeUrl(plan.id, result.outcome), withCheckoutDetails(details));
                    return;
                }
                registeredCard = result.card;
                setCard(registeredCard);
            }
            await charge(plan.id, details, registeredCard);
        } catch (err) {
            // A lost session is the route root's to handle; it has already moved the reader on.
            if (!isPortError(err, 'unauthenticated')) {
                setError(errorKeyOf(err));
                setDetail(detailOf(err));
            }
        }
    };

    return (
        <CheckoutLayout
            head={
                <>
                    <CheckoutSteps current={4} />
                    <header className="flex flex-col gap-2">
                        <h1 className="text-[22px] font-bold leading-[1.5] text-ink md:text-[28px]">
                            {t('subscription.checkout.payment.title')}
                        </h1>
                        <p className="text-sm font-medium leading-[1.5] text-mute md:text-[15px]">
                            {withTrial
                                ? t('subscription.checkout.payment.subtitleTrial')
                                : t('subscription.checkout.payment.subtitlePaid', { price: money(amountToday) })}
                        </p>
                    </header>
                </>
            }
            summary={
                <OrderSummary>
                    <FactRows
                        rows={[
                            {
                                key: 'plan',
                                label: t('subscription.checkout.summary.plan'),
                                value: t('subscription.common.planName', { sort: plan.sort }),
                            },
                            // With no trial on offer the summary says nothing about one.
                            ...(preview.data.plan.trialDays > 0
                                ? [
                                      {
                                          key: 'trial',
                                          label: t('subscription.checkout.summary.trial'),
                                          value: withTrial
                                              ? t('subscription.checkout.summary.trialRangeShort', {
                                                    from: formatShortDate(today),
                                                    to: formatShortDate(dayBefore(firstChargeAt)),
                                                })
                                              : t('subscription.checkout.summary.none'),
                                      },
                                  ]
                                : []),
                            {
                                key: 'firstCharge',
                                label: t('subscription.checkout.summary.firstChargeShort'),
                                value: t('subscription.checkout.summary.dateAndPrice', {
                                    date: formatShortDate(firstChargeAt),
                                    price: money(monthly),
                                }),
                            },
                            {
                                key: 'today',
                                label: t('subscription.checkout.summary.chargeToday'),
                                value: money(amountToday),
                                strong: true,
                            },
                        ]}
                    />
                </OrderSummary>
            }
        >
            <Card className="flex flex-col gap-3 rounded-[14px] border-line p-4 md:rounded-2xl md:px-[25px] md:py-[21px]">
                <h2 className="text-sm font-bold text-ink">{t('subscription.checkout.payment.card')}</h2>
                <p className="text-[13px] font-medium leading-[1.6] text-mute">
                    {t('subscription.checkout.payment.cardNote')}
                </p>
                <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-[#d9dbe0] bg-note px-5 py-5 text-center md:border-solid md:border-transparent md:py-4 md:text-left">
                    <span className="text-[13px] font-semibold text-[#4d4f57]">
                        {t('subscription.checkout.payment.windowTitle')}
                    </span>
                    <span className="text-xs font-medium text-mute">
                        {t(`subscription.checkout.payment.windowSteps.${currencyOfCountry(details.country)}`)}
                    </span>
                </div>
            </Card>

            {error && (
                <Banner tone="danger" title={t(error)}>
                    {detail}
                </Banner>
            )}

            <div className="flex flex-col gap-3">
                <Button size="lg" className="w-full max-md:h-[54px]" disabled={busy} onClick={onPay}>
                    {withTrial
                        ? t('subscription.checkout.payment.ctaTrial')
                        : t('subscription.checkout.payment.ctaPaid', { price: money(amountToday) })}
                </Button>
                <p className="text-xs font-medium leading-[1.6] text-mute md:text-[13px]">
                    {withTrial
                        ? t('subscription.checkout.payment.renewTrial', {
                              date: formatDate(firstChargeAt),
                              day,
                              price: money(monthly),
                          })
                        : t('subscription.checkout.payment.renewPaid', { day, price: money(monthly) })}
                </p>
            </div>
            <Link
                to={checkoutUrl(plan.id)}
                className="w-fit text-[13px] font-medium text-mute underline hover:text-ink"
            >
                {t('subscription.checkout.payment.back')}
            </Link>
        </CheckoutLayout>
    );
};
