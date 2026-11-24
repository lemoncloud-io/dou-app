import { useSearchParams } from 'react-router-dom';

import { useCurrentSubscription, usePlans, useSession, useSubscriptions } from '../../hooks';
import { checkoutRouteFor, planFromQuery } from './flow';

import type { Plan, Subscription } from '@chatic/web-checkout';

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
