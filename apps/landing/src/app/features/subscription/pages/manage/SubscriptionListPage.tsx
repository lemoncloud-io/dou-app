import { type JSX, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { PageHeader, PageLoader, StatusBadge } from '../../components';
import { Banner, Button, Card } from '../../components/ui';
import { usePaymentMethods, usePlans, useSubscriptions } from '../../hooks';
import { isPortError, useToday } from '../../lib/port';
import { sceneOf } from '../../lib/sceneOf';
import { cn } from '../../utils';
import { chargeCardOf, endedOn, monthDay, splitSubscriptions } from './manageModel';
import { type ManageFormat, useManageFormat } from './useManageFormat';

import type { SceneBanner } from '../../lib/sceneOf';
import type { Subscription } from '../../types';
import type { TFunction } from 'i18next';

// The columns of a row from `md`; below it a row is one stacked block. The last track is the chevron.
const COLUMNS = 'md:grid-cols-[300px_170px_110px_180px_minmax(0,1fr)_16px]';

/** W-10 — current and ended subscriptions as two lists, or the empty state. */
export const SubscriptionListPage = (): JSX.Element => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const subscriptions = useSubscriptions();
    const plans = usePlans();
    const fmt = useManageFormat();

    if (subscriptions.isLoading || plans.isLoading) return <PageLoader />;

    const { live, ended } = splitSubscriptions(subscriptions.data ?? []);

    return (
        <div className="flex max-w-[1072px] flex-col gap-6 md:gap-10">
            <PageHeader
                title={t('subscription.manage.list.title')}
                subtitle={(live || ended.length > 0) && t('subscription.manage.list.subtitle')}
            />

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
                <SubscriptionList title={t('subscription.manage.list.live')} lastColumn="next">
                    <LiveRow sub={live} fmt={fmt} />
                </SubscriptionList>
            ) : (
                <Card className="flex flex-col items-center gap-3 rounded-2xl border-line px-6 py-12 text-center md:py-14">
                    <h2 className="text-base font-bold text-ink md:text-lg">
                        {t('subscription.manage.list.empty.title')}
                    </h2>
                    <p className="text-[13px] font-medium text-mute">{t('subscription.manage.list.empty.body')}</p>
                    <Button className="mt-2 px-7" onClick={() => navigate(ROUTES.subscription.plans)}>
                        {t('subscription.manage.list.empty.subscribe')}
                    </Button>
                </Card>
            )}

            {ended.length > 0 && (
                <SubscriptionList title={t('subscription.manage.list.ended')} lastColumn="end">
                    {ended.map(sub => (
                        <EndedRow key={sub.id} sub={sub} fmt={fmt} />
                    ))}
                </SubscriptionList>
            )}
        </div>
    );
};

/** A titled list: a column header from `md`, then the rows, each a link to its subscription. */
const SubscriptionList = ({
    title,
    lastColumn,
    children,
}: {
    title: string;
    lastColumn: 'next' | 'end';
    children: ReactNode;
}): JSX.Element => {
    const { t } = useTranslation();
    const head = (key: string) => <span>{t(`subscription.manage.list.columns.${key}`)}</span>;
    return (
        <section className="flex flex-col gap-4 md:gap-5">
            <h2 className="text-sm font-bold text-ink">{title}</h2>
            <div className="overflow-hidden rounded-2xl border border-line bg-white">
                <div
                    className={cn(
                        'hidden grid-cols-[300px_170px_110px_180px_minmax(0,1fr)_16px] items-center bg-[#f8f8f9] px-6 py-3 text-xs font-medium text-mute md:grid'
                    )}
                >
                    {head('product')}
                    {head('status')}
                    {head('clouds')}
                    {head('amount')}
                    {head(lastColumn)}
                    <span />
                </div>
                {children}
            </div>
        </section>
    );
};

/** What a row says, in the words of its scene: the figures are the port's, the lines are `sceneOf`'s. */
interface RowModel {
    name: string;
    shortName: string;
    clouds: string;
    amount: string;
    dateTitle: string;
    dateNote: string;
    /** `danger` reddens the date line; `muted` greys the whole row (an ended subscription). */
    tone: 'normal' | 'danger' | 'muted';
}

const rowFigures = (sub: Subscription, banner: SceneBanner | undefined, fmt: ManageFormat, t: TFunction) => {
    const plan = fmt.planOf(sub.planId);
    const target = banner?.kind === 'downgradeScheduled' ? fmt.planOf(banner.planId) : undefined;
    const clouds = (count?: number) => t('subscription.manage.list.cloudsValue', { count });
    return {
        name:
            plan && target
                ? t('subscription.manage.list.downgradeTitle', { from: plan.sort, to: target.sort })
                : fmt.planName(sub.planId),
        shortName:
            plan && target
                ? t('subscription.manage.list.downgradeTitleShort', { from: plan.sort, to: target.sort })
                : fmt.planName(sub.planId),
        clouds:
            plan && target
                ? t('subscription.manage.list.row.cloudsChange', { from: plan.maxClouds, to: target.maxClouds })
                : plan
                  ? clouds(plan.maxClouds)
                  : t('subscription.manage.none'),
        amount:
            plan && target
                ? t('subscription.manage.list.row.amountChange', {
                      from: fmt.money(plan.monthly),
                      to: fmt.money(target.monthly),
                  })
                : t('subscription.manage.list.row.amount', { amount: fmt.money(plan?.monthly) }),
    };
};

const liveModel = (sub: Subscription, banner: SceneBanner, fmt: ManageFormat, t: TFunction): RowModel => {
    const key = 'subscription.manage.list.row';
    const base = { ...rowFigures(sub, banner, fmt, t), tone: 'normal' as const };
    switch (banner.kind) {
        case 'trial':
            return {
                ...base,
                dateTitle: t(`${key}.trialEnds`, { date: fmt.date(banner.date) }),
                dateNote: t(`${key}.trialThen`, {
                    date: banner.chargeAt ? monthDay(banner.chargeAt) : fmt.date(undefined),
                    amount: fmt.money(banner.amount),
                }),
            };
        case 'pastDue':
            return {
                ...base,
                tone: 'danger',
                dateTitle: t(`${key}.restrictAtDday`, { date: fmt.date(banner.date), dday: fmt.dday(banner.dday) }),
                dateNote: t(`${key}.checkPayment`),
            };
        case 'restricted':
            return {
                ...base,
                tone: 'danger',
                dateTitle: t(`${key}.restrictAt`, { date: fmt.date(banner.date) }),
                dateNote: t(`${key}.checkPayment`),
            };
        case 'cancelScheduled':
            return {
                ...base,
                dateTitle: t(`${key}.endsAt`, { date: fmt.date(banner.date), dday: fmt.dday(banner.dday) }),
                dateNote: t(`${key}.autoStopped`),
            };
        case 'downgradeScheduled':
            return {
                ...base,
                dateTitle: t(`${key}.changesAt`, { date: fmt.date(banner.date) }),
                dateNote: t(`${key}.changeCharge`, { amount: fmt.money(banner.amount) }),
            };
        case 'restored':
            return {
                ...base,
                dateTitle: t(`${key}.nextBilling`, { date: fmt.date(sub.nextBillingAt) }),
                dateNote: t(`${key}.restoredNote`),
            };
        default:
            return {
                ...base,
                dateTitle: t(`${key}.nextBilling`, { date: fmt.date(sub.nextBillingAt) }),
                dateNote: t(`${key}.autoCharge`, { amount: fmt.money(sub.nextAmount) }),
            };
    }
};

const LiveRow = ({ sub, fmt }: { sub: Subscription; fmt: ManageFormat }): JSX.Element => {
    const { t } = useTranslation();
    const today = useToday();
    const methods = usePaymentMethods();
    const { banner } = sceneOf(sub, today);
    const card = chargeCardOf(sub, methods.data ?? []);
    const row = liveModel(sub, banner, fmt, t);
    const source = card
        ? t('subscription.manage.list.row.sourceCard', { card: fmt.card(card) })
        : t('subscription.manage.list.row.source');
    return <Row sub={sub} row={row} source={source} />;
};

const EndedRow = ({ sub, fmt }: { sub: Subscription; fmt: ManageFormat }): JSX.Element => {
    const { t } = useTranslation();
    const key = 'subscription.manage.list.row';
    const row: RowModel = {
        ...rowFigures(sub, undefined, fmt, t),
        tone: 'muted',
        dateTitle: t(`${key}.endedOn`, { date: fmt.date(endedOn(sub)) }),
        dateNote: sub.endedReason
            ? t(`${key}.startedOnWithReason`, {
                  date: fmt.date(sub.startedAt),
                  reason: t(`subscription.manage.list.endedReason.${sub.endedReason}`),
              })
            : t(`${key}.startedOn`, { date: fmt.date(sub.startedAt) }),
    };
    return <Row sub={sub} row={row} source={t(`${key}.source`)} />;
};

/**
 * One subscription, a link to its page. From `md` a line of columns; on a phone a block — name and
 * status, then clouds and price, then the date and its note. The two layouts are separate blocks of
 * the same row, the one not in use hidden.
 */
const Row = ({ sub, row, source }: { sub: Subscription; row: RowModel; source: string }): JSX.Element => {
    const { t } = useTranslation();
    const muted = row.tone === 'muted';
    const secondary = 'text-mute';
    return (
        <Link
            to={ROUTES.subscription.detail(sub.id)}
            className="block border-t border-line px-4 py-3.5 transition-colors first:border-t-0 hover:bg-note md:px-6 md:py-4"
        >
            <div className={cn('hidden items-center md:grid', COLUMNS)}>
                <div className="flex flex-col gap-1 pr-4">
                    <span className={cn('text-[15px] font-semibold text-ink', muted && secondary)}>{row.name}</span>
                    <span className="text-xs font-medium text-mute">{source}</span>
                </div>
                <div>
                    <StatusBadge subscription={sub} />
                </div>
                <span className={cn('text-sm font-medium text-ink', muted && secondary)}>{row.clouds}</span>
                <span className={cn('text-sm font-medium text-ink', muted && secondary)}>{row.amount}</span>
                <div className="flex min-w-0 flex-col gap-1">
                    <span
                        className={cn(
                            'text-sm font-medium text-ink',
                            row.tone === 'danger' && 'text-[#c1292e]',
                            muted && secondary
                        )}
                    >
                        {row.dateTitle}
                    </span>
                    <span className="text-xs font-medium text-mute">{row.dateNote}</span>
                </div>
                <Chevron />
            </div>

            <div className="flex items-center gap-2 md:hidden">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <span className={cn('truncate text-[15px] font-semibold text-ink', muted && secondary)}>
                            {row.shortName}
                        </span>
                        <StatusBadge subscription={sub} className="shrink-0 py-[3px]" />
                    </div>
                    <span className="text-[13px] font-medium text-mute">
                        {t('subscription.manage.list.row.cloudsLine', { clouds: row.clouds, amount: row.amount })}
                    </span>
                    <span
                        className={cn(
                            'text-[13px] font-semibold text-ink',
                            row.tone === 'danger' && 'text-[#c1292e]',
                            muted && secondary
                        )}
                    >
                        {row.dateTitle}
                    </span>
                    <span className="text-xs font-medium text-mute">
                        {muted ? `${source} · ${row.dateNote}` : row.dateNote}
                    </span>
                </div>
                <Chevron />
            </div>
        </Link>
    );
};

const Chevron = (): JSX.Element => (
    <span aria-hidden className="text-xl leading-none text-[#b4b6bc]">
        ›
    </span>
);
