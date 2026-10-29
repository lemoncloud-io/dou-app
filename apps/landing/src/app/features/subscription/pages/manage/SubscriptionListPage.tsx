import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { PageLoader, StatusBadge, SummaryTile } from '../../components';
import { Badge, Banner, Button, Card } from '../../components/ui';
import { usePaymentMethods, usePlans, useSubscriptions } from '../../hooks';
import { isPortError, useToday } from '../../lib/port';
import { sceneOf } from '../../lib/sceneOf';
import { chargeCardOf, endedOn, listCardOf, splitSubscriptions } from './manageModel';
import { type ManageFormat, useManageFormat } from './useManageFormat';

import type { SceneBanner } from '../../lib/sceneOf';
import type { Subscription } from '../../types';
import type { TFunction } from 'i18next';

/** W-10 — current and ended subscriptions, or the empty state. */
export const SubscriptionListPage = (): JSX.Element => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const subscriptions = useSubscriptions();
    const plans = usePlans();
    const fmt = useManageFormat();

    if (subscriptions.isLoading || plans.isLoading) return <PageLoader />;

    const { live, ended } = splitSubscriptions(subscriptions.data ?? []);

    return (
        <div className="flex max-w-[1072px] flex-col gap-5">
            <header className="mb-2 flex flex-col gap-2">
                <h1 className="text-[28px] font-bold text-navy">{t('subscription.manage.list.title')}</h1>
                {(live || ended.length > 0) && (
                    <p className="text-sm text-subtitle">{t('subscription.manage.list.subtitle')}</p>
                )}
            </header>

            {subscriptions.isError ? (
                <Banner
                    tone="danger"
                    title={t(
                        `subscription.common.error.${isPortError(subscriptions.error, 'network') ? 'network' : 'unknown'}`
                    )}
                    action={
                        <Button size="sm" variant="secondary" onClick={() => subscriptions.refetch()}>
                            {t('subscription.common.actions.retry')}
                        </Button>
                    }
                />
            ) : live ? (
                <LiveCard sub={live} fmt={fmt} />
            ) : (
                <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
                    <h2 className="text-lg font-semibold text-navy">{t('subscription.manage.list.empty.title')}</h2>
                    <p className="text-[13px] text-subtitle">{t('subscription.manage.list.empty.body')}</p>
                    <Button className="rounded-full px-7" onClick={() => navigate(ROUTES.subscription.plans)}>
                        {t('subscription.manage.list.empty.subscribe')}
                    </Button>
                </Card>
            )}

            {ended.length > 0 && (
                <section className="mt-3 flex flex-col gap-3">
                    <h2 className="text-sm font-semibold text-navy">{t('subscription.manage.list.ended')}</h2>
                    {ended.map(sub => (
                        <Link
                            key={sub.id}
                            to={ROUTES.subscription.detail(sub.id)}
                            className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/50 px-6 py-5 transition-colors hover:border-navy/30"
                        >
                            <span className="flex items-center gap-3">
                                <span className="text-lg font-semibold text-subtitle">{fmt.planName(sub.planId)}</span>
                                <StatusBadge subscription={sub} />
                            </span>
                            <span className="text-[13px] text-subtitle">
                                {sub.endedReason
                                    ? t('subscription.manage.list.endedLineWithReason', {
                                          from: fmt.date(sub.startedAt),
                                          to: fmt.date(endedOn(sub)),
                                          reason: t(`subscription.manage.list.endedReason.${sub.endedReason}`),
                                      })
                                    : t('subscription.manage.list.endedLine', {
                                          from: fmt.date(sub.startedAt),
                                          to: fmt.date(endedOn(sub)),
                                      })}
                            </span>
                        </Link>
                    ))}
                </section>
            )}
        </div>
    );
};

/**
 * The subscription in force. In good standing it is the full card with its facts; in any other
 * scene it is one line saying what needs attention, and the detail screen does the rest.
 */
const LiveCard = ({ sub, fmt }: { sub: Subscription; fmt: ManageFormat }): JSX.Element => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const today = useToday();
    const methods = usePaymentMethods();
    const { banner } = sceneOf(sub, today);
    const plan = fmt.planOf(sub.planId);
    const card = chargeCardOf(sub, methods.data ?? []);
    const toDetail = () => navigate(ROUTES.subscription.detail(sub.id));

    if (listCardOf(banner) === 'summary') {
        return (
            <Card className="flex flex-col items-start gap-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold text-navy">{fmt.planName(sub.planId)}</h2>
                    <StatusBadge subscription={sub} />
                    <Badge tone="neutral">{t('subscription.manage.list.source')}</Badge>
                </div>
                <div className="grid w-full grid-cols-2 gap-3 lg:grid-cols-4">
                    <SummaryTile
                        label={t('subscription.manage.list.clouds')}
                        value={
                            plan
                                ? t('subscription.manage.list.cloudsValue', { count: plan.maxClouds })
                                : t('subscription.manage.none')
                        }
                    />
                    <SummaryTile
                        label={t('subscription.manage.list.nextBilling')}
                        value={fmt.date(sub.nextBillingAt)}
                    />
                    <SummaryTile label={t('subscription.manage.list.nextAmount')} value={fmt.money(sub.nextAmount)} />
                    <SummaryTile
                        label={t('subscription.manage.list.paymentMethod')}
                        value={card ? fmt.card(card) : t('subscription.manage.none')}
                    />
                </div>
                <Button size="sm" variant="secondary" onClick={toDetail}>
                    {t('subscription.manage.list.viewDetail')}
                </Button>
            </Card>
        );
    }

    const target = banner.kind === 'downgradeScheduled' ? fmt.planOf(banner.planId) : undefined;
    return (
        <Card className="flex items-center justify-between gap-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-navy">
                        {plan && target
                            ? t('subscription.manage.list.downgradeTitle', { from: plan.sort, to: target.sort })
                            : fmt.planName(sub.planId)}
                    </h2>
                    <StatusBadge subscription={sub} />
                </div>
                <p className="text-[13px] text-subtitle">{statusLine(sub, banner, fmt, t)}</p>
            </div>
            <Button size="lg" variant="secondary" className="shrink-0 rounded-full" onClick={toDetail}>
                {t('subscription.manage.list.detail')}
            </Button>
        </Card>
    );
};

const statusLine = (sub: Subscription, banner: SceneBanner, fmt: ManageFormat, t: TFunction): string => {
    const key = 'subscription.manage.list.status';
    switch (banner.kind) {
        case 'trial':
            return t(`${key}.trial`, {
                date: fmt.date(banner.date),
                chargeAt: fmt.date(banner.chargeAt),
                amount: fmt.money(banner.amount),
            });
        case 'pastDue':
            return t(`${key}.pastDue`, {
                amount: fmt.money(sub.nextAmount),
                date: fmt.date(banner.date),
                dday: fmt.dday(banner.dday),
            });
        case 'restricted':
            return t(`${key}.restricted`, { amount: fmt.money(sub.nextAmount), date: fmt.date(banner.date) });
        case 'cancelScheduled':
            return t(`${key}.cancelScheduled`, { date: fmt.date(banner.date) });
        case 'downgradeScheduled':
            return t(`${key}.downgradeScheduled`, {
                date: fmt.date(banner.date),
                to: fmt.planOf(banner.planId)?.sort,
                amount: fmt.money(banner.amount),
            });
        default:
            return '';
    }
};
