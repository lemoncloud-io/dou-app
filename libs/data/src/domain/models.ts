import type { ProfileBody } from '@lemoncloud/chatic-socials-api';
import type { ChatMineInput } from '@lemoncloud/chatic-sockets-api';
import type {
    CacheChannelView,
    CacheChatView,
    CacheCloudView,
    CacheInviteView,
    CacheJoinView,
    CacheProfileView,
    CacheSiteView,
    CacheUserView,
} from '@chatic/bridge-messages';

export type DomainChannel = CacheChannelView;
export type DomainChat = CacheChatView;
export type DomainJoin = CacheJoinView;

export type { ChatStereo, ChatSubType } from '@lemoncloud/chatic-socials-api';

export interface DomainJoinListPayload {
    channelId?: string;
    activeOnly?: boolean;
}

export interface DomainChannelListPayload extends ChatMineInput {
    sid?: string;
}

export type DomainUser = CacheUserView;

export type DomainPlaceMember = Pick<DomainUser, 'id' | 'cid' | 'name' | 'nick' | 'thumbnail'> & {
    isOwner?: boolean;
};
export type DomainPlace = CacheSiteView;

export type DomainProfile = CacheProfileView;

export interface DomainProfileListPayload {
    sid?: string;
    uid?: string;
    siteId?: string;
    userId?: string;
}

export type SiteProfileBody = ProfileBody;
export type SiteProfileView = DomainProfile;
export type DomainCloud = CacheCloudView;

export type DomainInvite = CacheInviteView;

export interface DomainListResult<TModel> {
    list: TModel[];
    meta: ListMetaData;
}

export interface ListMetaData {
    total: number;
    limit?: number;
    page?: number;
    cursorNo?: number;
    readNo?: number;
    source?: 'local' | 'remote' | 'fallback';
}

export const createDomainListResult = <T>(list: T[], meta: ListMetaData): DomainListResult<T> => {
    return { list, meta };
};
