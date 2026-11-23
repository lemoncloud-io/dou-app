import { type JSX, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { isDevStage } from '../../../../config/stage';
import { ROUTES } from '../../../../routes/paths';
import { PageLoader } from '../../components';
import { Banner, Button, Card } from '../../components/ui';
import {
    useCompletePaymentMethodRegistration,
    useForeignBilling,
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
    handedAbroad,
    registrationOutcomeUrl,
    statusUrl,
    withCheckoutDetails,
} from './flow';
import { CheckoutLayout, CheckoutSteps, FactRows, LoadError, OrderSummary } from './parts';
import { usePlanRoute } from './usePlanRoute';
import { commonErrorKey } from '../../lib/errorKey';

import type { CardToken, PlanId } from '../../types';

const detailOf = (error: unknown): string | undefined =>
    isDevStage && !isPortError(error) ? (error instanceof Error ? error.message : String(error)) : undefined;

const errorKeyOf = (error: unknown): string => {
    if (isPortError(error, 'limit')) return 'subscription.checkout.payment.error.limit';
    if (isPortError(error, 'invalid')) return 'subscription.checkout.payment.error.invalid';
    if (isPortError(error, 'conflict')) return 'subscription.checkout.payment.error.conflict';
    return commonErrorKey(error);
};

export const CheckoutPaymentPage = (): JSX.Element => {
    const location = useLocation();
    const [params] = useSearchParams();
    const abroad =
        handedAbroad(location.state) ||
        handedAbroad({ checkout: comesBack(params) ? peekPendingCheckout(params.get('plan'))?.details : undefined });
    const foreignBilling = useForeignBilling({ enabled: abroad });
    if (foreignBilling === 'reading') return <PageLoader />;
    return <CheckoutPayment foreignBilling={foreignBilling === 'open'} />;
};

const comesBack = (params: URLSearchParams): boolean => [...params.keys()].some(key => key !== 'plan');

const CheckoutPayment = ({ foreignBilling }: { foreignBilling: boolean }): JSX.Element => {
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
    const [card, setCard] = useState<CardToken>();

    const [returning] = useState(() => (comesBack(params) ? peekPendingCheckout(params.get('plan')) : undefined));
    const [resuming, setResuming] = useState(!!returning);
    const resumed = useRef(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const details =
        checkoutDetailsOf(location.state, foreignBilling) ??
        (returning ? checkoutDetailsOf({ checkout: returning.details }, foreignBilling) : undefined);
    const preview = usePreviewCheckout(
        route === 'checkout' && details ? plan?.id : undefined,
        details && currencyOfCountry(details.country)
    );

    const charge = async (planId: PlanId, forDetails: CheckoutDetails, registeredCard: CardToken) => {
        const attempt = await startCheckout.mutateAsync({
            planId,
            country: forDetails.country,
            emailId: forDetails.emailId,
            payer: forDetails.payer,
            card: registeredCard,
        });
        navigate(statusUrl(attempt.id, planId), { replace: true, ...withCheckoutDetails(forDetails) });
    };

    useEffect(() => {
        if (!returning || resumed.current) return;
        resumed.current = true;
        const settled = checkoutDetailsOf({ checkout: returning.details }, foreignBilling);
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
                if (!isPortError(err, 'unauthenticated')) {
                    setError(errorKeyOf(err));
                    setDetail(detailOf(err));
                }
                setResuming(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) return <PageLoader />;
    if (loadError) return <LoadError error={loadError} onRetry={retry} />;
    if (!plan) return <Navigate to={ROUTES.subscription.plans} replace />;
    if (resuming) return <PageLoader />;
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
                state={withCheckoutDetails(details)?.state}
                className="w-fit text-[13px] font-medium text-mute underline hover:text-ink"
            >
                {t('subscription.checkout.payment.back')}
            </Link>
        </CheckoutLayout>
    );
};
