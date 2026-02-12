import { useQuery } from '@tanstack/react-query';

import { createQueryKeys, useCustomMutation } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { createPublicChannel, fetchChannels, fetchPublicChannels } from '../apis';

import type { ListResult } from '@chatic/shared';
import type { ChannelView, ChatStartBody } from '@lemoncloud/chatic-socials-api';
import type { Params } from '@lemoncloud/lemon-web-core';
import type { AxiosError } from 'axios';

export const channelsKeys = createQueryKeys('channels');
export const publicChannelsKeys = createQueryKeys('public-channels');

export const useChannels = (params: Params = {}) =>
    useQuery<ListResult<ChannelView>>({
        queryKey: channelsKeys.list(params),
        queryFn: () => fetchChannels(params),
        refetchOnWindowFocus: false,
    });

export const usePublicChannels = (params: Params = {}) =>
    useQuery<ListResult<ChannelView>>({
        queryKey: publicChannelsKeys.list(params),
        queryFn: () => fetchPublicChannels(params),
        refetchOnWindowFocus: false,
    });

export const useCreatePublicChannel = () => {
    const { toast } = useToast();

    return useCustomMutation<ChannelView, AxiosError<string>, ChatStartBody>(createPublicChannel, {
        onSuccess: () => toast({ title: '채널이 생성되었습니다' }),
        onError: error =>
            toast({ title: '채널 생성 실패', description: error.response?.data || '오류가 발생했습니다' }),
    });
};
