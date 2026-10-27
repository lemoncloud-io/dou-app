import { isLive } from '../lib/sceneOf';
import { usePlans, useSubscriptions } from './subscriptions';

import type { Plan, Subscription } from '../types';

/**
 * The subscription in force and its plan, or neither. An account has at most one live subscription;
 * the rest of the list is history. The sidebar summary and the plan picker both start from this.
 */
export const useCurrentSubscription = (): {
    subscription?: Subscription;
    plan?: Plan;
    isLoading: boolean;
} => {
    const subscriptions = useSubscriptions();
    const plans = usePlans();
    const subscription = subscriptions.data?.find(isLive);
    const plan = subscription ? plans.data?.find(p => p.id === subscription.planId) : undefined;
    return { subscription, plan, isLoading: subscriptions.isLoading || plans.isLoading };
};
