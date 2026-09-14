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
} from '@chatic/app-messages';

export type DomainChannel = CacheChannelView;
export type DomainChat = CacheChatView;
export type DomainJoin = CacheJoinView;

// Re-export the chat enums so apps reference `subType`/`stereo` values through the data layer
// rather than reaching into the upstream socials-api package. The fields themselves already flow
// onto DomainChat/DomainChannel via ChatView/ChannelView inheritance.
export type { ChatStereo, ChatSubType } from '@lemoncloud/chatic-socials-api';

/** The local-only payload a repository uses when reading a join list. */
export interface DomainJoinListPayload {
    channelId?: string;
    activeOnly?: boolean;
}

export interface DomainChannelListPayload extends ChatMineInput {
    /** Target site/place id (when absent). */
    sid?: string;
}

export type DomainUser = CacheUserView;
export type DomainPlace = CacheSiteView;

export type DomainProfile = CacheProfileView;

export interface DomainProfileListPayload {
    /** V2 prefers `sid`/`uid` but still accepts API-shaped aliases. */
    sid?: string;
    uid?: string;
    siteId?: string;
    userId?: string;
}

export type SiteProfileBody = ProfileBody;
export type SiteProfileView = DomainProfile;
export type DomainCloud = CacheCloudView;

/** Sender-side relay 1:1 invite card, credential fields (code/deeplink) already stripped. */
export type DomainInvite = CacheInviteView;

/**
 * The standard wrapper for a domain list.
 * It keeps the existing ListResult shape and adds `meta` to carry the common sync/integrity
 * information.
 */
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
