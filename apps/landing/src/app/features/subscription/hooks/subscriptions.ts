import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { usePort } from '../lib/port';
import { subscriptionKeys } from './keys';

import type { Currency, PlanId } from '../types';

export const usePlans = (currency?: Currency) => {
    const port = usePort();
    return useQuery({
        queryKey: subscriptionKeys.plans(currency),
        queryFn: () => port.listPlans(currency ? { currency } : undefined),
    });
};

export const useSubscriptions = (options: { enabled?: boolean } = {}) => {
    const port = usePort();
    return useQuery({
        queryKey: subscriptionKeys.subscriptions(),
        queryFn: () => port.listSubscriptions(),
        enabled: options.enabled,
    });
};

export const useSubscription = (id: string | undefined) => {
    const port = usePort();
    return useQuery({
        queryKey: subscriptionKeys.subscription(id ?? ''),
        queryFn: () => port.getSubscription(id as string),
        enabled: !!id,
    });
};

export const useInvalidateSubscriptionState = () => {
    const queryClient = useQueryClient();
    return () =>
        Promise.all(
            [
                subscriptionKeys.subscriptions(),
                ['subscription', 'getSubscription'],
                ['subscription', 'listPlans'],
                subscriptionKeys.session(),
                subscriptionKeys.invoices(),
                ['subscription', 'previewChange'],
                ['subscription', 'previewCheckout'],
            ].map(queryKey => queryClient.invalidateQueries({ queryKey }))
        );
};

export const useCancelSubscription = () => {
    const port = usePort();
    const invalidate = useInvalidateSubscriptionState();
    return useMutation({
        mutationFn: (subscriptionId: string) => port.cancelSubscription(subscriptionId),
        onSuccess: invalidate,
    });
};

export const useResumeSubscription = () => {
    const port = usePort();
    const invalidate = useInvalidateSubscriptionState();
    return useMutation({
        mutationFn: (subscriptionId: string) => port.resumeSubscription(subscriptionId),
        onSuccess: invalidate,
    });
};

export const usePreviewChange = (planId: PlanId | undefined) => {
    const port = usePort();
    return useQuery({
        queryKey: subscriptionKeys.changePreview(planId ?? ''),
        queryFn: () => port.previewChange(planId as PlanId),
        enabled: !!planId,
    });
};

export const useChangePlan = () => {
    const port = usePort();
    const invalidate = useInvalidateSubscriptionState();
    return useMutation({
        mutationFn: (planId: PlanId) => port.changePlan(planId),
        onSuccess: invalidate,
    });
};

export const useCancelScheduledChange = () => {
    const port = usePort();
    const invalidate = useInvalidateSubscriptionState();
    return useMutation({
        mutationFn: (subscriptionId: string) => port.cancelScheduledChange(subscriptionId),
        onSuccess: invalidate,
    });
};
