import type { ModelSyncPayload } from '@lemoncloud/chatic-sockets-api';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';

/**
 * 백엔드의 모델 동기화 메타데이터(ModelSyncPayload)와 프론트엔드의 도메인 모델(T)을 결합한 타입입니다.
 * @template T 도메인 엔티티 타입 (예: ChatView, ChannelView)
 */
export type Synced<T> = ModelSyncPayload & Partial<T>;

/** channel.sync 요청 body */
export interface ChannelSyncBody {
    since: number;
}

/** channel.sync 응답 */
export interface ChannelSyncView {
    list: ChannelView[];
    ids: string[];
    syncedAt: number;
}

/**
 * 백엔드 공통 List 응답 규격입니다. (lemon-core의 ListResult 대체)
 * @template T 목록을 구성하는 개별 아이템의 타입
 * @template R 집계(Aggregation) 데이터의 타입
 */
export interface ListResult<T, R = any> {
    /** 검색된 전체 아이템 개수 */
    total?: number;
    /** 한 페이지에 포함될 수 있는 최대 아이템 개수 */
    limit?: number;
    /** 현재 페이지 번호 */
    page?: number;
    /** 검색에 소요된 시간 (초 단위, 선택) */
    took?: number;
    /** 검색된 아이템 배열 */
    list: T[];
    /** 추가적인 집계 데이터 배열 또는 객체 (선택) */
    aggr?: R | R[];
}
