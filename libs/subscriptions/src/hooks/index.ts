import { useQuery } from '@tanstack/react-query';

import { createQueryKeys, useCustomMutation } from '@chatic/shared';
import { useDeviceInfo } from '@chatic/device-utils';

import {
    deleteCloud,
    fetchActiveSubscriptions,
    fetchMembershipInfo,
    fetchPlans,
    fetchReceiptDetail,
    validateApple,
    validateGoogle,
    validateMembership,
} from '../apis';

import type {
    ValidateAPIBody,
    ValidateAPIResponse,
    ListValidateParam,
} from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/views';
import type { ReceiptModel } from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/model';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { Params } from '@lemoncloud/lemon-web-core';
import type { CloudView, CreateMembershipBody, MembershipView } from '@lemoncloud/chatic-backend-api';

export const subscriptionKeys = createQueryKeys('subscriptions');
export const membershipKeys = createQueryKeys('memberships');
export const productPlansKeys = createQueryKeys('productPlans');

/**
 * Mutation for validating a Google Play receipt.
 */
export const useValidateGoogle = () =>
    useCustomMutation<ValidateAPIResponse, string, { body: ValidateAPIBody; params: Params }>(({ body, params }) =>
        validateGoogle(body, params)
    );

/**
 * Mutation for validating an App Store receipt.
 */
export const useValidateApple = () =>
    useCustomMutation<ValidateAPIResponse, string, { body: ValidateAPIBody; params: Params }>(({ body, params }) =>
        validateApple(body, params)
    );

/**
 * Mutation for membership creation and validation.
 */
export const useValidateMembership = () =>
    useCustomMutation<MembershipView, string, { body: CreateMembershipBody; params?: Params }>(({ body, params }) =>
        validateMembership(body, params)
    );

/**
 * Declarative React Query hook for the active subscription list.
 */
export const useActiveSubscriptions = (params: ListValidateParam) =>
    useQuery<ListResult<ReceiptModel>>({
        queryKey: subscriptionKeys.list(params as unknown as Record<string, unknown>),
        queryFn: () => fetchActiveSubscriptions(params),
        refetchOnWindowFocus: false,
    });

/**
 * Exposes active subscription fetching as an imperative mutation.
 */
export const useFetchActiveSubscriptions = () =>
    useCustomMutation<ListResult<ReceiptModel>, string, ListValidateParam>(params => fetchActiveSubscriptions(params));

/**
 * Mutation for fetching the details of a specific receipt.
 */
export const useFetchReceiptDetail = () =>
    useCustomMutation<
        ValidateAPIResponse,
        string,
        { receiptId: string; params?: { v?: string | boolean; history?: string | boolean } }
    >(({ receiptId, params }) => fetchReceiptDetail(receiptId, params));

/**
 * Query hook for the list of purchasable product plans.
 */
export const useProductPlans = (params: Params = {}) =>
    useQuery({
        queryKey: productPlansKeys.list(params),
        queryFn: () => fetchPlans(params),
        refetchOnWindowFocus: false,
    });

/**
 * Query hook for the current signed-in user's membership status.
 */
export const useMembershipInfo = () =>
    useQuery<MembershipView>({
        queryKey: subscriptionKeys.detail('mine'),
        queryFn: fetchMembershipInfo,
        refetchOnWindowFocus: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });

/**
 * Computes whether the current device platform matches the platform of the active subscription.
 * Returns availability, loading state, and the raw membership payload together.
 */
export const useIsSubscriptionAvailable = () => {
    const { data: membership, isLoading } = useMembershipInfo();
    const { deviceInfo } = useDeviceInfo();

    const isPlatformMatch =
        (membership?.platform === 'apple' && deviceInfo?.platform === 'ios') ||
        (membership?.platform === 'google' && deviceInfo?.platform === 'android');

    return {
        isAvailable: membership?.isValid === true && isPlatformMatch,
        isLoading,
        membership,
    };
};

/**
 * Mutation for the cloud release request.
 */
export const useDeleteCloud = () =>
    useCustomMutation<CloudView, string, { id: string; params?: Params }>(({ id, params }) => deleteCloud(id, params));
