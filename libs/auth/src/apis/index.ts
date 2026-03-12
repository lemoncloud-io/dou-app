import { simpleWebCore, webCore, cloudCore } from '@chatic/web-core';

import type {
    CloudExchangeTokenBody,
    LoginUserBody,
    RegisterUserV2Body,
    UserBody,
    UserTokenView,
    UserView,
} from '@lemoncloud/chatic-backend-api';
import type { OAuthRefreshBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

const DOU_ENDPOINT = import.meta.env.VITE_DOU_ENDPOINT;

export const registerDevice = async (deviceId: string): Promise<UserTokenView> => {
    const { data } = await webCore
        .buildRequest({
            method: 'POST',
            baseURL: `${DOU_ENDPOINT}/oauth/register-device`,
        })
        .setBody({ deviceId })
        .execute<UserTokenView>();

    return data;
};

export const registerUser = async (body: UserBody): Promise<UserView> => {
    const { data } = await simpleWebCore
        .buildRequest({
            method: 'POST',
            baseURL: `${DOU_ENDPOINT}/oauth/register-user`,
        })
        .setBody(body)
        .execute<UserView>();

    return data;
};

export const registerUserV2 = async (body: RegisterUserV2Body, email?: boolean): Promise<UserView> => {
    const { data } = await simpleWebCore
        .buildRequest({
            method: 'POST',
            baseURL: `${DOU_ENDPOINT}/oauth/register-user-v2`,
        })
        .setParams(email !== undefined ? { email: email ? 'true' : 'false' } : {})
        .setBody(body)
        .execute<UserView>();

    return data;
};

export const login = async (body: LoginUserBody, email?: boolean): Promise<UserTokenView> => {
    const { data } = await simpleWebCore
        .buildRequest({
            method: 'POST',
            baseURL: `${DOU_ENDPOINT}/oauth/login-user`,
        })
        .setParams({ token: 1, ...(email !== undefined && { email: email ? 'true' : 'false' }) })
        .setBody(body)
        .execute<UserTokenView>();

    return data;
};

export const issueCloudToken = async (baseURL: string, body: CloudExchangeTokenBody): Promise<UserTokenView> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${baseURL}/oauth/exchange-token`,
        })
        .setBody({ ...body })
        .execute<UserTokenView>();

    return data;
};

export const refreshCloudToken = async (authId: string, body: OAuthRefreshBody): Promise<UserTokenView> => {
    const backend = cloudCore.getBackend();
    const { data } = await cloudCore
        .buildRequest({
            method: 'POST',
            baseURL: `${backend}/oauth/${authId}/refresh-token`,
        })
        .setParams({ token: 1 })
        .setBody({ ...body })
        .execute<UserTokenView>();

    return data;
};
