import { webCore } from '@chatic/web-core';

import type { LoginUserBody, UserBody, UserTokenView, UserView } from '@lemoncloud/chatic-backend-api';
import type { LemonOAuthToken } from '@lemoncloud/lemon-web-core';

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
        .setParams({ token: 1 })
        .setBody(body)
        .execute<UserTokenView>();

    await webCore.buildCredentialsByToken(data.Token as LemonOAuthToken);

    return data;
};
