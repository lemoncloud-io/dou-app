import { webCore } from '@chatic/web-core';

import type { LoginUserBody, UserBody, UserTokenView, UserView } from '@lemoncloud/chatic-backend-api';

const DOU_ENDPOINT = import.meta.env.VITE_DOU_ENDPOINT;

export const registerUser = async (body: UserBody): Promise<UserView> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${DOU_ENDPOINT}/oauth/register-user`,
        })
        .setBody(body)
        .execute<UserView>();

    return data;
};

export const login = async (body: LoginUserBody): Promise<UserTokenView> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${DOU_ENDPOINT}/oauth/login-user`,
        })
        .setBody(body)
        .execute<UserTokenView>();

    return data;
};
