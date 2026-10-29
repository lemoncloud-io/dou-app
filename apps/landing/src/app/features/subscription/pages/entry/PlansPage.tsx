import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { storeUrls } from '../../../../config/links';
import { ROUTES } from '../../../../routes/paths';
import { PageLoader, PlanCard } from '../../components';
import { Badge, type BadgeTone, Banner, Button } from '../../components/ui';
import { useCurrentSubscription, usePlans, usePreviewCheckout, useSession, useSubscriptions } from '../../hooks';
import { ENTRY_PLAN_SORT } from '../../lib/changeKindOf';
import { useToday } from '../../lib/port';
import { sceneOf } from '../../lib/sceneOf';
import { cn, formatMoney } from '../../utils';
import { type PlanChoice, type PlanTag, planChoicesOf } from './planChoices';

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

// The step up wears the brand green, which no badge tone carries; on the highlighted card a tone's
// pale fill would vanish.
const TAG_CLASSES: Partial<Record<PlanTag, string>> = { upgrade: 'bg-main-green text-navy' };

const changePath = (plan: Plan) => `${ROUTES.subscription.change}?${new URLSearchParams({ plan: plan.id })}`;
const checkoutPath = (plan: Plan) => `${ROUTES.subscription.checkout}?${new URLSearchParams({ plan: plan.id })}`;

/**
 * W-01 — the plans. A visitor and a signed-in reader with no plan are offered the entry plan only; a
 * subscriber is offered the step up and the step down. Which card is pickable comes from
 * `planChoicesOf`, and every price and trial length from the port.
 *
 * Where the account surface is shut (`account` false) the reader is always a visitor and there is
 * nowhere to buy yet: the same plans and notes, with the store links in place of the subscribe button.
 */
export const PlansPage = ({ account = true }: { account?: boolean }): JSX.Element => {
    const session = useSession();
    if (session.isLoading) return <PageLoader />;
    // A visitor has no subscriptions to ask for: the call would answer that the session is gone, and
    // that answer sends the reader to sign in — not what a visitor browsing the plans asked for.
    return account && session.data ? <SignedInPlans /> : <PlansScene signedIn={false} canBuy={account} />;
};

const SignedInPlans = (): JSX.Element => {
    const { t } = useTranslation();
    const { subscription, plan: current, isLoading } = useCurrentSubscription();
    // Same cache as above, read for its error: without the list, "no subscription" would be a guess,
    // and the guess would offer a subscriber their first subscription.
    const subscriptions = useSubscriptions();
    if (isLoading) return <PageLoader />;
    if (subscriptions.isError) return <Banner tone="danger" title={t('subscription.common.error.unknown')} />;
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
    const plans = usePlans();
    const account = signedIn ? (session.data ?? null) : null;
    const storeBilled = account?.billingSource === 'appStore' || account?.billingSource === 'googlePlay';

    // Before a first subscription the checkout preview says whether it would start with the trial and
    // what today's charge is; the page does not work either out itself.
    const entryPlan = plans.data?.find(p => p.sort === ENTRY_PLAN_SORT);
    const preview = usePreviewCheckout(signedIn && !current && !storeBilled ? entryPlan?.id : undefined);

    if (plans.isLoading || preview.isLoading) return <PageLoader />;
    if (!plans.data) {
        return <Banner tone="danger" title={t('subscription.common.error.unknown')} />;
    }

    const withTrial = preview.data ? preview.data.withTrial : !account?.trialUsed;
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
    // Where nothing can be picked, the banner says why; a subtitle about picking would contradict it.
    const subtitle =
        choices.mode === 'storeBilled' || choices.mode === 'changeUnavailable'
            ? undefined
            : changing
              ? 'changeSubtitle'
              : withTrial
                ? 'subtitle'
                : 'subtitleTrialUsed';

    return (
        // Five plan cards need more room than the shell's reading column gives a page, so on a window
        // wide enough to hold them this one widens past the column, centred on it. Margins rather than
        // a transform: a transformed box still counts at its untransformed place and scrolls sideways.
        <section className="flex flex-col gap-8 min-[1200px]:mx-[calc(50%_-_550px)] min-[1200px]:w-[1100px]">
            <header className="flex flex-col gap-3">
                <h1 className="text-[28px] font-bold text-navy">{t(`subscription.entry.plans.${title}`)}</h1>
                {subtitle && (
                    <p className="text-[15px] text-subtitle">
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

            {/* Below the widened layout a price no longer fits a fifth of the column, so the cards wrap. */}
            <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 md:grid-cols-3 md:gap-4 min-[1200px]:grid-cols-5">
                {choices.cards.map(choice => (
                    <ChoiceCard
                        key={choice.plan.id}
                        choice={canBuy ? choice : listed(choice)}
                        tagLabel={choice.tag && t(`subscription.entry.plans.tag.${choice.tag}`, { days: trialDays })}
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
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    <Button size="lg" className="rounded-full px-7" onClick={subscribe}>
                        {withTrial || !preview.data
                            ? t('subscription.entry.plans.subscribe', { plan: planName(choices.entry) })
                            : t('subscription.entry.plans.subscribePaid', {
                                  plan: planName(choices.entry),
                                  price: formatMoney(preview.data.amountToday, i18n.language),
                              })}
                    </Button>
                    {choices.mode === 'visitor' && (
                        <p className="text-[13px] text-subtitle">
                            {t('subscription.entry.plans.entryHint', { plan: planName(choices.entry) })}
                        </p>
                    )}
                </div>
            )}

            {choices.mode === 'change' && (choices.upgrade || choices.downgrade) && (
                <div className="flex flex-wrap items-center gap-4">
                    {choices.upgrade && (
                        <Button
                            size="lg"
                            className="rounded-full px-7"
                            onClick={() => navigate(changePath(choices.upgrade as Plan))}
                        >
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
                            className="rounded-full px-7"
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

/**
 * A card as a price list shows it while nothing can be bought on the web: no tag and no greying. The
 * tags ("after subscribing", the entry plan) are rules of the web checkout, and a plan greyed by them
 * would read as unavailable rather than as a price.
 */
const listed = (choice: PlanChoice): PlanChoice => ({ ...choice, tag: undefined, selected: false, pickable: true });

/** In place of the subscribe button while nothing can be bought on the web: buy in the app. */
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
                choice.tag && (
                    <Badge tone={TAG_TONES[choice.tag]} className={TAG_CLASSES[choice.tag]}>
                        {tagLabel}
                    </Badge>
                )
            }
        />
    );
    // The plan in force is marked by its frame, not by the pick highlight — it cannot be picked.
    return choice.tag === 'current' ? (
        <div className="grid rounded-2xl ring-2 ring-navy [&>button]:border-transparent">{card}</div>
    ) : (
        <div className={cn('grid', choice.selected && '[&>button]:bg-status-success-bg')}>{card}</div>
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
              // About paying twice on the web — said only where the web takes a payment.
              ...(canBuy ? [t('subscription.entry.plans.notes.storeSubscribers')] : []),
          ]
        : [
              t('subscription.entry.plans.notes.trialUsed'),
              ...(firstChargeAt
                  ? // The first charge lands today, so its day of the month is the billing day from then on.
                    [t('subscription.entry.plans.notes.chargeToday', { day: Number(firstChargeAt.slice(8, 10)) })]
                  : []),
              ...(entryName ? [t('subscription.entry.plans.notes.startAtEntry', { plan: entryName })] : []),
          ];
    return (
        <div className="rounded-2xl bg-muted px-6 py-5">
            <p className="text-sm font-semibold text-navy">{t('subscription.entry.plans.notesTitle')}</p>
            <ul className="mt-3 flex flex-col gap-1.5 text-[13px] text-desc-alt">
                {lines.map(line => (
                    <li key={line}>• {line}</li>
                ))}
            </ul>
        </div>
    );
};
