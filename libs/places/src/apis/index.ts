import { DOU_ENDPOINT, webCore } from '@chatic/web-core';

import type { ListResult } from '@chatic/shared';
import type { Params } from '@lemoncloud/lemon-web-core';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';

export const fetchPlaces = async (params: Params): Promise<ListResult<MySiteView>> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${DOU_ENDPOINT}/users/0/places`,
        })
        .setParams(params)
        .execute<ListResult<MySiteView>>();

    return data;
};
