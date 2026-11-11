import { type JSX, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { ConfirmDialog, PageHeader, PageLoader, PlanCard, StatusBadge, SummaryTile } from '../../components';
import { Badge, Banner, Button, Card, Dialog, useToast } from '../../components/ui';
import {
    useBillingInfo,
    useCancelScheduledChange,
    usePaymentMethods,
    usePlans,
    useSession,
    useSubscription,
} from '../../hooks';
import { isPortError, useSupports, useToday } from '../../lib/port';
import { type SceneAction, type SceneBanner, sceneOf } from '../../lib/sceneOf';
import { useManagementScreens } from '../../lib/screens';
import { chargeCardOf, changeTargetsOf, expiryOf, scheduledChangeDialogOf } from './manageModel';
import { LoadFailure } from './LoadFailure';
import { RecentInvoices } from './RecentInvoices';
import { SceneBannerView } from './SceneBannerView';
import { type ManageFormat, useManageFormat } from './useManageFormat';
import { useResumeFlow } from './useResumeFlow';

import type { SubscriptionPort } from '../../lib/port';
import type { PaymentMethod, Subscription } from '../../types';
import type { TFunction } from 'i18next';

const PILL = 'rounded-full';

/** The actions that call a port method of their own, which the port may have no server for. */
const SERVER_CALL = {
    invoices: 'listInvoices',
    resume: 'resumeSubscription',
    cancelScheduledChange: 'cancelScheduledChange',
} as const satisfies Partial<Record<SceneAction, keyof SubscriptionPort>>;

/** W-18 — one subscription: banner and actions from `sceneOf`, recent invoices. */
export const SubscriptionDetailPage = (): JSX.Element => {
    const { t } = useTranslation();
    const { subscriptionId } = useParams();
    const subscription = useSubscription(subscriptionId);
    const plans = usePlans();
    const fmt = useManageFormat();

    if (subscription.isLoading || plans.isLoading) return <PageLoader />;
    if (!subscription.data || plans.isError) {
        return (
            <LoadFailure
                title={t('subscription.manage.detail.title')}
                error={subscription.error ?? plans.error}
                onRetry={() => {
                    void subscription.refetch();
                    void plans.refetch();
                }}
            />
        );
    }
    return <SubscriptionDetail sub={subscription.data} fmt={fmt} />;
};

const SubscriptionDetail = ({ sub, fmt }: { sub: Subscription; fmt: ManageFormat }): JSX.Element => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const toast = useToast();
    const today = useToday();
    const methods = usePaymentMethods();
    const screens = useManagementScreens();
    // `management` is the card screens: the card tile and a failed payment lead to them.
    const management = screens.cards;
    const billingInfo = useBillingInfo({ enabled: screens.emails });
    const session = useSession();
    const plans = usePlans();
    const cancelChange = useCancelScheduledChange();
    const resume = useResumeFlow(sub, fmt);
    const [dialog, setDialog] = useState<'changePlan' | 'chooseClouds' | 'cancelChange' | 'sameDay' | null>(null);

    const scene = sceneOf(sub, today);
    const { banner } = scene;
    // With the card screens hidden, the buttons that lead to them go with them. An action whose call
    // the port has no server for is left out the same way.
    const supports = useSupports();
    const actions = scene.actions.filter(
        action =>
            (management || (action !== 'paymentMethods' && action !== 'updatePaymentMethod')) &&
            (!(action in SERVER_CALL) || supports(SERVER_CALL[action as keyof typeof SERVER_CALL]))
    );
    const plan = fmt.planOf(sub.planId);
    const target = fmt.planOf(sub.pendingChange?.planId);
    const card = chargeCardOf(sub, methods.data ?? []);
    const bounced = screens.emails
        ? billingInfo.data?.emails.find(email => email.primary && email.status === 'bounced')
        : undefined;
    const changeTargets = plan ? changeTargetsOf(plan, plans.data ?? [], session.data ?? null) : [];

    const close = (next: boolean) => !next && setDialog(null);

    const confirmCancelChange = () =>
        cancelChange.mutate(sub.id, {
            onSuccess: () => {
                setDialog(null);
                toast(t('subscription.manage.dialogs.cancelChange.done'));
            },
            onError: error => {
                setDialog(null);
                // A conflict here means the change is no longer there to cancel (another tab, or it
                // applied); the refetched state shows which. Same-day is caught before the dialog opens.
                if (isPortError(error, 'unauthenticated')) return;
                toast(t(`subscription.common.error.${isPortError(error, 'network') ? 'network' : 'unknown'}`));
            },
        });

    const run = (action: SceneAction) => {
        switch (action) {
            case 'changePlan':
                return setDialog('changePlan');
            case 'paymentMethods':
            case 'updatePaymentMethod':
                return navigate(ROUTES.subscription.paymentMethods);
            case 'invoices':
                return navigate(ROUTES.subscription.history);
            case 'cancel':
                return navigate(ROUTES.subscription.cancel(sub.id));
            case 'resume':
                return resume.request();
            case 'cancelScheduledChange': {
                const next = scheduledChangeDialogOf(sub, today);
                return next && setDialog(next === 'sameDay' ? 'sameDay' : 'cancelChange');
            }
            case 'chooseClouds':
                return setDialog('chooseClouds');
            case 'resubscribe':
                return navigate(ROUTES.subscription.plans);
        }
    };

    const actionLabel = (action: SceneAction): string =>
        action === 'updatePaymentMethod' && banner.kind === 'restricted'
            ? t('subscription.manage.detail.actions.updatePaymentMethodRestricted')
            : t(`subscription.manage.detail.actions.${action}`);

    return (
        <div className="flex max-w-[1072px] flex-col gap-5">
            <PageHeader
                title={t('subscription.manage.detail.title')}
                subtitle={t('subscription.manage.detail.subtitle')}
            />

            {bounced && (
                <Banner
                    tone="warning"
                    title={t('subscription.manage.detail.banner.bounced.title')}
                    action={
                        <Button size="sm" variant="secondary" onClick={() => navigate(ROUTES.subscription.billingInfo)}>
                            {t('subscription.manage.detail.banner.bounced.action')}
                        </Button>
                    }
                >
                    {t('subscription.manage.detail.banner.bounced.body', { address: bounced.address })}
                </Banner>
            )}
            <SceneBannerView sub={sub} banner={banner} card={card} fmt={fmt} />

            {/* A phone reads the four facts as one bordered card in two rows; from `md` they are four tiles. */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-[14px] border border-line p-4 md:grid-cols-4 md:gap-3 md:rounded-none md:border-0 md:p-0">
                <SummaryTile label={t('subscription.manage.detail.tiles.product')} value={fmt.planName(sub.planId)} />
                <SummaryTile
                    label={t('subscription.manage.detail.tiles.status')}
                    value={<StatusBadge subscription={sub} />}
                    className="max-md:gap-2"
                />
                {sceneTiles(sub, banner, card, fmt, t).map(tile => (
                    <SummaryTile
                        key={tile.label}
                        label={tile.label}
                        value={tile.value}
                        className="max-md:border-t max-md:border-line max-md:pt-4"
                    />
                ))}
            </div>

            <div className="flex flex-wrap gap-2 md:gap-[11px]">
                {actions.map((action, index) => (
                    <Button
                        key={action}
                        size="lg"
                        variant={action === 'cancel' ? 'ghost' : index === 0 ? 'primary' : 'secondary'}
                        className={
                            action === 'cancel'
                                ? `${PILL} ml-auto max-md:w-full`
                                : `${PILL} whitespace-nowrap max-md:h-[54px] max-md:min-w-0 max-md:flex-1 max-md:basis-[calc(50%-4px)]`
                        }
                        disabled={action === 'resume' && !resume.ready}
                        onClick={() => run(action)}
                    >
                        {actionLabel(action)}
                    </Button>
                ))}
            </div>

            {banner.kind === 'downgradeScheduled' && plan && target ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <PlanChangeCard
                        tag={<Badge tone="warning">{t('subscription.manage.detail.plans.ending')}</Badge>}
                        name={fmt.planName(plan.id)}
                        lines={[
                            t('subscription.manage.detail.plans.endingLine', { date: fmt.date(banner.date) }),
                            t('subscription.manage.detail.plans.allowance', {
                                count: plan.maxClouds,
                                amount: fmt.money(plan.monthly),
                            }),
                        ]}
                    />
                    <PlanChangeCard
                        tag={<Badge tone="success">{t('subscription.manage.detail.plans.starting')}</Badge>}
                        name={fmt.planName(target.id)}
                        lines={[
                            t('subscription.manage.detail.plans.startingLine', {
                                date: fmt.date(banner.date),
                                amount: fmt.money(target.monthly),
                            }),
                            t('subscription.manage.detail.plans.chooseNote', { count: target.maxClouds }),
                        ]}
                    />
                </div>
            ) : (
                banner.kind !== 'restricted' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {management && (
                            <InfoCard
                                title={t('subscription.manage.detail.paymentCard.title')}
                                line={
                                    card
                                        ? expiryOf(card)
                                            ? t('subscription.manage.detail.paymentCard.line', {
                                                  card: fmt.card(card),
                                                  exp: expiryOf(card),
                                              })
                                            : t('subscription.manage.detail.paymentCard.lineNoExpiry', {
                                                  card: fmt.card(card),
                                              })
                                        : t('subscription.manage.detail.paymentCard.none')
                                }
                                action={t('subscription.manage.detail.paymentCard.manage')}
                                onAction={() => navigate(ROUTES.subscription.paymentMethods)}
                            />
                        )}
                        <InfoCard
                            title={t('subscription.manage.detail.periodCard.title')}
                            line={
                                sub.status === 'trial' && plan
                                    ? t('subscription.manage.detail.periodCard.trialLine', {
                                          date: fmt.date(sub.startedAt),
                                          count: plan.trialDays,
                                      })
                                    : t('subscription.manage.detail.periodCard.line', {
                                          date: fmt.date(sub.startedAt),
                                          day: sub.billingDay,
                                      })
                            }
                            action={
                                supports('listInvoices')
                                    ? t('subscription.manage.detail.periodCard.history')
                                    : undefined
                            }
                            onAction={() => navigate(ROUTES.subscription.history)}
                        />
                    </div>
                )
            )}

            {banner.kind !== 'restricted' && <RecentInvoices sub={sub} fmt={fmt} />}

            {resume.dialogs}
            <Dialog
                open={dialog === 'changePlan'}
                onOpenChange={close}
                className="max-w-[560px]"
                title={t('subscription.manage.dialogs.changePlan.title')}
                description={t('subscription.manage.dialogs.changePlan.description')}
                footer={
                    <Button variant="secondary" onClick={() => setDialog(null)}>
                        {t('subscription.common.actions.close')}
                    </Button>
                }
            >
                {changeTargets.length === 0 ? (
                    <p className="text-sm text-subtitle">{t('subscription.manage.dialogs.changePlan.none')}</p>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {changeTargets.map(({ plan: option, kind }) => (
                            <PlanCard
                                key={option.id}
                                plan={option}
                                tag={
                                    <Badge tone={kind === 'upgrade' ? 'info' : 'neutral'}>
                                        {t(`subscription.manage.dialogs.changePlan.${kind}`)}
                                    </Badge>
                                }
                                onSelect={() =>
                                    navigate(
                                        `${ROUTES.subscription.change}?${new URLSearchParams({ plan: option.id })}`
                                    )
                                }
                            />
                        ))}
                    </div>
                )}
            </Dialog>
            <ConfirmDialog
                open={dialog === 'chooseClouds'}
                onOpenChange={close}
                title={t('subscription.manage.dialogs.chooseClouds.title')}
                description={t('subscription.manage.dialogs.chooseClouds.body', {
                    sort: target?.sort,
                    count: target?.maxClouds,
                })}
            />
            <ConfirmDialog
                open={dialog === 'cancelChange'}
                onOpenChange={close}
                title={t('subscription.manage.dialogs.cancelChange.title')}
                description={t('subscription.manage.dialogs.cancelChange.body', {
                    date: fmt.date(sub.pendingChange?.effectiveAt),
                    sort: plan?.sort,
                    amount: fmt.money(plan?.monthly),
                })}
                cancelLabel={t('subscription.common.actions.close')}
                confirmLabel={t('subscription.manage.dialogs.cancelChange.confirm')}
                onConfirm={confirmCancelChange}
                pending={cancelChange.isPending}
            />
            <ConfirmDialog
                open={dialog === 'sameDay'}
                onOpenChange={close}
                title={t('subscription.manage.dialogs.cancelChangeToday.title')}
                description={t('subscription.manage.dialogs.cancelChangeToday.body', { sort: target?.sort })}
            />
        </div>
    );
};

/**
 * The two right-hand tiles, which change with the scene: the next payment for a subscription in good
 * standing, the restriction date and the overdue amount when a payment failed.
 */
const sceneTiles = (
    sub: Subscription,
    banner: SceneBanner,
    card: PaymentMethod | undefined,
    fmt: ManageFormat,
    t: TFunction
): Array<{ label: string; value: ReactNode }> => {
    const key = 'subscription.manage.detail.tiles';
    switch (banner.kind) {
        case 'pastDue':
            return [
                sub.retryAt?.length
                    ? { label: t(`${key}.retry`), value: t(`${key}.retryValue`, { dates: fmt.days(sub.retryAt) }) }
                    : { label: t(`${key}.restrictAt`), value: fmt.date(banner.date) },
                { label: t(`${key}.nextAmount`), value: t(`${key}.unpaid`, { amount: fmt.money(sub.nextAmount) }) },
            ];
        case 'restricted':
            return [
                { label: t(`${key}.overdue`), value: fmt.money(sub.nextAmount) },
                { label: t(`${key}.card`), value: card ? fmt.card(card) : fmt.date(undefined) },
            ];
        case 'downgradeScheduled':
            return [
                { label: t(`${key}.nextBilling`), value: fmt.date(sub.nextBillingAt) },
                {
                    label: t(`${key}.nextAmount`),
                    value: t(`${key}.afterChange`, {
                        amount: fmt.money(banner.amount),
                        sort: fmt.planOf(banner.planId)?.sort,
                    }),
                },
            ];
        default:
            return [
                { label: t(`${key}.nextBilling`), value: fmt.date(sub.nextBillingAt) },
                {
                    label: t(`${key}.nextAmount`),
                    value: banner.kind === 'cancelScheduled' ? t(`${key}.noCharge`) : fmt.money(sub.nextAmount),
                },
            ];
    }
};

const InfoCard = ({
    title,
    line,
    action,
    onAction,
}: {
    title: string;
    line: string;
    /** Left out, the card has no button. */
    action?: string;
    onAction: () => void;
}): JSX.Element => (
    <Card className="flex flex-col items-start gap-2 rounded-[14px] border-line p-4 md:gap-2.5 md:rounded-2xl md:px-[21px] md:py-[19px]">
        <h2 className="text-sm font-bold leading-normal text-ink">{title}</h2>
        <p className="text-[13px] font-medium leading-normal text-mute">{line}</p>
        {action && (
            <Button size="sm" variant="secondary" className="max-md:h-10 max-md:px-4 max-md:text-sm" onClick={onAction}>
                {action}
            </Button>
        )}
    </Card>
);

const PlanChangeCard = ({ tag, name, lines }: { tag: ReactNode; name: string; lines: string[] }): JSX.Element => (
    <Card className="flex flex-col items-start gap-2 px-6 py-5">
        {tag}
        <h2 className="mt-2 text-xl font-semibold text-navy">{name}</h2>
        {lines.map(line => (
            <p key={line} className="text-[13px] text-subtitle">
                {line}
            </p>
        ))}
    </Card>
);
