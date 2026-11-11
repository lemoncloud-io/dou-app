import { type JSX, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { PageLoader, SummaryTile } from '../../components';
import { Banner, Button } from '../../components/ui';
import { useChangePlan, usePaymentMethods, usePlans, usePreviewChange } from '../../hooks';
import { ddayOf } from '../../lib/ddayOf';
import { defaultCardOf } from '../../lib/paymentMethods';
import { isPortError, useSupports, useToday } from '../../lib/port';
import { useManagementScreens } from '../../lib/screens';
import { cn, formatDate, formatMoney } from '../../utils';
import { DOWNGRADE_COMPLETE_URL, checkoutUrl, formatShortDate, statusUrl } from './flow';
import { CheckoutLayout, FactRows, LoadError, primaryLink, secondaryLink } from './parts';
import { usePlanRoute } from './usePlanRoute';

import type { ChangePreview, Money, Plan, Subscription } from '../../types';

const errorKeyOf = (error: unknown): string => {
    if (isPortError(error, 'conflict')) return 'subscription.checkout.change.error.conflict';
    if (isPortError(error, 'network')) return 'subscription.common.error.network';
    return 'subscription.common.error.unknown';
};

/**
 * W-14 — confirms a change to the plan directly above or below (`?plan=`). An upgrade is charged the
 * difference today and followed on W-09; a downgrade is scheduled for the next renewal and confirmed
 * on W-06. A subscription whose renewal failed cannot change until it is paid, so it is pointed at
 * the payment methods instead.
 */
export const ChangePlanPage = (): JSX.Element => {
    const { t } = useTranslation();
    const { loading, error, retry, target, subscription, route } = usePlanRoute();
    // An ending subscription has no next period to change; it is resumed first, on its own page. Read
    // from its status rather than from the preview's refusal, which could have other causes.
    const ending = subscription?.status === 'cancelScheduled';
    // Where a cancellation cannot be undone, the notice does not send the reader to undo it.
    const resumable = useSupports()('resumeSubscription');
    const preview = usePreviewChange(route === 'change' && !ending ? target?.id : undefined);

    if (loading) return <PageLoader />;
    if (error) return <LoadError error={error} onRetry={retry} />;
    if (!target) return <Navigate to={ROUTES.subscription.plans} replace />;
    if (route === 'checkout') return <Navigate to={checkoutUrl(target.id)} replace />;
    if (route === 'plans') return <Navigate to={ROUTES.subscription.plans} replace />;

    if (ending && subscription) {
        return (
            <Banner
                tone="warning"
                title={t('subscription.checkout.change.ending.title')}
                action={
                    <Link to={ROUTES.subscription.detail(subscription.id)} className="text-sm font-semibold underline">
                        {t('subscription.checkout.change.ending.action')}
                    </Link>
                }
            >
                {t(`subscription.checkout.change.ending.${resumable ? 'body' : 'bodyNoUndo'}`)}
            </Banner>
        );
    }
    if (preview.isError) return <LoadError error={preview.error} onRetry={preview.refetch} />;
    if (!preview.data || !subscription) return <PageLoader />;

    if (preview.data.blocked === 'pastDue') return <PastDue preview={preview.data} subscription={subscription} />;
    if (preview.data.blocked === 'notAdjacent') return <Navigate to={ROUTES.subscription.plans} replace />;
    if (preview.data.blocked === 'trialUpgrade') {
        return (
            <Banner
                tone="warning"
                title={t('subscription.checkout.change.trialUpgrade.title')}
                action={
                    <Link to={ROUTES.subscription.detail(subscription.id)} className="text-sm font-semibold underline">
                        {t('subscription.checkout.change.trialUpgrade.action')}
                    </Link>
                }
            >
                {t('subscription.checkout.change.trialUpgrade.body')}
            </Banner>
        );
    }
    return <ChangeConfirm preview={preview.data} subscription={subscription} />;
};

/** The "now → after" pair of plan cards at the top of an upgrade or a downgrade. */
const PlanPair = ({ from, to }: { from: Plan; to: Plan }): JSX.Element => {
    const { t, i18n } = useTranslation();
    const card = (plan: Plan, label: string, highlighted: boolean) => (
        <div
            className={cn(
                'flex min-w-0 flex-1 flex-col gap-1 rounded-2xl px-4 py-3.5 md:px-5 md:py-4',
                highlighted ? 'border-2 border-main-green bg-[#f5ffe5]' : 'bg-note'
            )}
        >
            <span className="text-[11px] font-medium text-mute">{label}</span>
            <span className="text-base font-bold text-ink md:text-lg md:font-semibold">
                {t('subscription.common.planName', { sort: plan.sort })}
            </span>
            <span className="text-[13px] font-medium text-[#666b78] md:text-sm">
                {t('subscription.checkout.perMonth', { price: formatMoney(plan.monthly, i18n.language) })}
            </span>
        </div>
    );
    return (
        <div className="flex items-center gap-2 md:gap-4">
            {card(from, t('subscription.checkout.change.now'), false)}
            <span aria-hidden className="text-xl text-mute">
                →
            </span>
            {card(to, t('subscription.checkout.change.after'), true)}
        </div>
    );
};

const Aside = ({ title, children }: { title: string; children: ReactNode }): JSX.Element => (
    <aside className="flex flex-col gap-3 self-start rounded-2xl bg-note px-5 py-4 md:px-6 md:py-5">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        <div className="text-[13px] font-medium leading-[1.6] text-[#666b78]">{children}</div>
    </aside>
);

const ChangeConfirm = ({
    preview,
    subscription,
}: {
    preview: ChangePreview;
    subscription: Subscription;
}): JSX.Element => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const methods = usePaymentMethods();
    const plans = usePlans();
    const changePlan = useChangePlan();
    const [error, setError] = useState<string>();
    const money = (amount: Money) => formatMoney(amount, i18n.language);
    const key = (name: string) => `subscription.checkout.change.${name}`;
    const { kind, from, to } = preview;
    const card = methods.data && defaultCardOf(methods.data, subscription.provider);
    const pending = subscription.pendingChange;
    const pendingPlan = plans.data?.find(plan => plan.id === pending?.planId);
    const sameDay = preview.blocked === 'sameDayAsChange';
    const charge = preview.amountToday && preview.amountToday.amount > 0 ? preview.amountToday : undefined;

    const onConfirm = () => {
        setError(undefined);
        changePlan.mutate(to.id, {
            onSuccess: result => {
                if ('scheduled' in result) navigate(DOWNGRADE_COMPLETE_URL);
                else navigate(statusUrl(result.id, to.id));
            },
            onError: err => {
                if (!isPortError(err, 'unauthenticated')) setError(errorKeyOf(err));
            },
        });
    };

    const cancelLink = (
        <Link to={ROUTES.subscription.detail(subscription.id)} className={secondaryLink}>
            {t('subscription.common.actions.cancel')}
        </Link>
    );

    return (
        <CheckoutLayout
            summaryLast
            summary={
                kind === 'upgrade' ? (
                    <Aside title={t(key('upgrade.asideTitle'))}>
                        <ul className="list-disc pl-4">
                            <li>{t(key('upgrade.asideClouds'), { count: to.maxClouds })}</li>
                            <li>{t(key('upgrade.asideApp'))}</li>
                            <li>{t(key('upgrade.asideFailure'))}</li>
                        </ul>
                    </Aside>
                ) : (
                    <Aside title={t(key('downgrade.asideTitle'))}>{t(key('downgrade.asideBody'))}</Aside>
                )
            }
            head={
                <>
                    <header className="flex flex-col gap-2">
                        <h1 className="text-[22px] font-bold leading-[1.5] text-ink md:text-[28px]">
                            {t(key(`${kind}.title`))}
                        </h1>
                        <p className="text-sm font-medium leading-[1.5] text-mute md:text-[15px]">
                            {kind === 'upgrade'
                                ? t(key(charge ? 'upgrade.subtitlePaid' : 'upgrade.subtitleFree'), {
                                      plan: t(`subscription.checkout.planEul.${to.sort}`),
                                  })
                                : t(key('downgrade.subtitle'), { plan: t(`subscription.checkout.planRo.${to.sort}`) })}
                        </p>
                    </header>
                    <PlanPair from={from} to={to} />
                </>
            }
        >
            {kind === 'upgrade' && pending && pendingPlan && (
                <Banner
                    tone="warning"
                    title={t(key('upgrade.pendingTitle'), {
                        plan: t('subscription.common.planName', { sort: pendingPlan.sort }),
                    })}
                >
                    {t(key('upgrade.pendingBody'), {
                        date: formatShortDate(pending.effectiveAt),
                        plan: t(`subscription.checkout.planEul.${to.sort}`),
                    })}
                </Banner>
            )}
            {sameDay && <Banner tone="warning" title={t(key('sameDay'))} />}

            <FactRows
                className="rounded-2xl border border-line px-5 py-4 md:px-6 md:py-5"
                rows={
                    kind === 'upgrade'
                        ? [
                              {
                                  key: 'today',
                                  label: t(key('upgrade.todayLabel')),
                                  value: money(preview.amountToday ?? { ...to.monthly, amount: 0 }),
                                  strong: true,
                              },
                              {
                                  key: 'card',
                                  label: t(key('upgrade.cardLabel')),
                                  value: card
                                      ? t(key('upgrade.cardValue'), { brand: card.brand, last4: card.last4 })
                                      : '—',
                              },
                              {
                                  key: 'nextDate',
                                  label: t(key('upgrade.nextDateLabel')),
                                  value: subscription.nextBillingAt
                                      ? t(key('upgrade.nextDateValue'), {
                                            date: formatDate(subscription.nextBillingAt),
                                        })
                                      : '—',
                              },
                              {
                                  key: 'nextAmount',
                                  label: t(key('upgrade.nextAmountLabel')),
                                  value: t('subscription.checkout.perMonth', {
                                      price: money(preview.nextAmount),
                                  }),
                              },
                          ]
                        : [
                              {
                                  key: 'effective',
                                  label: t(key('downgrade.effectiveLabel')),
                                  value: formatDate(preview.effectiveAt),
                              },
                              {
                                  key: 'thatDay',
                                  label: t(key('downgrade.thatDayLabel')),
                                  value: money(preview.nextAmount),
                                  strong: true,
                              },
                              {
                                  key: 'until',
                                  label: t(key('downgrade.untilLabel')),
                                  value: t(key('downgrade.untilValue'), {
                                      plan: t('subscription.common.planName', { sort: from.sort }),
                                  }),
                              },
                              {
                                  key: 'today',
                                  label: t(key('downgrade.todayLabel')),
                                  value: t(key('downgrade.todayValue')),
                              },
                          ]
                }
            />

            {kind === 'upgrade' && charge && (
                <p className="text-xs font-medium leading-normal text-mute md:text-[13px]">
                    {t(key('upgrade.prorationNote'))}
                </p>
            )}
            {kind === 'downgrade' && (
                <Banner
                    tone="warning"
                    title={t(key('downgrade.keepTitle'), { from: from.maxClouds, to: to.maxClouds })}
                >
                    {t(key('downgrade.keepBody'))}
                </Banner>
            )}
            {error && <Banner tone="danger" title={t(error)} />}

            <div className="flex flex-col gap-3 md:flex-row">
                {cancelLink}
                <Button
                    size="lg"
                    className="max-md:h-[54px]"
                    disabled={sameDay || changePlan.isPending}
                    onClick={onConfirm}
                >
                    {kind === 'downgrade'
                        ? t(key('downgrade.cta'))
                        : pending
                          ? t(key(charge ? 'upgrade.ctaPendingPaid' : 'upgrade.ctaPendingFree'), {
                                price: charge && money(charge),
                            })
                          : t(key(charge ? 'upgrade.ctaPaid' : 'upgrade.ctaFree'), {
                                price: charge && money(charge),
                            })}
                </Button>
            </div>
        </CheckoutLayout>
    );
};

const PastDue = ({ preview, subscription }: { preview: ChangePreview; subscription: Subscription }): JSX.Element => {
    const { t, i18n } = useTranslation();
    const today = useToday();
    const { cards } = useManagementScreens();
    const key = (name: string) => `subscription.checkout.change.pastDue.${name}`;
    const { from, to } = preview;
    const owed = formatMoney(subscription.nextAmount ?? from.monthly, i18n.language);
    const dday = subscription.restrictAt ? ddayOf(subscription.restrictAt, today) : undefined;

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-2">
                <h1 className="text-[28px] font-bold text-navy">{t(key('title'))}</h1>
                <p className="text-[15px] text-subtitle">
                    {t(key('route'), {
                        from: t('subscription.common.planName', { sort: from.sort }),
                        to: t('subscription.common.planName', { sort: to.sort }),
                    })}
                </p>
            </header>
            <Banner tone="danger" title={t(key('bannerTitle'))}>
                {subscription.failedAt
                    ? t(key('bannerBody'), { date: formatDate(subscription.failedAt), price: owed })
                    : t(key('bannerBodyNoDate'))}
            </Banner>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryTile
                    label={t(key('now'))}
                    value={t(key('nowValue'), {
                        plan: t('subscription.common.planName', { sort: from.sort }),
                        status: t(`subscription.common.status.${subscription.status}`),
                    })}
                />
                <SummaryTile label={t(key('owed'))} value={owed} />
                <SummaryTile
                    label={t(key('restrict'))}
                    value={
                        subscription.restrictAt
                            ? dday !== undefined && dday > 0
                                ? t(key('restrictDday'), { date: formatDate(subscription.restrictAt), days: dday })
                                : formatDate(subscription.restrictAt)
                            : '—'
                    }
                />
            </div>
            <div className="flex flex-wrap gap-3">
                {cards && (
                    <Link to={ROUTES.subscription.paymentMethods} className={primaryLink}>
                        {t(key('manageCards'))}
                    </Link>
                )}
                <Link to={ROUTES.subscription.detail(subscription.id)} className={secondaryLink}>
                    {t(key('back'))}
                </Link>
            </div>
            <div>
                <Button size="lg" variant="secondary" className="rounded-full" disabled>
                    {t(key(`disabled.${preview.kind}`))}
                </Button>
            </div>
        </div>
    );
};
