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

/** #0. Google 결제 검증 */
export const useValidateGoogle = () =>
    useCustomMutation<ValidateAPIResponse, string, { body: ValidateAPIBody; params: Params }>(({ body, params }) =>
        validateGoogle(body, params)
    );

/** #0. Apple 결제 검증 */
export const useValidateApple = () =>
    useCustomMutation<ValidateAPIResponse, string, { body: ValidateAPIBody; params: Params }>(({ body, params }) =>
        validateApple(body, params)
    );

/** #0. 멤버십 검증 */
export const useValidateMembership = () =>
    useCustomMutation<MembershipView, string, { body: CreateMembershipBody; params?: Params }>(({ body, params }) =>
        validateMembership(body, params)
    );

/** #1. 활성 구독 확인 (선언형) */
export const useActiveSubscriptions = (params: ListValidateParam) =>
    useQuery<ListResult<ReceiptModel>>({
        queryKey: subscriptionKeys.list(params),
        queryFn: () => fetchActiveSubscriptions(params),
        refetchOnWindowFocus: false,
    });

/** #1. 활성 구독 확인 (명령형) */
export const useFetchActiveSubscriptions = () =>
    useCustomMutation<ListResult<ReceiptModel>, string, ListValidateParam>(params => fetchActiveSubscriptions(params));

/** #2. 영수증 상세 조회 */
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

/** 멤버십 정보 조회 */
export const useMembershipInfo = () =>
    useQuery<MembershipView>({
        queryKey: subscriptionKeys.detail('mine'),
        queryFn: fetchMembershipInfo,
        refetchOnWindowFocus: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });

/** 현재 디바이스 플랫폼과 구독 플랫폼이 일치하는지 확인 */
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
