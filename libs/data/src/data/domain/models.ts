import type { CloudView, UserView } from '@lemoncloud/chatic-backend-api';
import type { ChannelView, ChatFeedResult, ChatView, JoinView, SiteView } from '@lemoncloud/chatic-socials-api';
import type { ListResult } from '../events/common';

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

export type DomainListResult<T, R = any> = ListResult<T, R>;
