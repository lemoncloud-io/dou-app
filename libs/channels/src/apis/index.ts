import { simpleWebCore } from '@chatic/web-core';

import type { ListResult } from '@chatic/shared';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { Params } from '@lemoncloud/lemon-web-core';

const VITE_SOC_ENDPOINT = import.meta.env.VITE_SOC_ENDPOINT || '';

export const fetchChannels = async (params: Params): Promise<ListResult<ChannelView>> => {
    console.log(VITE_SOC_ENDPOINT, 'VITE_SOC_ENDPOINT');
    const { data } = await simpleWebCore
        .buildRequest({
            method: 'GET',
            baseURL: `${VITE_SOC_ENDPOINT}/channels/0/mine`,
        })
        .setParams(params)
        .execute<ListResult<ChannelView>>();

    return data;
};
