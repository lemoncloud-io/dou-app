import { throwIfApiError } from '@chatic/shared';
import { webCore } from '@chatic/web-core';

import type {
    ValidateAPIBody,
    ValidateAPIResponse,
    ListValidateParam,
} from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/views';
import type { ReceiptModel } from '@lemoncloud/chatic-iap-api/dist/modules/in-app-pay/model';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { Params } from '@lemoncloud/lemon-web-core';

const IAP_ENDPOINT = import.meta.env.VITE_IAP_ENDPOINT;

/** #0. Google 구독 결제 검증 */
export const validateGoogle = async (body: ValidateAPIBody, params: Params = {}): Promise<ValidateAPIResponse> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${IAP_ENDPOINT}/validate/google`,
        })
        .setParams({ ...params })
        .setBody(body)
        .execute<ValidateAPIResponse>();

    return throwIfApiError(data);
};

/** #0. Apple 구독 결제 검증 */
export const validateApple = async (body: ValidateAPIBody, params: Params = {}): Promise<ValidateAPIResponse> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${IAP_ENDPOINT}/validate/apple`,
        })
        .setParams({ ...params })
        .setBody(body)
        .execute<ValidateAPIResponse>();

    return throwIfApiError(data);
};

/** #1. 활성 구독 확인 (본인) */
export const fetchActiveSubscriptions = async (params: ListValidateParam): Promise<ListResult<ReceiptModel>> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${IAP_ENDPOINT}/validate`,
        })
        .setParams({ ...params, active: 1 })
        .execute<ListResult<ReceiptModel>>();

    return throwIfApiError(data);
};

/** #2. 구독(영수증) 상세 조회 */
export const fetchReceiptDetail = async (
    receiptId: string,
    params?: { v?: string | boolean; history?: string | boolean }
): Promise<ValidateAPIResponse> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${IAP_ENDPOINT}/validate/${receiptId}`,
        })
        .setParams({ ...params })
        .execute<ValidateAPIResponse>();

    return throwIfApiError(data);
};
