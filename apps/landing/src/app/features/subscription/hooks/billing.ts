import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { usePort, useSupports } from '../lib/port';
import { subscriptionKeys } from './keys';

import type { BillingEmailReceives, BillingInfo, PaymentMethod } from '../types';

export const usePaymentMethods = () => {
    const port = usePort();
    return useQuery({ queryKey: subscriptionKeys.paymentMethods(), queryFn: () => port.listPaymentMethods() });
};

const usePaymentMethodsMutation = <T>(fn: (input: T) => Promise<PaymentMethod[]>) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: methods => {
            queryClient.setQueryData(subscriptionKeys.paymentMethods(), methods);
            return queryClient.invalidateQueries({ queryKey: subscriptionKeys.all, refetchType: 'active' });
        },
    });
};

export const useSetDefaultPaymentMethod = () => {
    const port = usePort();
    return usePaymentMethodsMutation((id: string) => port.setDefaultPaymentMethod(id));
};

export const useRemovePaymentMethod = () => {
    const port = usePort();
    return usePaymentMethodsMutation((id: string) => port.removePaymentMethod(id));
};

export const useRetryPayment = () => {
    const port = usePort();
    return useMutation({ mutationFn: (subscriptionId: string) => port.retryPayment(subscriptionId) });
};

export const useInvoices = () => {
    const port = usePort();
    const enabled = useSupports()('listInvoices');
    return useQuery({ queryKey: subscriptionKeys.invoices(), queryFn: () => port.listInvoices(), enabled });
};

export const useBillingInfo = ({ enabled = true }: { enabled?: boolean } = {}) => {
    const port = usePort();
    return useQuery({ queryKey: subscriptionKeys.billingInfo(), queryFn: () => port.getBillingInfo(), enabled });
};

const useBillingInfoMutation = <T>(fn: (input: T) => Promise<BillingInfo>) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: info => queryClient.setQueryData(subscriptionKeys.billingInfo(), info),
    });
};

export const useRequestEmailCode = () => {
    const port = usePort();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (address: string) => port.requestEmailCode(address),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: subscriptionKeys.billingInfo() }),
    });
};

export const useResendEmailCode = () => {
    const port = usePort();
    return useMutation({ mutationFn: (emailId: string) => port.resendEmailCode(emailId) });
};

export const useAdoptSignInEmail = () => {
    const port = usePort();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => port.adoptSignInEmail(),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: subscriptionKeys.billingInfo() }),
    });
};

export const useReplaceEmail = () => {
    const port = usePort();
    return useBillingInfoMutation(({ emailId, newEmailId }: { emailId: string; newEmailId: string }) =>
        port.replaceEmail(emailId, newEmailId)
    );
};

export const useVerifyEmailCode = () => {
    const port = usePort();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ emailId, code }: { emailId: string; code: string }) => port.verifyEmailCode(emailId, code),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: subscriptionKeys.billingInfo() }),
    });
};

export const useSetPrimaryEmail = () => {
    const port = usePort();
    return useBillingInfoMutation((emailId: string) => port.setPrimaryEmail(emailId));
};

export const useSetEmailReceives = () => {
    const port = usePort();
    return useBillingInfoMutation(({ emailId, receives }: { emailId: string; receives: BillingEmailReceives }) =>
        port.setEmailReceives(emailId, receives)
    );
};

export const useRemoveEmail = () => {
    const port = usePort();
    return useBillingInfoMutation((emailId: string) => port.removeEmail(emailId));
};
