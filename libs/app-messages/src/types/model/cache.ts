import type { ChannelView, ChatView, JoinView, UserView } from '@lemoncloud/chatic-socials-api';
import type { CloudView, SiteView, UserTokenView } from '@lemoncloud/chatic-backend-api';

/**
 * 캐시 데이터 타입
 * @author raine@lemoncloud.io
 */
export type CacheType = 'channel' | 'cloud' | 'chat' | 'user' | 'join' | 'site' | 'usertoken';

/**
 * 관리 가능한 Preference Key 목록
 * - isFirstRun: 최초 실행 여부
 * - theme: 앱 테마
 */
export type PreferenceKey = 'isFirstRun' | 'theme' | 'language';

interface CacheModelMap {
    channel: ChannelView;
    cloud: CloudView;
    chat: ChatView;
    user: UserView;
    site: SiteView;
    join: JoinView;
    usertoken: UserTokenView;
}

interface CacheQueryMap {
    channel: { query?: ChannelQueryOptions };
    cloud: { query?: CloudQueryOptions };
    chat: { query?: ChatQueryOptions };
    user: { query?: UserQueryOptions };
    site: { query?: SiteQueryOptions };
    join: { query?: JoinQueryOptions };
    usertoken: { query?: UserTokenQueryOptions };
}

export interface ChannelQueryOptions {
    /**
     * - cloudId에 해당하는 채널 정보 쿼리
     */
    cid?: string;

    /**
     * - sid 아이디로 채널 쿼리하기
     * - 특정 사이트에 대한 채널 쿼리
     */
    sid?: string;
}

export interface CloudQueryOptions {}

export interface UserQueryOptions {
    /**
     * - cloudId에 해당하는 유저 정보 쿼리
     */
    cid?: string;
}

export interface SiteQueryOptions {
    /**
     * - cloudId에 해당하는 사이트 정보 쿼리
     */
    cid?: string;
}

export interface ChatQueryOptions {
    /**
     * - cloudId에 해당하는 채팅정보 쿼리
     */
    cid?: string;
    /**
     * 채널 아이디
     */
    channelId?: string;

    /**
     * 정렬 방식
     */
    sort?: 'asc' | 'desc';
}

export interface JoinQueryOptions {
    /**
     * - cloudId에 해당하는 채널정보 쿼리
     */
    cid?: string;
    /**
     * 특정 채널에 대한 참여 정보
     */
    channelId?: string;
}

export interface UserTokenQueryOptions {
    /**
     * - cloudId에 해당하는 토큰정보 쿼리
     */
    cid?: string;
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
