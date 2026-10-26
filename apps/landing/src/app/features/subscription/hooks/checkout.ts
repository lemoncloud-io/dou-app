import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { usePort } from '../lib/port';
import { subscriptionKeys } from './keys';
import { useInvalidateSubscriptionState } from './subscriptions';

import type { AttemptPurpose, PaymentAttempt, PlanId } from '../types';

export const usePreviewCheckout = (planId: PlanId | undefined) => {
    const port = usePort();
    return useQuery({
        queryKey: subscriptionKeys.checkoutPreview(planId ?? ''),
        queryFn: () => port.previewCheckout(planId as PlanId),
        enabled: !!planId,
    });
};

/**
 * The payment provider's window. A registered card shows up in the payment methods, and may become
 * the default card the subscriptions carry.
 */
export const useStartPaymentMethodRegistration = () => {
    const port = usePort();
    const queryClient = useQueryClient();
    const invalidate = useInvalidateSubscriptionState();
    return useMutation({
        mutationFn: (input: { purpose: AttemptPurpose; planId?: PlanId }) => port.startPaymentMethodRegistration(input),
        onSuccess: () =>
            Promise.all([queryClient.invalidateQueries({ queryKey: subscriptionKeys.paymentMethods() }), invalidate()]),
    });
};

export const useStartCheckout = () => {
    const port = usePort();
    return useMutation({
        mutationFn: (input: { planId: PlanId; country: string; emailId: string }) => port.startCheckout(input),
    });
};

/** How often a processing attempt is asked about again. */
export const ATTEMPT_POLL_MS = 500;

/**
 * Follows a payment attempt until it settles. Once it has, everything the attempt could have changed
 * is refetched, so the screen it leads to reads the new state.
 */
export const usePaymentAttempt = (id: string | undefined) => {
    const port = usePort();
    const invalidate = useInvalidateSubscriptionState();
    const queryClient = useQueryClient();
    return useQuery({
        queryKey: subscriptionKeys.paymentAttempt(id ?? ''),
        queryFn: async (): Promise<PaymentAttempt> => {
            const attempt = await port.getPaymentAttempt(id as string);
            if (attempt.status !== 'processing') {
                await invalidate();
                await queryClient.invalidateQueries({ queryKey: subscriptionKeys.paymentMethods() });
            }
            return attempt;
        },
        enabled: !!id,
        refetchInterval: query => (query.state.data?.status === 'processing' ? ATTEMPT_POLL_MS : false),
    });
};
