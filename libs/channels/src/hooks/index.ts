import { useQuery } from '@tanstack/react-query';

import { fetchChannels } from '../apis';

import type { ListResult } from '@chatic/shared';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { Params } from '@lemoncloud/lemon-web-core';

export const channelsKeys = {
    all: ['channels'] as const,
    lists: () => [...channelsKeys.all, 'list'] as const,
    list: () => [...channelsKeys.lists()] as const,
};

export const useChannels = (params: Params) =>
    useQuery<ListResult<ChannelView>>({
        queryKey: channelsKeys.list(),
        queryFn: () => fetchChannels(params),
        refetchOnWindowFocus: false,
    });
