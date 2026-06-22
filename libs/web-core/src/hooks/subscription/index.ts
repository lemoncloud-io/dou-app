import { useQuery } from '@tanstack/react-query';

import { useDeviceInfo } from '@chatic/device-utils';

import {
    deleteCloud,
    fetchActiveSubscriptions,
    fetchMembershipInfo,
    fetchPlans,
    fetchReceiptDetail,
    productPlansKeys,
    subscriptionKeys,
    validateApple,
    validateGoogle,
    validateMembership,
} from '../../api';

import type {
    ListValidateParam,
    ValidateAPIBody,
    ValidateAPIResponse,
} from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/views';
import type { ReceiptModel } from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/model';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { Params } from '@lemoncloud/lemon-web-core';
import type { CloudView, CreateMembershipBody, MembershipView } from '@lemoncloud/chatic-backend-api';
import { useCustomMutation } from '@chatic/shared';

export const useValidateGoogle = () =>
    useCustomMutation<ValidateAPIResponse, string, { body: ValidateAPIBody; params: Params }>(({ body, params }) =>
        validateGoogle(body, params)
    );

export const useValidateApple = () =>
    useCustomMutation<ValidateAPIResponse, string, { body: ValidateAPIBody; params: Params }>(({ body, params }) =>
        validateApple(body, params)
    );

export const useValidateMembership = () =>
    useCustomMutation<MembershipView, string, { body: CreateMembershipBody; params?: Params }>(({ body, params }) =>
        validateMembership(body, params)
    );

export const useActiveSubscriptions = (params: ListValidateParam) =>
    useQuery<ListResult<ReceiptModel>>({
        queryKey: subscriptionKeys.list(params as unknown as Record<string, unknown>),
        queryFn: () => fetchActiveSubscriptions(params),
        refetchOnWindowFocus: false,
    });

export const useFetchActiveSubscriptions = () =>
    useCustomMutation<ListResult<ReceiptModel>, string, ListValidateParam>(params => fetchActiveSubscriptions(params));

export const useFetchReceiptDetail = () =>
    useCustomMutation<
        ValidateAPIResponse,
        string,
        { receiptId: string; params?: { v?: string | boolean; history?: string | boolean } }
    >(({ receiptId, params }) => fetchReceiptDetail(receiptId, params));

export const useProductPlans = (params: Params = {}) =>
    useQuery({
        queryKey: productPlansKeys.list(params),
        queryFn: () => fetchPlans(params),
        refetchOnWindowFocus: false,
    });

export const useMembershipInfo = () =>
    useQuery<MembershipView>({
        queryKey: subscriptionKeys.detail('mine'),
        queryFn: fetchMembershipInfo,
        refetchOnWindowFocus: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });

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

export const useDeleteCloud = () =>
    useCustomMutation<CloudView, string, { id: string; params?: Params }>(({ id, params }) => deleteCloud(id, params));
