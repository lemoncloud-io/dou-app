import { throwIfApiError } from '@chatic/shared';
import { webCore } from '@chatic/web-core';

import type {
    UserView,
    CloudDelegationTokenView,
    RegisterDeviceTokenBody,
    UserTokenView,
    CloudView,
} from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { Params } from '@lemoncloud/lemon-web-core';
import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
const DOU_ENDPOINT = import.meta.env.VITE_DOU_ENDPOINT;

export const fetchUsers = async (params: Params): Promise<ListResult<UserView>> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${DOU_ENDPOINT}/hello/user/list`,
        })
        .setParams({ ...params })
        .execute<ListResult<UserView> & { error?: string }>();

    return throwIfApiError(data);
};

export const fetchClouds = async (params: Params = {}): Promise<ListResult<CloudView>> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${DOU_ENDPOINT}/clouds/0/list`,
        })
        .setParams({ ...params, view: 'mine' })
        .execute<ListResult<CloudView> & { error?: string }>();

    return throwIfApiError(data);
};

export const issueCloudDelegationToken = async (target: string): Promise<CloudDelegationTokenView> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${DOU_ENDPOINT}/users/0/delegate-cloud`,
        })
        .setBody({ target })
        .setParams({ legacy: false })
        .execute<CloudDelegationTokenView & { error?: string }>();

    return throwIfApiError(data);
};

export const registerDeviceToken = async (body: RegisterDeviceTokenBody): Promise<RegisterDeviceResult> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${DOU_ENDPOINT}/users/0/reg-dev`,
        })
        .setBody(body)
        .execute<RegisterDeviceResult & { error?: string }>();

    return throwIfApiError(data);
};

export const verifyNativeAppToken = async (body: VerifyNativeTokenBody): Promise<UserTokenView> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${DOU_ENDPOINT}/users/0/verify-native-token`,
        })
        .setParams({ token: 1 })
        .setBody(body)
        .execute<UserTokenView & { error?: string }>();

    return throwIfApiError(data);
};
