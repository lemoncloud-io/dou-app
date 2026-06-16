import { webCore } from '@chatic/web-core';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

/**
 * Non-consuming invite-code lookup (no expiry/consume stamp).
 * GET <backend>/hello/invite-code?code=<code>
 * Used to resolve $envs.wss / cloudId / siteId for the target deployment.
 * Replicated from apps/web (chats/apis/invite-api) since that lives in the web app, not a lib.
 */
export const fetchInviteCodeInfo = async (code: string, backend: string): Promise<MyInviteView> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${backend}/hello/invite-code`,
        })
        .setParams({ code })
        .execute<MyInviteView>();

    return data;
};
