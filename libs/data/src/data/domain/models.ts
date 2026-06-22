import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type {
    ChannelView,
    ChatView,
    JoinView,
    ProfileBody,
    ProfileDisplay,
    ProfileView,
    SiteView,
    UserView,
} from '@lemoncloud/chatic-socials-api';
import type { ChatMineInput } from '@lemoncloud/chatic-sockets-api';

export interface DomainScope {
    /** Normalized repository scope aliases used by V2 modules. */
    cid: string;
    uid?: string;
    sid?: string;
}

export interface DomainChannel extends ChannelView {
    id: string;
    cid: string;
    sid: string;
    isNotificationEnabled: boolean;
    lastActivityAt: number;
}

export interface DomainChat extends ChatView {
    id: string;
    cid: string;
    channelId: string;
    chatNo: number;
    isPending: boolean;
    isFailed: boolean;
    createdAtMs: number;
    updatedAtMs: number;
    tempId?: string;
}

export interface DomainJoin extends JoinView {
    id: string;
    cid: string;
    channelId: string;
    userId: string;
    joined: number;
    readNo: number;
}

/** join 목록 조회 시 Repository에서 사용하는 local 전용 payload입니다. */
export interface DomainJoinListPayload {
    channelId?: string;
    activeOnly?: boolean;
}

export interface DomainChannelListPayload extends ChatMineInput {
    /** 타겟 사이트/플레이스 아이디  (값이 없을 경우); */
    sid?: string;
}

export interface DomainUser extends UserView {
    id: string;
    cid: string;
}

export interface DomainPlace extends SiteView {
    id: string;
    cid: string;
    order: number;
}

/** @deprecated Use {@link DomainPlace}. Site was consolidated into the Place domain. */
export type DomainSite = DomainPlace;

export interface DomainProfile extends ProfileView, Partial<ProfileDisplay> {
    id: string;
    cid: string;
    sid: string;
    uid: string;
    /** `userId` is retained for API compatibility while V2 logic uses `uid` internally. */
    userId: string;
    updatedAtMs: number;
}

export interface DomainProfileListPayload {
    /** V2 prefers `sid`/`uid` but still accepts API-shaped aliases. */
    sid?: string;
    uid?: string;
    siteId?: string;
    userId?: string;
}

export type SiteProfileBody = ProfileBody;
export type SiteProfileView = DomainProfile;

export interface DomainInviteCloud extends CloudView {
    id: string;
    cid: string;
    name?: string;
    backend?: string;
    wss?: string;
}

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
