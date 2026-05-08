import type { CloudView, UserView } from '@lemoncloud/chatic-backend-api';
import type { ChannelView, ChatFeedResult, ChatView, JoinView, SiteView } from '@lemoncloud/chatic-socials-api';
import type { ListResult } from '../events/common';
import type { ChatMinePayload } from '@lemoncloud/chatic-sockets-api';

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

export interface DomainChannelListPayload extends ChatMinePayload {
    /** 타겟 사이트/플레이스 아이디  (값이 없을 경우; */
    sid?: string;
}

export interface DomainUser extends UserView {
    id: string;
    cid: string;
    channelIds: string[];
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

export interface DomainChatFeedResult extends Omit<ChatFeedResult, 'list'> {
    list: DomainChat[];
}

export interface DomainListMeta {
    /** 실제 리스트 아이템 길이와 무관하게, 서버/캐시가 보고하는 전체 개수 */
    totalCount: number;
    /** 해당 리스트 스냅샷이 마지막으로 갱신된 시각(epoch ms) */
    lastUpdatedAt: number;
    /** 리스트 데이터 출처 */
    source?: 'local' | 'remote' | 'fallback';
}

/**
 * 도메인 리스트 표준 래퍼입니다.
 * 기존 ListResult를 유지하면서 meta를 추가해 공통적인 동기화/무결성 정보를 관리합니다.
 */
export interface DomainListResult<T, R = any> extends ListResult<T, R> {
    meta: DomainListMeta;
}

export const createDomainListResult = <T, R = any>(
    result: ListResult<T, R>,
    meta?: Partial<DomainListMeta>
): DomainListResult<T, R> => {
    const list = result.list || [];
    const totalCount = result.total ?? list.length;
    return {
        ...result,
        list,
        total: totalCount,
        meta: {
            totalCount,
            lastUpdatedAt: meta?.lastUpdatedAt ?? Date.now(),
            source: meta?.source,
        },
    };
};
