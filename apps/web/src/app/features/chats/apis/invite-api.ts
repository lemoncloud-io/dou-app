import { webCore } from '@chatic/web-core';

import type { MyInviteView, MyUserInviteBody } from '@lemoncloud/chatic-backend-api';

const DOU_ENDPOINT = import.meta.env.VITE_DOU_ENDPOINT;

const APP_URL = import.meta.env.VITE_ENV === 'PROD' ? 'https://app.chatic.io' : 'https://app-dev.chatic.io';

export const inviteUser = async (body: MyUserInviteBody): Promise<MyInviteView> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${DOU_ENDPOINT}/users/0/invite`,
        })
        .setParams({ detail: '', expires: '1d' })
        .setBody(body)
        .execute<MyInviteView>();

    return data;
};

export const buildDeeplinkUrl = (code: string): string => `${APP_URL}/s/${code}`;
