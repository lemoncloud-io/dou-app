import { webCore } from '@chatic/web-core';

import type { UserView } from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { Params } from '@lemoncloud/lemon-web-core';

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
