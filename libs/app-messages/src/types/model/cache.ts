import type { ChannelView, ChatView, JoinView, UserView } from '@lemoncloud/chatic-socials-api';
import type { MyInviteView, MySiteView } from '@lemoncloud/chatic-backend-api';

/** 캐시 가능한 도메인 타입 정의 */
export type CacheType = 'channel' | 'chat' | 'user' | 'join' | 'site' | 'invitecloud';

/** 페이징 및 리스트 처리를 위한 공통 메타데이터 */
export interface PagingMeta {
    page?: number; // 페이지 번호
    cursorNo?: number; // 커서 번호
    limit?: number; // 한 페이지당 아이템 수
    total?: number; // 전체 아이템 수
    readNo?: number; // 마지막으로 읽은 메시지 번호
    took?: number;
}

/** 모든 캐시 메시지의 공통 기반 필드 */
interface CacheBasePayload<K extends CacheType> {
    type: K; // 도메인 타입
    cid: string; // Cloud ID
}

/*
 * 각 CacheType이 실제로 어떤 데이터 구조를 가지는지 매핑합니다.
 */
export interface CacheModelMap {
    channel: CacheChannelView;
    chat: CacheChatView;
    invitecloud: CacheCloudView;
    join: CacheJoinView;
    site: CacheSiteView;
    user: CacheUserView;
}

/** 클라우드/서버 정보 뷰 */
export interface CacheCloudView extends MyInviteView {
    id: string;
    name?: string;
    backend?: string;
    wss?: string;
}

/** 채널 정보 뷰 (Site ID 포함) */
export interface CacheChannelView extends ChannelView {
    sid: string;
    isNotificationEnabled: boolean;
}

/** 채팅 메시지 뷰 (전송 상태 포함) */
export interface CacheChatView extends ChatView {
    isPending?: boolean; // 전송 중 여부
    isFailed?: boolean; // 전송 실패 여부
}

/** 사이트 정보 뷰 */
export interface CacheSiteView extends MySiteView {
    cid: string;
    order?: number;
}

export interface CacheJoinView extends JoinView {}

export interface CacheUserView extends UserView {}

/**
 *
 * FetchAll/SaveAll 시 어떤 조건(정렬, 필터 등)으로 데이터를식별할지 정의합니다.
 */
export interface BaseQueryOptions {
    cid?: string;
}

/** 채널 목록 조회 쿼리 */
export interface ChannelQueryOptions extends BaseQueryOptions {
    sid?: string; // 특정 사이트 내 채널 필터
    keyword?: string; // 검색 키워드
}

/** 채팅 목록 조회 쿼리 */
export interface ChatQueryOptions extends BaseQueryOptions {
    channelId?: string; // 특정 채널 내 메시지 필터
    sort?: 'asc' | 'desc'; // 정렬 순서
}

export interface InviteCloudQueryOptions extends BaseQueryOptions {}

/** 참여 정보 조회 쿼리 */
export interface JoinQueryOptions extends BaseQueryOptions {
    channelId?: string;
    userId?: string;
}

/** 유저 정보 쿼리 */
export interface UserQueryOptions extends BaseQueryOptions {}

/** 사이트 정보 쿼리 */
export interface SiteQueryOptions extends BaseQueryOptions {}

/** 도메인별 쿼리 옵션 매핑 */
export interface CacheQueryMap {
    channel: ChannelQueryOptions;
    chat: ChatQueryOptions;
    user: UserQueryOptions;
    site: SiteQueryOptions;
    join: JoinQueryOptions;
    invitecloud: InviteCloudQueryOptions;
}

/** [요청] ID 기반 단일 데이터 조회 */
export type FetchCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string };
}[CacheType];

/** [응답] 단일 데이터 반환 (없으면 item은 null) */
export type OnFetchCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string; item: CacheModelMap[K] | null };
}[CacheType];

/** [요청] 다수/페이징 데이터 조회 (query와 meta를 조합하여 캐시 키 생성) */
export type FetchAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

/** [응답] 다수 데이터 반환 */
export type OnFetchAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        items: CacheModelMap[K][] | null;
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

/** [요청] 단일 데이터 저장 */
export type SaveCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string; item: CacheModelMap[K] };
}[CacheType];

/** [응답] 단일 저장 결과 */
export type OnSaveCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string | null; success: boolean };
}[CacheType];

/** [요청] 다수 데이터 저장 (페이징 인덱싱 포함) */
export type SaveAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        query?: CacheQueryMap[K] & PagingMeta;
        items: CacheModelMap[K][];
    };
}[CacheType];

/** [응답] 다수 저장 결과 */
export type OnSaveAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        ids: string[];
        success: boolean;
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

/** [요청] 단일 삭제 */
export type DeleteCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string };
}[CacheType];

/** [응답] 단일 삭제 결과 */
export type OnDeleteCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string | null; success: boolean };
}[CacheType];

/** [요청] 다수 ID 기반 삭제 */
export type DeleteAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[] };
}[CacheType];

/** [응답] 다수 삭제 결과 */
export type OnDeleteAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[]; success: boolean };
}[CacheType];

/** [요청] 특정 도메인 테이블 전체 삭제 */
export type ClearCacheDataPayload = {
    [K in CacheType]: { type: K };
}[CacheType];

/** [응답] 초기화 결과 */
export type OnClearCacheDataPayload = {
    [K in CacheType]: { type: K; success: boolean };
}[CacheType];

/** [요청] 키워드 기반 전역 검색 */
export interface SearchGlobalCacheDataPayload {
    keyword: string;
    cid?: string;
}

/** [응답] 전역 검색 결과 리스트 */
export interface OnSearchGlobalCacheDataPayload {
    items: (CacheChatView | CacheChannelView | CacheSiteView)[];
}
