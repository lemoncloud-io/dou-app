import { simpleWebCore } from '@chatic/web-core';

import type {
    LoginUserBody,
    RegisterUserV2Body,
    UserBody,
    UserTokenView,
    UserView,
} from '@lemoncloud/chatic-backend-api';

const DOU_ENDPOINT = import.meta.env.VITE_DOU_ENDPOINT;

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
