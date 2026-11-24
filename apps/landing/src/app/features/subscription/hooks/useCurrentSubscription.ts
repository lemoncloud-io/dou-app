import { isLive } from '../lib/sceneOf';
import { usePlans, useSubscriptions } from './subscriptions';

import type { Plan, Subscription } from '@chatic/web-checkout';

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
