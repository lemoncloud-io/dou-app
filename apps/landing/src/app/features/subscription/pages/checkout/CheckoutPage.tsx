import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { PageLoader, accountLabel } from '../../components';
import { Banner, Button, Card } from '../../components/ui';
import { usePreviewCheckout } from '../../hooks';
import { toIsoDate } from '../../lib/calendar';
import { useToday } from '../../lib/port';
import { formatDate, formatMoney } from '../../utils';
import { BillingEmailField, type VerifiedEmail } from './BillingEmailField';
import {
    BILLING_COUNTRY_OPTIONS,
    CONSENTS,
    type Consents,
    NO_CONSENTS,
    allConsented,
    canContinueCheckout,
    changePlanUrl,
    checkoutPaymentUrl,
    dayBefore,
    formatShortDate,
    isSupportedCountry,
    setAllConsents,
} from './flow';
import { CheckoutSteps, FactRows, LoadError, OrderSummary } from './parts';
import { usePlanRoute } from './usePlanRoute';

import type { CheckoutPreview } from '../../types';

const checkboxClass = 'h-5 w-5 shrink-0 cursor-pointer accent-main-green';

/**
 * W-08 — checkout: the plan and what it costs, which account it applies to, the billing country and
 * email, and the consents. The way on to the payment window opens only once all three are settled.
 */
export const CheckoutPage = (): JSX.Element => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { loading, error, retry, target: plan, route } = usePlanRoute();
    const preview = usePreviewCheckout(route === 'checkout' ? plan?.id : undefined);

    const [country, setCountry] = useState<string>(BILLING_COUNTRY_OPTIONS[0]);
    const [email, setEmail] = useState<VerifiedEmail>();
    const [consents, setConsents] = useState<Consents>(NO_CONSENTS);

    if (loading) return <PageLoader />;
    if (error) return <LoadError error={error} onRetry={retry} />;
    if (!plan) return <Navigate to={ROUTES.subscription.plans} replace />;
    if (route === 'change') return <Navigate to={changePlanUrl(plan.id)} replace />;
    if (route === 'plans') return <Navigate to={ROUTES.subscription.plans} replace />;

    if (preview.isError) return <LoadError error={preview.error} onRetry={preview.refetch} />;
    if (!preview.data) return <PageLoader />;

    const money = (amount: CheckoutPreview['amountToday']) => formatMoney(amount, i18n.language);
    const { account, withTrial } = preview.data;
    const supported = isSupportedCountry(country);
    const ready = canContinueCheckout({ country, emailId: email?.id, consents });

    const onContinue = () => {
        if (!email) return;
        navigate(checkoutPaymentUrl(plan.id), { state: { checkout: { country, emailId: email.id } } });
    };

    return (
        <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-8">
            <div className="flex flex-col gap-6">
                <CheckoutSteps current={3} />
                <header className="flex flex-col gap-2">
                    <h1 className="text-[28px] font-bold text-navy">{t('subscription.checkout.details.title')}</h1>
                    <p className="text-[15px] text-subtitle">{t('subscription.checkout.details.subtitle')}</p>
                </header>

                <Card className="flex flex-col gap-3">
                    <h2 className="text-[15px] font-semibold text-navy">
                        {t('subscription.checkout.details.accountTitle')}
                    </h2>
                    <div className="flex items-center gap-3">
                        <span
                            aria-hidden
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-navy font-semibold text-white"
                        >
                            {(account.displayName ?? accountLabel(account, t)).slice(0, 1).toUpperCase()}
                        </span>
                        <div className="flex flex-col">
                            {account.displayName && (
                                <span className="font-semibold text-navy">{account.displayName}</span>
                            )}
                            <span className="text-[13px] text-subtitle">
                                {t(`subscription.checkout.details.provider.${account.provider}`)}
                                {(account.email ?? account.emailHint) && ` · ${account.email ?? account.emailHint}`}
                            </span>
                        </div>
                    </div>
                    <p className="text-[13px] text-subtitle">{t('subscription.checkout.details.accountNote')}</p>
                </Card>

                <Card className="flex flex-col gap-4">
                    <h2 className="text-[15px] font-semibold text-navy">{t('subscription.checkout.billing.title')}</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <label htmlFor="checkout-country" className="text-[13px] text-desc-alt">
                                {t('subscription.checkout.billing.country')}
                            </label>
                            <select
                                id="checkout-country"
                                value={country}
                                onChange={event => setCountry(event.target.value)}
                                className="h-12 rounded-xl border border-border bg-white px-4 text-[15px] text-navy outline-none focus:border-navy/40"
                            >
                                {BILLING_COUNTRY_OPTIONS.map(code => (
                                    <option key={code} value={code}>
                                        {t(`subscription.checkout.billing.countries.${code}`)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <BillingEmailField defaultAddress={account.email} value={email} onChange={setEmail} />
                    </div>
                    <p className="text-[13px] text-subtitle">{t('subscription.checkout.billing.countryNote')}</p>
                    {!supported && (
                        <Banner tone="info" title={t('subscription.checkout.billing.comingSoonTitle')}>
                            {t('subscription.checkout.billing.comingSoonBody')}
                        </Banner>
                    )}
                </Card>

                <Card className="flex flex-col gap-4">
                    <label className="flex items-center gap-3 text-[15px] font-semibold text-navy">
                        <input
                            type="checkbox"
                            className={checkboxClass}
                            checked={allConsented(consents)}
                            onChange={event => setConsents(setAllConsents(event.target.checked))}
                        />
                        {t('subscription.checkout.consent.all')}
                    </label>
                    <div className="flex flex-col gap-3 border-t border-border pt-4">
                        {CONSENTS.map(key => (
                            <div key={key} className="flex items-center gap-3 text-sm text-navy">
                                <input
                                    id={`consent-${key}`}
                                    type="checkbox"
                                    className={checkboxClass}
                                    aria-required
                                    checked={consents[key]}
                                    onChange={event => setConsents({ ...consents, [key]: event.target.checked })}
                                />
                                <label htmlFor={`consent-${key}`} className="flex items-center gap-3">
                                    {t(`subscription.checkout.consent.${key}`)}
                                    <span className="text-xs text-status-danger">
                                        {t('subscription.checkout.consent.required')}
                                    </span>
                                </label>
                                {key !== 'autoRenew' && (
                                    <Link
                                        to={key === 'terms' ? ROUTES.policy.terms : ROUTES.policy.privacy}
                                        target="_blank"
                                        className="ml-auto text-xs text-subtitle underline"
                                    >
                                        {t('subscription.checkout.consent.view')}
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>
                    <p className="rounded-xl bg-muted px-4 py-3 text-[13px] leading-relaxed text-desc-alt">
                        {withTrial
                            ? t('subscription.checkout.consent.noticeTrial', {
                                  date: formatDate(preview.data.firstChargeAt),
                                  day: Number(preview.data.firstChargeAt.slice(8, 10)),
                                  price: money(plan.monthly),
                              })
                            : t('subscription.checkout.consent.noticePaid', {
                                  day: Number(preview.data.firstChargeAt.slice(8, 10)),
                                  price: money(plan.monthly),
                              })}
                    </p>
                </Card>

                <Button size="lg" className="w-full rounded-full" disabled={!ready} onClick={onContinue}>
                    {t('subscription.checkout.details.next')}
                </Button>
            </div>

            <CheckoutSummary preview={preview.data} />
        </div>
    );
};

/** W-08's order summary: the plan, its allowance and price, the trial and when the first charge falls. */
const CheckoutSummary = ({ preview }: { preview: CheckoutPreview }): JSX.Element => {
    const { t, i18n } = useTranslation();
    const today = toIsoDate(useToday());
    const { plan, withTrial, firstChargeAt, amountToday } = preview;
    const firstChargeIsToday = firstChargeAt === today;
    return (
        <OrderSummary>
            <FactRows
                rows={[
                    {
                        key: 'plan',
                        label: t('subscription.checkout.summary.plan'),
                        value: t('subscription.common.planName', { sort: plan.sort }),
                    },
                    {
                        key: 'clouds',
                        label: t('subscription.checkout.summary.clouds'),
                        value: t('subscription.checkout.summary.cloudCount', { count: plan.maxClouds }),
                    },
                    {
                        key: 'monthly',
                        label: t('subscription.checkout.summary.monthly'),
                        value: t('subscription.checkout.summary.monthlyValue', {
                            price: formatMoney(plan.monthly, i18n.language),
                        }),
                    },
                    {
                        key: 'trial',
                        label: t('subscription.checkout.summary.trial'),
                        value: withTrial
                            ? t('subscription.checkout.summary.trialRange', {
                                  from: formatShortDate(today),
                                  to: formatShortDate(dayBefore(firstChargeAt)),
                                  count: plan.trialDays,
                              })
                            : t('subscription.checkout.summary.trialUsed'),
                    },
                    {
                        key: 'firstCharge',
                        label: t('subscription.checkout.summary.firstCharge'),
                        value: firstChargeIsToday
                            ? t('subscription.checkout.summary.today', { date: formatDate(firstChargeAt) })
                            : formatDate(firstChargeAt),
                    },
                    {
                        key: 'today',
                        label: t('subscription.checkout.summary.chargeToday'),
                        value: formatMoney(amountToday, i18n.language),
                        strong: true,
                    },
                ]}
            />
        </OrderSummary>
    );
};
