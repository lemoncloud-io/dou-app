import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { PageLoader } from '../../components';
import { Banner, Button, Card } from '../../components/ui';
import { usePreviewCheckout, useStartCheckout, useStartPaymentMethodRegistration } from '../../hooks';
import { toIsoDate } from '../../lib/calendar';
import { isPortError, useToday } from '../../lib/port';
import { formatDate, formatMoney } from '../../utils';
import {
    changePlanUrl,
    checkoutDetailsOf,
    checkoutUrl,
    dayBefore,
    formatShortDate,
    registrationOutcomeUrl,
    statusUrl,
    withCheckoutDetails,
} from './flow';
import { CheckoutSteps, FactRows, LoadError, OrderSummary } from './parts';
import { usePlanRoute } from './usePlanRoute';

const errorKeyOf = (error: unknown): string => {
    if (isPortError(error, 'limit')) return 'subscription.checkout.payment.error.limit';
    if (isPortError(error, 'conflict')) return 'subscription.checkout.payment.error.conflict';
    if (isPortError(error, 'network')) return 'subscription.common.error.network';
    return 'subscription.common.error.unknown';
};

/**
 * W-05 — the card, through the payment provider's window. Once a card is registered the checkout
 * starts and the reader follows it on W-09. A window that fails or is closed has started nothing, so
 * W-09 is told only how it ended.
 *
 * It needs what W-08 settled (country, billing email), carried in the navigation state; without it —
 * a pasted link, or a return after signing in again — it goes back to W-08 rather than skip the
 * consents given there.
 */
export const CheckoutPaymentPage = (): JSX.Element => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { loading, error: loadError, retry, target: plan, route } = usePlanRoute();
    const preview = usePreviewCheckout(route === 'checkout' ? plan?.id : undefined);
    const registration = useStartPaymentMethodRegistration();
    const startCheckout = useStartCheckout();
    const today = toIsoDate(useToday());
    const [error, setError] = useState<string>();
    // Once the window has registered a card for this checkout, trying again goes straight to the
    // charge: reopening the window would register (and with a real provider, authorise) another card.
    const [registered, setRegistered] = useState(false);

    const details = checkoutDetailsOf(location.state);

    if (loading) return <PageLoader />;
    if (loadError) return <LoadError error={loadError} onRetry={retry} />;
    if (!plan) return <Navigate to={ROUTES.subscription.plans} replace />;
    // Back from W-09 or W-06, or a second tab: a subscriber has nothing left to buy here.
    if (route === 'change') return <Navigate to={changePlanUrl(plan.id)} replace />;
    if (route === 'plans') return <Navigate to={ROUTES.subscription.plans} replace />;
    if (!details) return <Navigate to={checkoutUrl(plan.id)} replace />;
    if (preview.isError) return <LoadError error={preview.error} onRetry={preview.refetch} />;
    if (!preview.data) return <PageLoader />;

    const { withTrial, firstChargeAt, amountToday } = preview.data;
    const money = (amount: typeof amountToday) => formatMoney(amount, i18n.language);
    const busy = registration.isPending || startCheckout.isPending;
    const day = Number(firstChargeAt.slice(8, 10));

    const onPay = async () => {
        setError(undefined);
        try {
            if (!registered) {
                const { outcome } = await registration.mutateAsync({ purpose: 'start', planId: plan.id });
                if (outcome !== 'registered') {
                    navigate(registrationOutcomeUrl(plan.id, outcome), withCheckoutDetails(details));
                    return;
                }
                setRegistered(true);
            }
            const attempt = await startCheckout.mutateAsync({
                planId: plan.id,
                country: details.country,
                emailId: details.emailId,
            });
            // Replaced, not pushed: Back from W-09 should not land on a payment form already paid.
            navigate(statusUrl(attempt.id, plan.id), { replace: true, ...withCheckoutDetails(details) });
        } catch (err) {
            // A lost session is the route root's to handle; it has already moved the reader on.
            if (!isPortError(err, 'unauthenticated')) setError(errorKeyOf(err));
        }
    };

    return (
        <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-8">
            <div className="flex flex-col gap-6">
                <CheckoutSteps current={4} />
                <header className="flex flex-col gap-2">
                    <h1 className="text-[28px] font-bold text-navy">{t('subscription.checkout.payment.title')}</h1>
                    <p className="text-[15px] text-subtitle">
                        {withTrial
                            ? t('subscription.checkout.payment.subtitleTrial')
                            : t('subscription.checkout.payment.subtitlePaid', { price: money(amountToday) })}
                    </p>
                </header>

                <Card className="flex flex-col gap-3">
                    <h2 className="text-[15px] font-semibold text-navy">{t('subscription.checkout.payment.card')}</h2>
                    <p className="text-[13px] text-subtitle">{t('subscription.checkout.payment.cardNote')}</p>
                    <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted px-5 py-4">
                        <span className="text-sm font-medium text-desc-alt">
                            {t('subscription.checkout.payment.windowTitle')}
                        </span>
                        <span className="text-xs text-subtitle">{t('subscription.checkout.payment.windowSteps')}</span>
                    </div>
                </Card>

                {error && <Banner tone="danger" title={t(error)} />}

                <Button size="lg" className="w-full rounded-full" disabled={busy} onClick={onPay}>
                    {withTrial
                        ? t('subscription.checkout.payment.ctaTrial')
                        : t('subscription.checkout.payment.ctaPaid', { price: money(amountToday) })}
                </Button>
                <p className="text-[13px] text-subtitle">
                    {withTrial
                        ? t('subscription.checkout.payment.renewTrial', {
                              date: formatDate(firstChargeAt),
                              day,
                              price: money(plan.monthly),
                          })
                        : t('subscription.checkout.payment.renewPaid', { day, price: money(plan.monthly) })}
                </p>
                <Link
                    to={checkoutUrl(plan.id)}
                    className="inline-flex h-12 w-fit items-center rounded-full border border-border px-7 text-[15px] font-semibold text-navy hover:bg-muted"
                >
                    {t('subscription.checkout.payment.back')}
                </Link>
            </div>

            <OrderSummary>
                <FactRows
                    rows={[
                        {
                            key: 'plan',
                            label: t('subscription.checkout.summary.plan'),
                            value: t('subscription.common.planName', { sort: plan.sort }),
                        },
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
                        {
                            key: 'firstCharge',
                            label: t('subscription.checkout.summary.firstChargeShort'),
                            value: t('subscription.checkout.summary.dateAndPrice', {
                                date: formatShortDate(firstChargeAt),
                                price: money(plan.monthly),
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
        </div>
    );
};
