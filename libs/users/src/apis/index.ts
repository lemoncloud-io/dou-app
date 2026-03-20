import { webCore } from '@chatic/web-core';

import type {
    UserView,
    CloudDelegationTokenView,
    RegisterDeviceTokenBody,
    UserTokenView,
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
        .execute<ListResult<UserView>>();

    return data;
};

export const issueCloudDelegationToken = async (target: string): Promise<CloudDelegationTokenView> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${DOU_ENDPOINT}/users/0/delegate-cloud`,
        })
        .setBody({ target })
        .execute<CloudDelegationTokenView>();

    return data;
};

export const registerDeviceToken = async (body: RegisterDeviceTokenBody): Promise<RegisterDeviceResult> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${DOU_ENDPOINT}/users/0/reg-dev`,
        })
        .setBody(body)
        .execute<RegisterDeviceResult>();

    return data;
};

export const verifyNativeAppToken = async (body: VerifyNativeTokenBody): Promise<UserTokenView> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${DOU_ENDPOINT}/users/0/verify-native-token`,
        })
        .setParams({ token: 1 })
        .setBody(body)
        .execute<UserTokenView>();

    return data;
};
