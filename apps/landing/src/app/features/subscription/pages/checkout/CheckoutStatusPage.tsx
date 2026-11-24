import { type JSX, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { TFunction } from 'i18next';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { PageLoader, SummaryTile } from '../../components';
import { Banner } from '../../components/ui';
import {
    usePaymentAttempt,
    usePaymentMethods,
    usePlans,
    usePreviewChange,
    usePreviewCheckout,
    useSubscription,
} from '../../hooks';
import { currencyOfCountry } from '@chatic/web-checkout';
import { defaultCardOf } from '@chatic/web-checkout';
import { isPortError } from '../../lib/port';
import { useManagementScreens } from '../../lib/screens';
import { formatDate, formatMoney } from '../../utils';
import {
    type AttemptVariant,
    type StatusScene,
    checkoutDetailsOf,
    completeUrl,
    planFromQuery,
    registrationSceneOf,
    retryUrlOf,
    statusSceneOf,
    withCheckoutDetails,
} from './flow';
import { LoadError, NoteBox, ResultActions, ResultCard, ResultHeader, primaryLink, secondaryLink } from './parts';

import type { Money, PaymentMethod, Plan, Subscription } from '@chatic/web-checkout';

export const CheckoutStatusPage = (): JSX.Element => {
    const [params] = useSearchParams();
    const attemptId = params.get('attempt') ?? undefined;
    const outcome = params.get('outcome');

    if (attemptId) return <AttemptStatus attemptId={attemptId} />;
    if (outcome) return <RegistrationOutcome outcome={outcome} />;
    return <Navigate to={ROUTES.subscription.root} replace />;
};

const useQueryPlan = (): Plan | undefined => {
    const [params] = useSearchParams();
    const plans = usePlans();
    return planFromQuery(plans.data, params.get('plan'));
};

const AttemptStatus = ({ attemptId }: { attemptId: string }): JSX.Element => {
    const location = useLocation();
    const { cards: management } = useManagementScreens();
    const plan = useQueryPlan();
    const attempt = usePaymentAttempt(attemptId);

    if (attempt.isError) {
        return isPortError(attempt.error, 'notFound') ? (
            <Navigate to={ROUTES.subscription.root} replace />
        ) : (
            <LoadError error={attempt.error} onRetry={attempt.refetch} />
        );
    }
    if (!attempt.data) return <PageLoader />;

    const scene = statusSceneOf(attempt.data);
    if (scene.kind === 'complete') {
        return <Navigate to={completeUrl(attempt.data.id, plan?.id)} replace state={location.state} />;
    }
    if (scene.kind === 'cardAdded') {
        return <Navigate to={management ? ROUTES.subscription.paymentMethods : ROUTES.subscription.root} replace />;
    }
    return (
        <div aria-live="polite">
            <StatusScreen scene={scene} plan={plan} subscriptionId={attempt.data.subscriptionId} />
        </div>
    );
};

const useCheckoutCurrency = () => {
    const details = checkoutDetailsOf(useLocation().state);
    return details && currencyOfCountry(details.country);
};

const RegistrationOutcome = ({ outcome }: { outcome: string }): JSX.Element => {
    const plans = usePlans();
    const plan = useQueryPlan();
    const preview = usePreviewCheckout(plan?.id, useCheckoutCurrency());
    const scene = registrationSceneOf(outcome, preview.data?.withTrial);

    if (!scene) return <Navigate to={ROUTES.subscription.root} replace />;
    if (plans.isLoading || (plan && preview.isLoading)) return <PageLoader />;
    return <StatusScreen scene={scene} plan={plan} />;
};

const useSceneFacts = (variant: AttemptVariant, plan: Plan | undefined, subscriptionId: string | undefined) => {
    const plans = usePlans();
    const checkout = usePreviewCheckout(variant === 'payment' ? plan?.id : undefined, useCheckoutCurrency());
    const change = usePreviewChange(variant === 'upgrade' ? plan?.id : undefined);
    const subscription = useSubscription(subscriptionId);
    const methods = usePaymentMethods();
    const subscriptionPlan = plans.data?.find(p => p.id === subscription.data?.planId);

    let amount: Money | undefined;
    if (variant === 'payment') amount = checkout.data?.amountToday;
    if (variant === 'upgrade' && change.data?.amountToday?.amount) amount = change.data.amountToday;
    if (variant === 'retry') amount = subscriptionPlan?.monthly;

    return {
        amount,
        subscription: subscription.data,
        subscriptionPlan,
        card: subscription.data
            ? methods.data && defaultCardOf(methods.data, subscription.data.provider)
            : methods.data?.find(method => method.isDefault),
    };
};

const cardLabel = (card: PaymentMethod | undefined, t: TFunction) =>
    card ? t('subscription.checkout.cardLabel', { brand: card.brand, last4: card.last4 }) : undefined;

const StatusScreen = ({
    scene,
    plan,
    subscriptionId,
}: {
    scene: Exclude<StatusScene, { kind: 'complete' | 'cardAdded' }>;
    plan: Plan | undefined;
    subscriptionId?: string;
}): JSX.Element => {
    const { t, i18n } = useTranslation();
    const location = useLocation();
    const variant = scene.kind === 'retried' ? 'retry' : scene.variant;
    const facts = useSceneFacts(variant, plan, subscriptionId);
    const price = facts.amount ? formatMoney(facts.amount, i18n.language) : undefined;
    const details = checkoutDetailsOf(location.state);
    const retry = (label: ReactNode, className: string) => (
        <Link to={retryUrlOf(variant, plan?.id)} state={withCheckoutDetails(details)?.state} className={className}>
            {label}
        </Link>
    );

    const key = (name: string) => `subscription.checkout.status.${name}`;

    if (scene.kind === 'processing') {
        const title =
            variant === 'card'
                ? t(key('processing.card'))
                : price
                  ? t(key('processing.amount'), { price })
                  : t(key('processing.payment'));
        const body =
            variant === 'upgrade' && plan
                ? t(key('processing.bodyUpgrade'), { plan: t(`subscription.checkout.planRo.${plan.sort}`) })
                : t(key('processing.body'));
        return (
            <ResultCard busy>
                <ResultHeader tone={variant === 'card' ? 'checking' : 'progress'} title={title} body={body} />
                <NoteBox title={t(key('processing.waitTitle'))}>{t(key('processing.waitBody'))}</NoteBox>
            </ResultCard>
        );
    }

    if (scene.kind === 'retried') {
        const sub = facts.subscription;
        return (
            <ResultCard>
                <ResultHeader
                    tone="success"
                    title={t(key('retried.title'))}
                    body={sub ? t(key('retried.body'), { day: sub.billingDay }) : undefined}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <SummaryTile label={t(key('retried.amount'))} value={price ?? '—'} />
                    <SummaryTile label={t(key('retried.card'))} value={cardLabel(facts.card, t) ?? '—'} />
                    <SummaryTile
                        label={t(key('retried.next'))}
                        value={sub?.nextBillingAt ? formatDate(sub.nextBillingAt) : '—'}
                    />
                </div>
                <div>
                    <Link
                        to={sub ? ROUTES.subscription.detail(sub.id) : ROUTES.subscription.root}
                        className={primaryLink}
                    >
                        {t(key('toSubscription'))}
                    </Link>
                </div>
            </ResultCard>
        );
    }

    if (scene.kind === 'canceled') {
        return (
            <ResultCard>
                <ResultHeader
                    tone="neutral"
                    title={t(key(`canceled.title.${variant}`))}
                    body={t(key(`canceled.body.${variant}`))}
                />
                <ResultActions>
                    {retry(t(key(`canceled.retry.${variant}`)), primaryLink)}
                    {(variant === 'card' || variant === 'payment') && (
                        <Link to={ROUTES.subscription.plans} className={secondaryLink}>
                            {t(key('canceled.choosePlan'))}
                        </Link>
                    )}
                </ResultActions>
            </ResultCard>
        );
    }

    return (
        <FailedScene
            variant={variant}
            failure={scene.failure}
            subscription={facts.subscription}
            subscriptionPlan={facts.subscriptionPlan}
            card={cardLabel(facts.card, t)}
            retry={retry}
        />
    );
};

const FailedScene = ({
    variant,
    failure,
    subscription,
    subscriptionPlan,
    card,
    retry,
}: {
    variant: AttemptVariant;
    failure: 'declined' | 'attemptLimit' | 'unknown';
    subscription?: Subscription;
    subscriptionPlan?: Plan;
    card?: string;
    retry: (label: ReactNode, className: string) => JSX.Element;
}): JSX.Element => {
    const { t } = useTranslation();
    const { cards: management } = useManagementScreens();
    const key = (name: string) => `subscription.checkout.status.failed.${name}`;
    const keepPlan = subscriptionPlan ? t(`subscription.checkout.planEul.${subscriptionPlan.sort}`) : '';

    const reason = t(key(`reason.${failure}`), {
        next: t(key(variant === 'card' ? 'reasonNext.register' : 'reasonNext.pay')),
    });

    const manageCards = management ? (
        <Link
            to={ROUTES.subscription.paymentMethods}
            className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-white px-7 text-[15px] font-semibold text-navy hover:bg-muted"
        >
            {t(key('manageCards'))}
        </Link>
    ) : null;

    return (
        <ResultCard>
            <ResultHeader
                tone="danger"
                title={t(key(`title.${variant}`))}
                body={t(key(`body.${variant}`), { plan: keepPlan })}
            />
            <NoteBox title={t(key('reasonTitle'))}>
                <p>{reason}</p>
                {variant === 'upgrade' && card && <p>{t(key('chargedCard'), { card })}</p>}
            </NoteBox>
            <ResultActions>
                {variant === 'retry' ? (
                    management ? (
                        retry(t(key('manageCards')), primaryLink)
                    ) : (
                        <Link to={ROUTES.subscription.detail(subscription?.id ?? '')} className={primaryLink}>
                            {t('subscription.common.actions.close')}
                        </Link>
                    )
                ) : (
                    <>
                        {variant === 'upgrade' ? manageCards : retry(t(key(`otherCard.${variant}`)), secondaryLink)}
                        {retry(t('subscription.common.actions.retry'), primaryLink)}
                    </>
                )}
            </ResultActions>
            {variant === 'retry' && subscription && <Banner tone="neutral">{t(key('retryStillDue'))}</Banner>}
        </ResultCard>
    );
};
