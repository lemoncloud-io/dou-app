import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type { ChannelView, UserView, ChatView, JoinView, SiteView } from '@lemoncloud/chatic-socials-api';
import type { ChatMineInput } from '@lemoncloud/chatic-sockets-api';

export interface DomainScope {
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
    /** 타겟 사이트/플레이스 아이디  (값이 없을 경우; */
    sid?: string;
}

export interface DomainUser extends UserView {
    id: string;
    cid: string;
}

export interface DomainSite extends SiteView {
    id: string;
    cid: string;
    order: number;
}

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
