import type { ChannelView, ChatView, JoinView, UserView } from '@lemoncloud/chatic-socials-api';
import type { SiteView, UserTokenView } from '@lemoncloud/chatic-backend-api';

/**
 * 캐시 데이터 타입
 * @author dev@example.com
 */
export type CacheType = 'channel' | 'chat' | 'user' | 'join' | 'site' | 'usertoken';

/**
 * 관리 가능한 Preference Key 목록
 * - isFirstRun: 최초 실행 여부
 * - theme: 앱 테마
 */
export type PreferenceKey = 'isFirstRun' | 'theme';

interface CacheModelMap {
    channel: ChannelView;
    chat: ChatView;
    user: UserView;
    site: SiteView;
    join: JoinView;
    usertoken: UserTokenView;
}

interface CacheQueryMap {
    channel: { query?: ChannelQueryOptions };
    chat: { query?: ChatQueryOptions };
    user: { query?: UserQueryOptions };
    site: { query?: SiteQueryOptions };
    join: { query?: JoinQueryOptions };
    usertoken: { query?: UserTokenQueryOptions };
}

/**
 * 기본 쿼리 옵션 (모든 쿼리의 부모)
 */
export interface BaseQueryOptions {
    /**
     * - cloudId
     * - undefined 일 경우 전체데이터 쿼리
     */
    cid?: string;
}

export interface ChannelQueryOptions extends BaseQueryOptions {
    /**
     * - siteId 아이디로 채널 쿼리하기
     * - 특정 사이트에 대한 채널 쿼리
     * - TODO: Not Implement
     */
    siteId?: string;
}

export interface UserQueryOptions extends BaseQueryOptions {}

export interface SiteQueryOptions extends BaseQueryOptions {
    /**
     * 특정 소유자의 플레이스
     * - TODO: Not Implement
     */
    ownerId?: string;
}

export interface ChatQueryOptions extends BaseQueryOptions {
    /**
     * 채널 아이디
     */
    channelId?: string;
}

export interface JoinQueryOptions extends BaseQueryOptions {
    /**
     * 특정 채널에 대한 참여 정보
     * - TODO: Not Implement
     */
    channelId?: string;
}

export interface UserTokenQueryOptions extends BaseQueryOptions {
    /**
     *  권한에 따른 사용자
     * - TODO: Not Implement
     */
    role?: 'guest';
}

/** [요청] 다수 데이터 불러오기 */
export type FetchAllCacheDataPayload = {
    [K in CacheType]: { type: K } & CacheQueryMap[K];
}[CacheType];

/** [응답] 다수 데이터 불러오기 */
export type OnFetchAllCacheDataPayload = {
    [K in CacheType]: { type: K; items: CacheModelMap[K][] };
}[CacheType];

/** [요청] 단일 데이터 불러오기 */
export type FetchCacheDataPayload = {
    [K in CacheType]: { type: K; id: string; cid: string };
}[CacheType];

/** [응답] 단일 데이터 불러오기 */
export type OnFetchCacheDataPayload = {
    [K in CacheType]: { type: K; id: string; item: CacheModelMap[K] | null; cid: string };
}[CacheType];

/** [요청] 단일 데이터 삭제하기 */
export type DeleteCacheDataPayload = {
    [K in CacheType]: { type: K; id: string; cid: string };
}[CacheType];

/** [응답] 단일 데이터 삭제하기; 실패 or 삭제할 데이터가 없을 시, null 전달 */
export type OnDeleteCacheDataPayload = {
    [K in CacheType]: { type: K; id: string | null; cid: string };
}[CacheType];

/** [요청] 단일 데이터 저장 */
export type SaveCacheDataPayload = {
    [K in CacheType]: { type: K; id: string; item: CacheModelMap[K]; cid: string };
}[CacheType];

/** [응답] 단일 데이터 저장하기; 실패시, null 전달  */
export type OnSaveCacheDataPayload = {
    [K in CacheType]: { type: K; id: string | null; cid: string };
}[CacheType];

/** [요청] 다수 데이터 저장 */
export type SaveAllCacheDataPayload = {
    [K in CacheType]: { type: K; items: CacheModelMap[K][]; cid: string };
}[CacheType];

/** [응답] 다수 데이터 저장 처리 결과 (성공한 ids 반환) */
export type OnSaveAllCacheDataPayload = {
    [K in CacheType]: { type: K; ids: string[]; cid: string };
}[CacheType];

/** [요청] 다수 데이터 삭제 */
export type DeleteAllCacheDataPayload = {
    [K in CacheType]: { type: K; ids: string[]; cid: string };
}[CacheType];

/** [응답] 다수 데이터 삭제 처리 결과 (성공한 ids 반환) */
export type OnDeleteAllCacheDataPayload = {
    [K in CacheType]: { type: K; ids: string[]; cid: string };
}[CacheType];
