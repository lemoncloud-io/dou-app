import { type JSX, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { BillingEmailChangeDialog, PageLoader, PayerFields, accountLabel } from '../../components';
import { Badge, Banner, Button, Card } from '../../components/ui';
import { useBillingInfo, usePreviewCheckout } from '../../hooks';
import { currencyOfCountry, payerRequiredIn } from '../../lib/billingCountry';
import { primaryVerifiedEmail } from '../../lib/billingEmail';
import { useManagementScreens } from '../../lib/screens';
import { EMPTY_PAYER, type PayerDraft, payerOf } from '../../lib/payer';
import { cn, formatDate, formatMoney } from '../../utils';
import {
    BILLING_COUNTRY_OPTIONS,
    CONSENTS,
    type Consents,
    NO_CONSENTS,
    allConsented,
    canContinueCheckout,
    changePlanUrl,
    checkoutEmailUrl,
    checkoutPaymentUrl,
    setAllConsents,
} from './flow';
import { CheckoutLayout, CheckoutSteps, CheckoutSummary, LoadError } from './parts';
import { usePlanRoute } from './usePlanRoute';

import type { CheckoutPreview } from '../../types';

// A step's boxes: white, hairline-bordered, 16px radius; a phone drops to 14px and tighter padding.
const CARD = 'flex flex-col gap-3.5 rounded-[14px] border-line p-4 md:rounded-2xl md:px-[25px] md:py-[21px]';
const CARD_TITLE = 'text-sm font-bold text-ink';

/**
 * W-08 — checkout: the plan and what it costs, which account it applies to, the billing country and
 * email, the payer, and the consents. The way on to the payment window opens once the country, the
 * payer and the consents are settled. The payer's name and number go on with the reader to W-05 and
 * are not kept anywhere else: the card company asks for them with each card.
 *
 * The billing country comes first and starts empty — nothing is picked for the reader. It decides the
 * currency (won for Korea, US dollars for any other country), so until it is chosen the summary shows no
 * amount and the payer is not asked for; once it is, the summary is priced in its currency and, for
 * Korea only, the payer fields appear. Which payment provider that means is the port's business, and
 * the page never names one.
 *
 * The billing email is not entered here. It is the primary address verified on W-24, shown as it is;
 * [change] opens the shared popup, which swaps a newly verified address in. A reader without a verified
 * primary address — a link pasted past W-24, or one removed since — is sent to W-24 with the plan kept.
 */
export const CheckoutPage = (): JSX.Element => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { loading, error, retry, target: plan, route } = usePlanRoute();
    const [country, setCountry] = useState('');
    const [countryMissing, setCountryMissing] = useState(false);
    const countryField = useRef<HTMLSelectElement>(null);
    // The account and the trial come from a preview in won; the amounts from one in the country's currency,
    // once there is a country. A failure of the second stays in the summary, so another country can be picked.
    const base = usePreviewCheckout(route === 'checkout' ? plan?.id : undefined);
    const pricedPreview = usePreviewCheckout(
        route === 'checkout' && country ? plan?.id : undefined,
        country ? currencyOfCountry(country) : undefined
    );
    const { emails: management } = useManagementScreens();
    // The billing-email screens are hidden: nothing here reads the billing emails then.
    const billing = useBillingInfo({ enabled: management });

    const [payer, setPayer] = useState<PayerDraft>(EMPTY_PAYER);
    const [consents, setConsents] = useState<Consents>(NO_CONSENTS);
    const [changingEmail, setChangingEmail] = useState(false);

    if (loading) return <PageLoader />;
    if (error) return <LoadError error={error} onRetry={retry} />;
    if (!plan) return <Navigate to={ROUTES.subscription.plans} replace />;
    if (route === 'change') return <Navigate to={changePlanUrl(plan.id)} replace />;
    if (route === 'plans') return <Navigate to={ROUTES.subscription.plans} replace />;

    if (base.isError) return <LoadError error={base.error} onRetry={base.refetch} />;
    if (management && billing.isError) return <LoadError error={billing.error} onRetry={billing.refetch} />;
    if (!base.data || (management && !billing.data)) return <PageLoader />;

    const billingEmail = management ? primaryVerifiedEmail(billing.data) : undefined;
    if (management && !billingEmail) return <Navigate to={checkoutEmailUrl(plan.id)} replace />;

    const money = (amount: CheckoutPreview['amountToday']) => formatMoney(amount, i18n.language);
    const { account, withTrial } = base.data;
    // With the billing-email screens hidden, the card company gets the account's own address.
    const emailAddress = management ? billingEmail?.address : account.email;
    const needsPayer = !!country && payerRequiredIn(country);
    // The amounts are the country's only once its own preview is in, not the one before it.
    const priced = !!country && !!pricedPreview.data && !pricedPreview.isPlaceholderData;
    const preview = { data: priced && pricedPreview.data ? pricedPreview.data : base.data };
    const ready = canContinueCheckout({ country, email: emailAddress, payer, consents });

    const onContinue = () => {
        if (!country) {
            setCountryMissing(true);
            countryField.current?.focus();
            return;
        }
        navigate(checkoutPaymentUrl(plan.id), {
            state: {
                checkout: {
                    country,
                    ...(billingEmail ? { emailId: billingEmail.id } : {}),
                    ...(needsPayer ? { payer: payerOf(payer, emailAddress ?? '') } : {}),
                },
            },
        });
    };

    return (
        <CheckoutLayout
            head={
                <>
                    <CheckoutSteps current={3} />
                    <header className="flex flex-col gap-2">
                        <h1 className="text-[22px] font-bold leading-[1.5] text-ink md:text-[28px]">
                            {t('subscription.checkout.details.title')}
                        </h1>
                        <p className="text-sm font-medium leading-[1.5] text-mute md:text-[15px]">
                            {t('subscription.checkout.details.subtitle')}
                        </p>
                    </header>
                </>
            }
            summary={
                <div className="flex flex-col gap-3">
                    <CheckoutSummary preview={preview.data} priced={priced} />
                    {country && pricedPreview.isError && (
                        <Banner
                            tone="danger"
                            title={t('subscription.common.error.unknown')}
                            action={
                                <Button size="sm" variant="secondary" onClick={() => void pricedPreview.refetch()}>
                                    {t('subscription.common.actions.retry')}
                                </Button>
                            }
                        />
                    )}
                </div>
            }
        >
            <Card className={CARD}>
                <h2 className={CARD_TITLE}>{t('subscription.checkout.details.accountTitle')}</h2>
                <div className="flex items-center gap-3">
                    <span
                        aria-hidden
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white"
                    >
                        {(account.displayName ?? accountLabel(account, t)).slice(0, 1).toUpperCase()}
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                        {account.displayName && (
                            <span className="text-[15px] font-bold text-ink">{account.displayName}</span>
                        )}
                        <span className="truncate text-[13px] font-medium text-mute">
                            {t(`subscription.checkout.details.provider.${account.provider}`)}
                            {(account.email ?? account.emailHint) && ` · ${account.email ?? account.emailHint}`}
                        </span>
                    </div>
                </div>
                <p className="text-xs font-medium leading-normal text-mute">
                    {t('subscription.checkout.details.accountNote')}
                </p>
            </Card>

            <Card className={CARD}>
                <h2 className={CARD_TITLE}>{t('subscription.checkout.billing.title')}</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
                    <div className="flex flex-col gap-2">
                        {/* The card's title already says it; the label stays for screen readers unless the email
                            field beside it needs the two told apart. */}
                        <label
                            htmlFor="checkout-country"
                            className={cn(
                                'text-[13px] font-semibold leading-6 text-[#4d4f57]',
                                !billingEmail && 'sr-only'
                            )}
                        >
                            {t('subscription.checkout.billing.country')}
                        </label>
                        <select
                            ref={countryField}
                            id="checkout-country"
                            value={country}
                            aria-required
                            aria-invalid={countryMissing}
                            aria-describedby={countryMissing ? 'checkout-country-missing' : undefined}
                            onChange={event => {
                                setCountry(event.target.value);
                                setCountryMissing(false);
                            }}
                            className={cn(
                                'h-[47px] rounded-lg border bg-white px-4 text-sm font-medium outline-none focus:border-navy/40',
                                country ? 'text-ink' : 'text-[#b4b6bc]',
                                countryMissing ? 'border-status-danger' : 'border-[#d9dbe0]'
                            )}
                        >
                            <option value="" disabled>
                                {t('subscription.checkout.billing.countryPlaceholder')}
                            </option>
                            {BILLING_COUNTRY_OPTIONS.map(code => (
                                <option key={code} value={code}>
                                    {t(`subscription.checkout.billing.countries.${code}`)}
                                </option>
                            ))}
                        </select>
                    </div>
                    {billingEmail && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold leading-6 text-[#4d4f57]">
                                    {t('subscription.checkout.billing.email')}
                                </span>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-auto border border-[#d9dbe0] px-2.5 py-0.5 text-xs md:border"
                                    onClick={() => setChangingEmail(true)}
                                >
                                    {t('subscription.checkout.billing.change')}
                                </Button>
                            </div>
                            <div className="flex h-[47px] items-center justify-between gap-2 rounded-lg border border-[#d9dbe0] pl-4 pr-3">
                                <span className="truncate text-sm font-medium text-ink" title={billingEmail.address}>
                                    {billingEmail.address}
                                </span>
                                <Badge className="shrink-0 bg-[#e5f7eb] px-2 py-0.5 font-semibold text-[#218c4d]">
                                    ✓ {t('subscription.common.email.verified')}
                                </Badge>
                            </div>
                        </div>
                    )}
                </div>
                {countryMissing && (
                    <p id="checkout-country-missing" role="alert" className="text-xs text-status-danger">
                        {t('subscription.checkout.billing.countryMissing')}
                    </p>
                )}
                {country && (
                    <p className="text-sm font-semibold text-ink">
                        {t(`subscription.checkout.billing.currency.${currencyOfCountry(country)}`)}
                    </p>
                )}
                <p className="text-xs font-medium leading-normal text-mute">
                    {t('subscription.checkout.billing.countryNote')}
                </p>
                {needsPayer && !management && emailAddress && (
                    <p className="text-xs font-medium leading-normal text-mute">
                        {t('subscription.checkout.billing.noticeEmail')}
                    </p>
                )}
                {needsPayer && !management && !emailAddress && (
                    <Banner tone="warning" title={t('subscription.checkout.billing.noAccountEmail.title')}>
                        {t('subscription.checkout.billing.noAccountEmail.body')}
                    </Banner>
                )}
            </Card>

            {needsPayer && (
                <Card className={CARD}>
                    <h2 className={CARD_TITLE}>{t('subscription.checkout.billing.payerTitle')}</h2>
                    <PayerFields idPrefix="checkout-payer" value={payer} onChange={setPayer} />
                </Card>
            )}

            <Card className={cn(CARD, 'gap-3')}>
                <label className="flex items-center gap-2 text-sm font-medium text-ink">
                    <input
                        type="checkbox"
                        className="checkbox-lime"
                        checked={allConsented(consents)}
                        onChange={event => setConsents(setAllConsents(event.target.checked))}
                    />
                    {t('subscription.checkout.consent.all')}
                </label>
                <div className="flex flex-col gap-3 border-t border-line pt-3 md:border-0 md:pt-2">
                    {CONSENTS.map(key => (
                        <div key={key} className="flex items-center gap-2 text-sm font-medium text-ink">
                            <input
                                id={`consent-${key}`}
                                type="checkbox"
                                className="checkbox-lime"
                                aria-required
                                checked={consents[key]}
                                onChange={event => setConsents({ ...consents, [key]: event.target.checked })}
                            />
                            <label htmlFor={`consent-${key}`} className="flex items-center gap-2">
                                {t(`subscription.checkout.consent.${key}`)}
                                <span className="text-xs font-semibold text-[#c1292e]">
                                    {t('subscription.checkout.consent.required')}
                                </span>
                            </label>
                            {key !== 'autoRenew' && (
                                <Link
                                    to={key === 'terms' ? ROUTES.policy.terms : ROUTES.policy.privacy}
                                    target="_blank"
                                    className="ml-auto text-xs font-medium text-mute underline"
                                >
                                    {t('subscription.checkout.consent.view')}
                                </Link>
                            )}
                        </div>
                    ))}
                </div>
                {priced && (
                    <p className="rounded-2xl bg-note px-4 py-3 text-[13px] font-medium leading-normal text-[#666b78]">
                        {withTrial
                            ? t('subscription.checkout.consent.noticeTrial', {
                                  date: formatDate(preview.data.firstChargeAt),
                                  day: Number(preview.data.firstChargeAt.slice(8, 10)),
                                  price: money(preview.data.plan.monthly),
                              })
                            : t('subscription.checkout.consent.noticePaid', {
                                  day: Number(preview.data.firstChargeAt.slice(8, 10)),
                                  price: money(preview.data.plan.monthly),
                              })}
                    </p>
                )}
            </Card>

            {/* Without a country the button stays pressable, so pressing it can say what is missing. */}
            <Button size="lg" className="w-full max-md:h-[54px]" disabled={!!country && !ready} onClick={onContinue}>
                {t('subscription.checkout.details.next')}
            </Button>

            {changingEmail && billingEmail && (
                <BillingEmailChangeDialog
                    current={billingEmail}
                    where="checkout"
                    onClose={() => setChangingEmail(false)}
                />
            )}
        </CheckoutLayout>
    );
};
