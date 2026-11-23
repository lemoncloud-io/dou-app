import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { usePort } from '../lib/port';
import { subscriptionKeys } from './keys';
import { useInvalidateSubscriptionState } from './subscriptions';

import type { AttemptPurpose, Currency, Payer, PaymentAttempt, PlanId } from '../types';

export const usePreviewCheckout = (planId: PlanId | undefined, currency?: Currency) => {
    const port = usePort();
    return useQuery({
        queryKey: subscriptionKeys.checkoutPreview(planId ?? '', currency),
        queryFn: () => port.previewCheckout(planId as PlanId, currency ? { currency } : undefined),
        enabled: !!planId,
        placeholderData: keepPreviousData,
    });
};

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

export const ATTEMPT_POLL_MS = 500;

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
