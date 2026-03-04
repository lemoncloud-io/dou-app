/**
 * Invite API Service
 *
 * Backend API for creating user invites.
 * POST /dou-d1/users/0/invite?detail&expires=1d
 */

import { webCore } from '@chatic/web-core';

import type { MyInviteView, MyUserInviteBody } from '@lemoncloud/chatic-backend-api';

const DOU_ENDPOINT = import.meta.env.VITE_DOU_ENDPOINT;

/**
 * Create a user invite via backend API
 *
 * @param body - Invite body with channelId and name
 * @returns MyInviteView with userId and invite data
 */
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
