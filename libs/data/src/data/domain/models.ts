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

/** join 목록 조회 시 Repository에서 사용하는 local 전용 payload입니다. */
export interface DomainJoinListPayload {
    channelId?: string;
    activeOnly?: boolean;
}

export interface DomainChannelListPayload extends ChatMineInput {
    /** 타겟 사이트/플레이스 아이디  (값이 없을 경우); */
    sid?: string;
}

export type DomainUser = CacheUserView;
export type DomainPlace = CacheSiteView;

/** @deprecated Use {@link DomainPlace}. Site was consolidated into the Place domain. */
export type DomainSite = DomainPlace;

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

/** @deprecated Use {@link DomainCloud}. InviteCloud was consolidated into the Cloud domain. */
export type DomainInviteCloud = DomainCloud;

/** Sender-side relay 1:1 invite card, credential fields (code/deeplink) already stripped. */
export type DomainInvite = CacheInviteView;

/**
 * 도메인 리스트 표준 래퍼입니다.
 * 기존 ListResult를 유지하면서 meta를 추가해 공통적인 동기화/무결성 정보를 관리합니다.
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
