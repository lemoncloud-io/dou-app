import { simpleWebCore } from '@chatic/web-core';

import type { ListResult } from '@chatic/shared';
import type { Params } from '@lemoncloud/lemon-web-core';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

const VITE_DOU_ENDPOINT = import.meta.env.VITE_DOU_ENDPOINT || '';

export const fetchPlaces = async (params: Params): Promise<ListResult<MySiteView>> => {
    const { data } = await simpleWebCore
        .buildRequest({
            method: 'GET',
            baseURL: `${VITE_DOU_ENDPOINT}/places`,
        })
        .setParams(params)
        .execute<ListResult<MySiteView>>();

    return data;
};
