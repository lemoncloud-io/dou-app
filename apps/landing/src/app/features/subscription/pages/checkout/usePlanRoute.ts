import { useSearchParams } from 'react-router-dom';

import { useCurrentSubscription, usePlans, useSession, useSubscriptions } from '../../hooks';
import { checkoutRouteFor, planFromQuery } from './flow';

import type { Plan, Subscription } from '../../types';

/**
 * What W-08, W-05 and W-14 all start from: the plan `?plan=` names, the subscription in force, and
 * which of the three screens that pair belongs on.
 *
 * A failed read is reported as an error, never read as an answer: a subscription list that did not
 * load is not "no subscription", and taking it for one would put an existing subscriber through a
 * first checkout.
 */
export const usePlanRoute = (): {
    loading: boolean;
    error: unknown;
    retry: () => void;
    target?: Plan;
    subscription?: Subscription;
    currentPlan?: Plan;
    route?: ReturnType<typeof checkoutRouteFor>;
} => {
    const [params] = useSearchParams();
    const session = useSession();
    const plans = usePlans();
    const subscriptions = useSubscriptions();
    const current = useCurrentSubscription();
    const target = planFromQuery(plans.data, params.get('plan'));
    const error = plans.error ?? subscriptions.error ?? undefined;
    const reloads = [plans, subscriptions].filter(query => query.isError).map(query => query.refetch);

    return {
        loading: plans.isLoading || current.isLoading,
        error,
        retry: () => reloads.forEach(reload => void reload()),
        target,
        subscription: current.subscription,
        currentPlan: current.plan,
        route: target && !error ? checkoutRouteFor(current.plan, target, session.data ?? null) : undefined,
    };
};
