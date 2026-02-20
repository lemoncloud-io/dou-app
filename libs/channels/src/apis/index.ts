import { simpleWebCore } from '@chatic/web-core';

import type { ListResult } from '@chatic/shared';
import type {
    ChannelView,
    ChatStartBody,
    ChannelLeaveBody,
    JoinView,
    ChannelInviteBody,
    UserView,
} from '@lemoncloud/chatic-socials-api';
import type { Params } from '@lemoncloud/lemon-web-core';

const VITE_SOC_ENDPOINT = import.meta.env.VITE_SOC_ENDPOINT || '';

export const fetchPublicChannels = async (params: Params): Promise<ListResult<ChannelView>> => {
    const { data } = await simpleWebCore
        .buildRequest({
            method: 'GET',
            baseURL: `${VITE_SOC_ENDPOINT}/hello/channel/list`,
        })
        .setParams(params)
        .execute<ListResult<ChannelView>>();

    return data;
};

export const fetchChannels = async (params: Params): Promise<ListResult<ChannelView>> => {
    const { data } = await simpleWebCore
        .buildRequest({
            method: 'GET',
            baseURL: `${VITE_SOC_ENDPOINT}/channels/0/mine`,
        })
        .setParams(params)
        .execute<ListResult<ChannelView>>();

    return data;
};

export const createPublicChannel = async (body: ChatStartBody): Promise<ChannelView> => {
    const { data } = await simpleWebCore
        .buildRequest({
            method: 'POST',
            baseURL: `${VITE_SOC_ENDPOINT}/hello/chat-start`,
        })
        .setBody(body)
        .execute<ChannelView>();
    return data;
};

export const leavePublicChannel = async (id: string, body: ChannelLeaveBody): Promise<JoinView> => {
    const { data } = await simpleWebCore
        .buildRequest({
            method: 'POST',
            baseURL: `${VITE_SOC_ENDPOINT}/hello/chat-leave`,
        })
        .setParams({ id })
        .setBody(body)
        .execute<JoinView>();

    return data;
};

export const invitePublicChannel = async (id: string, body: ChannelInviteBody): Promise<ChannelView> => {
    const { data } = await simpleWebCore
        .buildRequest({
            method: 'POST',
            baseURL: `${VITE_SOC_ENDPOINT}/hello/chat-invite`,
        })
        .setParams({ id })
        .setBody(body)
        .execute<ChannelView>();

    return data;
};

export const fetchUsersInChannel = async (id: string, params: Params): Promise<ListResult<UserView>> => {
    const { data } = await simpleWebCore
        .buildRequest({
            method: 'GET',
            baseURL: `${VITE_SOC_ENDPOINT}/channels/${id}/users`,
        })
        .setParams(params)
        .execute<ListResult<UserView>>();

    return data;
};
