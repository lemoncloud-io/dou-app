import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { storeUrls } from '../../../../config/links';
import { ROUTES } from '../../../../routes/paths';
import { PageLoader, PlanCard } from '../../components';
import { Badge, type BadgeTone, Banner, Button } from '../../components/ui';
import {
    useCurrentSubscription,
    useForeignBilling,
    usePlans,
    usePreviewCheckout,
    useSession,
    useSubscriptions,
} from '../../hooks';
import { currencyOfLanguage } from '../../lib/billingCountry';
import { ENTRY_PLAN_SORT } from '../../lib/changeKindOf';
import { useToday } from '../../lib/port';
import { sceneOf } from '../../lib/sceneOf';
import { formatMoney } from '../../utils';
import { type PlanChoice, type PlanTag, planChoicesOf } from './planChoices';
import { commonErrorKey } from '../../lib/errorKey';

import type { Plan, Subscription } from '../../types';

const TAG_TONES: Record<PlanTag, BadgeTone> = {
    firstTrial: 'navy',
    trialUsed: 'neutral',
    afterSubscribe: 'neutral',
    current: 'navy',
    upgrade: 'neutral',
    downgrade: 'neutral',
    adjacentOnly: 'neutral',
};

const TAG_CLASSES: Partial<Record<PlanTag, string>> = { upgrade: 'bg-main-green text-navy' };

const changePath = (plan: Plan) => `${ROUTES.subscription.change}?${new URLSearchParams({ plan: plan.id })}`;
const checkoutPath = (plan: Plan) => `${ROUTES.subscription.checkout}?${new URLSearchParams({ plan: plan.id })}`;

export const PlansPage = ({ account = true }: { account?: boolean }): JSX.Element => {
    const session = useSession();
    if (session.isLoading) return <PageLoader />;
    return account && session.data ? <SignedInPlans /> : <PlansScene signedIn={false} canBuy={account} />;
};

const SignedInPlans = (): JSX.Element => {
    const { t } = useTranslation();
    const { subscription, plan: current, isLoading } = useCurrentSubscription();
    const subscriptions = useSubscriptions();
    if (isLoading) return <PageLoader />;
    if (subscriptions.isError) return <Banner tone="danger" title={t(commonErrorKey(subscriptions.error))} />;
    return <PlansScene signedIn subscription={subscription} current={subscription ? current : undefined} />;
};

const PlansScene = ({
    signedIn,
    canBuy = true,
    subscription,
    current,
}: {
    signedIn: boolean;
    canBuy?: boolean;
    subscription?: Subscription;
    current?: Plan;
}): JSX.Element => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const today = useToday();
    const session = useSession();
    const language = currencyOfLanguage(i18n.language);
    const dollarsAsked = signedIn && !subscription && language !== 'KRW';
    const foreignBilling = useForeignBilling({ enabled: dollarsAsked });
    const currency = subscription ? undefined : dollarsAsked && foreignBilling === 'shut' ? 'KRW' : language;
    const plans = usePlans(currency);
    const account = signedIn ? (session.data ?? null) : null;
    const storeBilled = account?.billingSource === 'appStore' || account?.billingSource === 'googlePlay';

    const entryPlan = plans.data?.find(p => p.sort === ENTRY_PLAN_SORT);
    const preview = usePreviewCheckout(signedIn && !current && !storeBilled ? entryPlan?.id : undefined, currency);

    if (foreignBilling === 'reading' || plans.isLoading || preview.isLoading) return <PageLoader />;
    if (!plans.data) {
        return <Banner tone="danger" title={t('subscription.common.error.unknown')} />;
    }

    const withTrial = preview.data ? preview.data.withTrial : (account?.trialEligible ?? !account?.trialUsed);
    const canChange = !subscription || sceneOf(subscription, today).actions.includes('changePlan');
    const choices = planChoicesOf({ plans: plans.data, current, account, withTrial, canChange });
    const trialDays = choices.entry?.trialDays ?? entryPlan?.trialDays ?? 0;
    const planName = (plan: Plan) => t('subscription.common.planName', { sort: plan.sort });

    const subscribe = () => {
        if (!choices.entry) return;
        const target = checkoutPath(choices.entry);
        navigate(
            choices.mode === 'visitor'
                ? `${ROUTES.subscription.login}?${new URLSearchParams({ next: target })}`
                : target
        );
    };

    const changing = choices.mode === 'change' || choices.mode === 'changeUnavailable';
    const title = changing ? 'changeTitle' : 'title';
    const subtitle =
        choices.mode === 'storeBilled' || choices.mode === 'changeUnavailable'
            ? undefined
            : changing
              ? 'changeSubtitle'
              : withTrial
                ? 'subtitle'
                : 'subtitleTrialUsed';

    return (
        <section className="flex flex-col gap-10">
            <header className="flex flex-col gap-2">
                <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink sm:text-[28px]">
                    {t(`subscription.entry.plans.${title}`)}
                </h1>
                {subtitle && (
                    <p className="text-sm font-medium tracking-[-0.01em] text-mute sm:text-[15px]">
                        {t(`subscription.entry.plans.${subtitle}`, { days: trialDays })}
                    </p>
                )}
            </header>

            {choices.mode === 'changeUnavailable' && subscription && (
                <Banner
                    tone="warning"
                    title={t('subscription.entry.plans.changeUnavailable.title')}
                    action={
                        <Link
                            to={ROUTES.subscription.detail(subscription.id)}
                            className="text-sm font-semibold text-navy underline-offset-2 hover:underline"
                        >
                            {t('subscription.entry.plans.changeUnavailable.action')}
                        </Link>
                    }
                >
                    {t('subscription.entry.plans.changeUnavailable.body')}
                </Banner>
            )}

            {choices.mode === 'storeBilled' && (
                <Banner
                    tone="info"
                    title={t('subscription.entry.plans.storeBilled.title')}
                    action={
                        <Link
                            to={ROUTES.subscription.storeManaged}
                            className="text-sm font-semibold text-navy underline-offset-2 hover:underline"
                        >
                            {t('subscription.entry.plans.storeBilled.action')}
                        </Link>
                    }
                >
                    {t('subscription.entry.plans.storeBilled.body')}
                </Banner>
            )}

            <div className="grid grid-cols-1 gap-[18px] min-[440px]:grid-cols-2 md:grid-cols-3 md:gap-4 min-[1200px]:grid-cols-5">
                {choices.cards.map(choice => (
                    <ChoiceCard
                        key={choice.plan.id}
                        choice={canBuy ? choice : listed(choice)}
                        tagLabel={
                            choice.tag && (changing || choice.tag === 'trialUsed')
                                ? t(`subscription.entry.plans.tag.${choice.tag}`, { days: trialDays })
                                : undefined
                        }
                        onPick={
                            !canBuy
                                ? undefined
                                : choices.mode === 'change'
                                  ? () => navigate(changePath(choice.plan))
                                  : subscribe
                        }
                    />
                ))}
            </div>

            {!canBuy && <InAppOnly />}

            {canBuy && (choices.mode === 'visitor' || choices.mode === 'new') && choices.entry && (
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-[22px]">
                    <Button size="lg" className="h-[54px] w-full sm:h-[46px] sm:w-auto" onClick={subscribe}>
                        {withTrial || !preview.data
                            ? t('subscription.entry.plans.subscribe', { plan: planName(choices.entry) })
                            : t('subscription.entry.plans.subscribePaid', {
                                  plan: planName(choices.entry),
                                  price: formatMoney(preview.data.amountToday, i18n.language),
                              })}
                    </Button>
                    {choices.mode === 'visitor' && (
                        <p className="text-xs font-medium leading-normal text-mute sm:text-[13px]">
                            {t('subscription.entry.plans.entryHint', { plan: planName(choices.entry) })}
                        </p>
                    )}
                </div>
            )}

            {choices.mode === 'change' && (choices.upgrade || choices.downgrade) && (
                <div className="flex flex-wrap items-center gap-4">
                    {choices.upgrade && (
                        <Button size="lg" onClick={() => navigate(changePath(choices.upgrade as Plan))}>
                            {t('subscription.entry.plans.upgradeTo', {
                                plan: planName(choices.upgrade),
                                context: String(choices.upgrade.sort),
                            })}
                        </Button>
                    )}
                    {choices.downgrade && (
                        <Button
                            size="lg"
                            variant="secondary"
                            onClick={() => navigate(changePath(choices.downgrade as Plan))}
                        >
                            {t('subscription.entry.plans.downgradeTo', {
                                plan: planName(choices.downgrade),
                                context: String(choices.downgrade.sort),
                            })}
                        </Button>
                    )}
                </div>
            )}

            {(choices.mode === 'visitor' || choices.mode === 'new') && (
                <Notes
                    withTrial={withTrial}
                    canBuy={canBuy}
                    firstChargeAt={preview.data?.firstChargeAt}
                    entryName={choices.entry && planName(choices.entry)}
                />
            )}
        </section>
    );
};

const listed = (choice: PlanChoice): PlanChoice => ({ ...choice, tag: undefined, selected: false, pickable: true });

const InAppOnly = (): JSX.Element => {
    const { t } = useTranslation();
    const store = 'rounded-full bg-navy px-6 py-3 text-sm font-semibold text-white hover:opacity-90';
    return (
        <Banner
            tone="info"
            title={t('subscription.entry.plans.inAppOnly.title')}
            action={
                <div className="flex flex-wrap gap-2">
                    <a href={storeUrls.ios} target="_blank" rel="noreferrer" className={store}>
                        App Store
                    </a>
                    <a href={storeUrls.android} target="_blank" rel="noreferrer" className={store}>
                        Google Play
                    </a>
                </div>
            }
        >
            {t('subscription.entry.plans.inAppOnly.body')}
        </Banner>
    );
};

const ChoiceCard = ({
    choice,
    tagLabel,
    onPick,
}: {
    choice: PlanChoice;
    tagLabel?: string;
    onPick?: () => void;
}): JSX.Element => {
    const card = (
        <PlanCard
            plan={choice.plan}
            selected={choice.selected}
            disabled={!choice.pickable && choice.tag !== 'current'}
            onSelect={choice.pickable ? onPick : undefined}
            tag={
                choice.tag &&
                tagLabel && (
                    <Badge tone={TAG_TONES[choice.tag]} className={TAG_CLASSES[choice.tag]}>
                        {tagLabel}
                    </Badge>
                )
            }
        />
    );
    return choice.tag === 'current' ? (
        <div className="grid rounded-2xl ring-2 ring-navy [&>button]:border-transparent">{card}</div>
    ) : (
        <div className="grid">{card}</div>
    );
};

const Notes = ({
    withTrial,
    canBuy,
    firstChargeAt,
    entryName,
}: {
    withTrial: boolean;
    canBuy: boolean;
    firstChargeAt?: string;
    entryName?: string;
}): JSX.Element => {
    const { t } = useTranslation();
    const lines = withTrial
        ? [
              t('subscription.entry.plans.notes.trialOnce'),
              t('subscription.entry.plans.notes.afterTrial'),
              ...(canBuy ? [t('subscription.entry.plans.notes.storeSubscribers')] : []),
          ]
        : [
              t('subscription.entry.plans.notes.trialUsed'),
              ...(firstChargeAt
                  ? [t('subscription.entry.plans.notes.chargeToday', { day: Number(firstChargeAt.slice(8, 10)) })]
                  : []),
              ...(entryName ? [t('subscription.entry.plans.notes.startAtEntry', { plan: entryName })] : []),
          ];
    return (
        <div className="rounded-[14px] bg-note p-4 sm:rounded-2xl sm:px-6 sm:py-5">
            <p className="text-sm font-bold text-ink">{t('subscription.entry.plans.notesTitle')}</p>
            <ul className="mt-1.5 flex flex-col text-[13px] font-medium leading-[1.6] text-[#666b78] sm:leading-normal">
                {lines.map(line => (
                    <li key={line}>• {line}</li>
                ))}
            </ul>
        </div>
    );
};
