import { webCore } from '@chatic/web-core';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

/**
 * 초대 코드 정보 조회 (비소비 — 만료검사/소비스탬프 없음)
 * GET <backend>/hello/invite-code?code=<inviteCode>
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
