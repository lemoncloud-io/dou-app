import { type JSX, useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { PageLoader, SummaryTile } from '../../components';
import { AccountTitleContext } from '../../components/PageHeader';
import { useShellBack } from '../../components/PublicShell';
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
import { useSupports, useToday } from '../../lib/port';
import { formatDate, formatMoney } from '../../utils';
import { type CompleteScene, chargedToday, completeSceneOf, dayBefore, formatShortDate, statusUrl } from './flow';
import {
    AppStoreLink,
    CheckoutSteps,
    FactRows,
    LoadError,
    NoteBox,
    ResultActions,
    ResultHeader,
    primaryLink,
    secondaryLink,
} from './parts';

import type { Account, Plan, Subscription } from '../../types';

/**
 * W-06 — the end of a checkout: a trial started, a first payment made, or an upgrade made
 * (`?attempt=`). An attempt that has not gone through is sent back to W-09, which knows how to show it.
 * A downgrade scheduled (`?change=downgrade`, no attempt — nothing is charged) is `DowngradeScheduled`,
 * which the route frames as an account page.
 */
export const CheckoutCompletePage = (): JSX.Element => {
    const [params] = useSearchParams();
    const attemptId = params.get('attempt');
    if (attemptId) return <AttemptComplete attemptId={attemptId} />;
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
        <NoteBox
            className="items-start text-left md:border md:border-line md:bg-white md:p-5"
            title={t('subscription.checkout.complete.appSetup.title')}
        >
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
                    className="rounded-2xl bg-note px-5 py-4 md:px-6 md:py-5"
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
            <ResultActions>
                <Link to={ROUTES.subscription.root} className={secondaryLink}>
                    {t(key('toManage'))}
                </Link>
                <AppStoreLink>{t(key('setUpInApp'))}</AppStoreLink>
            </ResultActions>
        </section>
    );
};

const Upgraded = ({ subscription, plan }: { subscription: Subscription; plan: Plan }): JSX.Element => {
    const { t, i18n } = useTranslation();
    useShellBack();
    const invoices = useInvoices();
    const today = toIsoDate(useToday());
    const key = (name: string) => `subscription.checkout.complete.${name}`;
    const charge = chargedToday(invoices.data, 'upgrade', plan.id, today);
    // The receipt lives in the billing history, which is left out where the port has no server for it.
    const receipts = useSupports()('listInvoices');

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
                className="rounded-2xl bg-note px-5 py-4 md:px-6 md:py-5"
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
                    ...(receipts
                        ? [
                              {
                                  key: 'receipt',
                                  label: t(key('receiptLabel')),
                                  value: (
                                      <Link to={ROUTES.subscription.history} className="underline">
                                          {t(key('receiptValue'))}
                                      </Link>
                                  ),
                              },
                          ]
                        : []),
                ]}
            />
            <ResultActions>
                <Link to={ROUTES.subscription.detail(subscription.id)} className={secondaryLink}>
                    {t(key('toSubscription'))}
                </Link>
                <AppStoreLink>{t(key('addInApp'))}</AppStoreLink>
            </ResultActions>
        </section>
    );
};

/**
 * The scheduled-downgrade confirmation, inside the account frame: on a phone the bar names the page
 * "Change plan" like the screen that led here.
 */
export const DowngradeScheduled = (): JSX.Element => {
    const { t, i18n } = useTranslation();
    const { subscription, plan, isLoading } = useCurrentSubscription();
    const plans = usePlans();
    const subscriptions = useSubscriptions();
    const setBarTitle = useContext(AccountTitleContext);
    const barTitle = t('subscription.entry.plans.changeTitle');
    useEffect(() => {
        setBarTitle(barTitle);
        return () => setBarTitle(undefined);
    }, [barTitle, setBarTitle]);
    const key = (name: string) => `subscription.checkout.complete.${name}`;

    if (isLoading || plans.isLoading) return <PageLoader />;
    if (plans.isError) return <LoadError error={plans.error} onRetry={plans.refetch} />;
    if (subscriptions.isError) return <LoadError error={subscriptions.error} onRetry={subscriptions.refetch} />;
    const change = subscription?.pendingChange;
    const target = plans.data?.find(p => p.id === change?.planId);
    if (!subscription || !plan || !change || !target) return <Navigate to={ROUTES.subscription.root} replace />;

    return (
        <section className="mx-auto flex max-w-[600px] flex-col gap-6 pt-6 md:pt-14">
            <ResultHeader
                tone="success"
                title={t(key('downgradeTitle'), { plan: t(`subscription.checkout.planRo.${target.sort}`) })}
                body={t(key('downgradeBody'), {
                    date: formatDate(dayBefore(change.effectiveAt)),
                    plan: t(`subscription.checkout.planEul.${plan.sort}`),
                })}
            />
            <FactRows
                className="rounded-2xl bg-note px-5 py-4 md:px-6 md:py-5"
                rows={[
                    { key: 'effective', label: t(key('effectiveLabel')), value: formatDate(change.effectiveAt) },
                    {
                        key: 'thatDay',
                        label: t(key('thatDayLabel')),
                        value: formatMoney(subscription.nextAmount ?? target.monthly, i18n.language),
                    },
                    { key: 'current', label: t(key('currentLabel')), value: t(key('currentValue')) },
                ]}
            />
            <NoteBox
                className="items-start text-left md:border md:border-line md:bg-white md:p-5"
                title={t(key('chooseClouds.title'))}
            >
                {t(key('chooseClouds.body'), { count: target.maxClouds })}
            </NoteBox>
            <ResultActions>
                <Link to={ROUTES.subscription.detail(subscription.id)} className={primaryLink}>
                    {t(key('toSubscription'))}
                </Link>
            </ResultActions>
        </section>
    );
};
