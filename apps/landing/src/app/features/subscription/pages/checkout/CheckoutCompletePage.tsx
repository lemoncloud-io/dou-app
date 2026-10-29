import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { PageLoader, SummaryTile } from '../../components';
import {
    useCurrentSubscription,
    useInvoices,
    usePaymentAttempt,
    usePlans,
    useSession,
    useSubscription,
    useSubscriptions,
} from '../../hooks';
import { toIsoDate } from '../../lib/calendar';
import { useToday } from '../../lib/port';
import { formatDate, formatMoney } from '../../utils';
import { type CompleteScene, chargedToday, completeSceneOf, dayBefore, formatShortDate, statusUrl } from './flow';
import { AppStoreLink, CheckoutSteps, FactRows, LoadError, NoteBox, ResultHeader } from './parts';

import type { Account, Plan, Subscription } from '../../types';

const primaryLink =
    'inline-flex h-12 items-center justify-center rounded-full bg-main-green px-7 text-[15px] font-semibold text-navy hover:opacity-90';
const secondaryLink =
    'inline-flex h-12 items-center justify-center rounded-full border border-border bg-white px-7 text-[15px] font-semibold text-navy hover:bg-muted';

/**
 * W-06 — the end of a checkout: a trial started, a first payment made, an upgrade made (`?attempt=`),
 * or a downgrade scheduled (`?change=downgrade`, which has no attempt — nothing is charged). An attempt
 * that has not gone through is sent back to W-09, which knows how to show it.
 */
export const CheckoutCompletePage = (): JSX.Element => {
    const [params] = useSearchParams();
    const attemptId = params.get('attempt');
    if (attemptId) return <AttemptComplete attemptId={attemptId} />;
    if (params.get('change') === 'downgrade') return <DowngradeScheduled />;
    return <Navigate to={ROUTES.subscription.root} replace />;
};

const AttemptComplete = ({ attemptId }: { attemptId: string }): JSX.Element => {
    const location = useLocation();
    const [params] = useSearchParams();
    const attempt = usePaymentAttempt(attemptId);
    const subscription = useSubscription(attempt.data?.subscriptionId);
    const plans = usePlans();
    const session = useSession();

    if (attempt.isError) return <LoadError error={attempt.error} onRetry={attempt.refetch} />;
    if (!attempt.data) return <PageLoader />;

    const scene = completeSceneOf(attempt.data);
    if (!scene) {
        return (
            <Navigate to={statusUrl(attempt.data.id, params.get('plan') ?? undefined)} replace state={location.state} />
        );
    }
    if (subscription.isError) {
        return <LoadError error={subscription.error} onRetry={subscription.refetch} />;
    }
    const plan = plans.data?.find(p => p.id === subscription.data?.planId);
    if (!subscription.data || !plan || !session.data) return <PageLoader />;

    return scene === 'upgraded' ? (
        <Upgraded subscription={subscription.data} plan={plan} />
    ) : (
        <Started scene={scene} subscription={subscription.data} plan={plan} account={session.data} />
    );
};

/** "Minji Kim (Google)", or the address when there is no name. */
const useAccountName = (account: Account): string => {
    const { t } = useTranslation();
    const name = account.displayName ?? account.email ?? account.emailHint;
    const provider = t(`subscription.checkout.details.provider.${account.provider}`);
    return name ? t('subscription.checkout.complete.accountName', { name, provider }) : provider;
};

/** The three steps to a first cloud in the app, after a first subscription. */
const AppSetupBox = ({ plan }: { plan: Plan }): JSX.Element => {
    const { t } = useTranslation();
    return (
        <NoteBox className="border border-border bg-white" title={t('subscription.checkout.complete.appSetup.title')}>
            <ol className="list-inside list-decimal">
                <li>{t('subscription.checkout.complete.appSetup.open')}</li>
                <li>
                    {t('subscription.checkout.complete.appSetup.check', {
                        plan: t('subscription.common.planName', { sort: plan.sort }),
                    })}
                </li>
                <li>{t('subscription.checkout.complete.appSetup.create')}</li>
            </ol>
        </NoteBox>
    );
};

const Started = ({
    scene,
    subscription,
    plan,
    account,
}: {
    scene: Exclude<CompleteScene, 'upgraded'>;
    subscription: Subscription;
    plan: Plan;
    account: Account;
}): JSX.Element => {
    const { t, i18n } = useTranslation();
    const invoices = useInvoices();
    const today = toIsoDate(useToday());
    const accountName = useAccountName(account);
    const key = (name: string) => `subscription.checkout.complete.${name}`;
    const planName = t('subscription.common.planName', { sort: plan.sort });
    const money = (amount: Plan['monthly']) => formatMoney(amount, i18n.language);
    const nextAmount = subscription.nextAmount ?? plan.monthly;
    // What was charged comes from the invoice; without one the tile says so rather than guess.
    const paid = chargedToday(invoices.data, 'first', plan.id, today)?.amount;

    if (invoices.isLoading) return <PageLoader />;

    return (
        <section className="mx-auto flex max-w-[640px] flex-col gap-6">
            <div className="flex justify-center">
                <CheckoutSteps current={5} />
            </div>
            <ResultHeader
                tone="success"
                centered
                title={t(key(scene === 'trialStarted' ? 'trialTitle' : 'paidTitle'), { plan: planName })}
                body={t(key('appliedTo'), { account: accountName })}
            />
            {scene === 'trialStarted' ? (
                <FactRows
                    className="rounded-2xl bg-muted px-6 py-5"
                    rows={[
                        {
                            key: 'trial',
                            label: t(key('trialLabel')),
                            value: subscription.trialEndsAt
                                ? t(key('trialUntil'), { date: formatDate(dayBefore(subscription.trialEndsAt)) })
                                : '—',
                        },
                        {
                            key: 'renew',
                            label: t(key('renewLabel')),
                            value: subscription.nextBillingAt
                                ? t(key('renewValue'), {
                                      date: formatShortDate(subscription.nextBillingAt),
                                      day: subscription.billingDay,
                                      price: money(nextAmount),
                                  })
                                : '—',
                        },
                        { key: 'cancel', label: t(key('cancelLabel')), value: t(key('cancelValue')) },
                    ]}
                />
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <SummaryTile label={t(key('paidLabel'))} value={paid ? money(paid) : '—'} />
                    <SummaryTile
                        label={t(key('nextLabel'))}
                        value={subscription.nextBillingAt ? formatDate(subscription.nextBillingAt) : '—'}
                    />
                    <SummaryTile label={t(key('cancelLabel'))} value={t(key('cancelValue'))} />
                </div>
            )}
            <AppSetupBox plan={plan} />
            <div className="flex flex-wrap justify-center gap-3">
                <Link to={ROUTES.subscription.root} className={secondaryLink}>
                    {t(key('toManage'))}
                </Link>
                <AppStoreLink>{t(key('setUpInApp'))}</AppStoreLink>
            </div>
        </section>
    );
};

const Upgraded = ({ subscription, plan }: { subscription: Subscription; plan: Plan }): JSX.Element => {
    const { t, i18n } = useTranslation();
    const invoices = useInvoices();
    const today = toIsoDate(useToday());
    const key = (name: string) => `subscription.checkout.complete.${name}`;
    const charge = chargedToday(invoices.data, 'upgrade', plan.id, today);

    // Whether anything was charged is read from the invoices; until they arrive the line would guess.
    if (invoices.isLoading) return <PageLoader />;
    return (
        <section className="mx-auto flex max-w-[640px] flex-col gap-6 pt-6">
            <ResultHeader
                tone="success"
                centered
                title={t(key('upgradedTitle'), { plan: t(`subscription.checkout.planRo.${plan.sort}`) })}
                body={
                    charge
                        ? t(key('upgradedBodyPaid'), {
                              price: formatMoney(charge.amount, i18n.language),
                              count: plan.maxClouds,
                          })
                        : t(key('upgradedBodyFree'), { count: plan.maxClouds })
                }
            />
            <FactRows
                className="rounded-2xl bg-muted px-6 py-5"
                rows={[
                    {
                        key: 'next',
                        label: t(key('nextDateLabel')),
                        value: subscription.nextBillingAt ? formatDate(subscription.nextBillingAt) : '—',
                    },
                    {
                        key: 'amount',
                        label: t(key('nextAmountLabel')),
                        value: t('subscription.checkout.perMonth', {
                            price: formatMoney(subscription.nextAmount ?? plan.monthly, i18n.language),
                        }),
                    },
                    {
                        key: 'receipt',
                        label: t(key('receiptLabel')),
                        value: (
                            <Link to={ROUTES.subscription.history} className="underline">
                                {t(key('receiptValue'))}
                            </Link>
                        ),
                    },
                ]}
            />
            <div className="flex flex-wrap justify-center gap-3">
                <Link to={ROUTES.subscription.detail(subscription.id)} className={secondaryLink}>
                    {t(key('toSubscription'))}
                </Link>
                <AppStoreLink>{t(key('addInApp'))}</AppStoreLink>
            </div>
        </section>
    );
};

const DowngradeScheduled = (): JSX.Element => {
    const { t, i18n } = useTranslation();
    const { subscription, plan, isLoading } = useCurrentSubscription();
    const plans = usePlans();
    const subscriptions = useSubscriptions();
    const key = (name: string) => `subscription.checkout.complete.${name}`;

    if (isLoading || plans.isLoading) return <PageLoader />;
    if (plans.isError) return <LoadError error={plans.error} onRetry={plans.refetch} />;
    if (subscriptions.isError) return <LoadError error={subscriptions.error} onRetry={subscriptions.refetch} />;
    const change = subscription?.pendingChange;
    const target = plans.data?.find(p => p.id === change?.planId);
    if (!subscription || !plan || !change || !target) return <Navigate to={ROUTES.subscription.root} replace />;

    return (
        <section className="mx-auto flex max-w-[640px] flex-col gap-6 pt-6">
            <ResultHeader
                tone="success"
                title={t(key('downgradeTitle'), { plan: t(`subscription.checkout.planRo.${target.sort}`) })}
                body={t(key('downgradeBody'), {
                    date: formatDate(dayBefore(change.effectiveAt)),
                    plan: t(`subscription.checkout.planEul.${plan.sort}`),
                })}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryTile label={t(key('effectiveLabel'))} value={formatDate(change.effectiveAt)} />
                <SummaryTile
                    label={t(key('thatDayLabel'))}
                    value={formatMoney(subscription.nextAmount ?? target.monthly, i18n.language)}
                />
                <SummaryTile label={t(key('currentLabel'))} value={t(key('currentValue'))} />
            </div>
            <NoteBox title={t(key('chooseClouds.title'))}>
                {t(key('chooseClouds.body'), { count: target.maxClouds })}
            </NoteBox>
            <div>
                <Link to={ROUTES.subscription.detail(subscription.id)} className={primaryLink}>
                    {t(key('toSubscription'))}
                </Link>
            </div>
        </section>
    );
};
