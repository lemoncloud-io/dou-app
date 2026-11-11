import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { usePort } from '../lib/port';
import { subscriptionKeys } from './keys';
import { useInvalidateSubscriptionState } from './subscriptions';

import type { AttemptPurpose, Currency, Payer, PaymentAttempt, PlanId } from '../types';

/**
 * What a first subscription to `planId` would cost, priced in `currency` (won when omitted). A change of
 * currency keeps the previous answer on screen while the new one loads (`isPlaceholderData`), so the page
 * does not drop back to a loader; its amounts are in the old currency meanwhile.
 */
export const usePreviewCheckout = (planId: PlanId | undefined, currency?: Currency) => {
    const port = usePort();
    return useQuery({
        queryKey: subscriptionKeys.checkoutPreview(planId ?? '', currency),
        queryFn: () => port.previewCheckout(planId as PlanId, currency ? { currency } : undefined),
        enabled: !!planId,
        placeholderData: keepPreviousData,
    });
};

/**
 * The payment provider's card entry — its own window, or its card field in a dialog of ours. A
 * registered card shows up in the payment methods, and may become the default card the subscriptions
 * carry.
 */
export const useStartPaymentMethodRegistration = () => {
    const port = usePort();
    const queryClient = useQueryClient();
    const invalidate = useInvalidateSubscriptionState();
    return useMutation({
        mutationFn: (input: { purpose: AttemptPurpose; planId?: PlanId; country?: string; payer?: Payer }) =>
            port.startPaymentMethodRegistration(input),
        onSuccess: () =>
            Promise.all([queryClient.invalidateQueries({ queryKey: subscriptionKeys.paymentMethods() }), invalidate()]),
    });
};

/** The return from a payment window that left the page (a phone's): its result, as if it had stayed. */
export const useCompletePaymentMethodRegistration = () => {
    const port = usePort();
    const queryClient = useQueryClient();
    const invalidate = useInvalidateSubscriptionState();
    return useMutation({
        mutationFn: (input: { callback: URLSearchParams; purpose: AttemptPurpose; payer?: Payer }) =>
            port.completePaymentMethodRegistration(input),
        onSuccess: () =>
            Promise.all([queryClient.invalidateQueries({ queryKey: subscriptionKeys.paymentMethods() }), invalidate()]),
    });
};

export const useStartCheckout = () => {
    const port = usePort();
    return useMutation({
        mutationFn: (input: Parameters<typeof port.startCheckout>[0]) => port.startCheckout(input),
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
