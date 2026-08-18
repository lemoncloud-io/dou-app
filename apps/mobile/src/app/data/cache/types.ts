import type { LastChatItem } from '@chatic/app-messages';

/**
 * 모든 로컬 캐시 데이터 소스에 대한 인터페이스입니다.
 * 각 도메인(Chat, User 등)의 데이터 엑세스 로직을 규격화합니다.
 *
 * @template T - 캐시할 실제 데이터 모델의 타입 (예: CacheChatView)
 * @template Q - `fetchAll` 조회 시 사용할 도메인 특화 필터/페이징 조건 (기본값: void)
 */
export interface ICacheDataSource<T, Q = void> {
    /**
     * 단일 캐시 데이터를 조회합니다.
     *
     * @param id - 조회할 데이터의 고유 ID (예: 메시지 ID, 유저 ID)
     * @param cid - (선택) 데이터 격리를 위한 Cloud ID
     * @param uid - (선택) 데이터 격리를 위한 User ID
     * @returns 조회된 데이터 객체 또는 존재하지 않을 경우 `null`
     */
    fetch: (id: string, cid?: string, uid?: string) => Promise<T | null>;

    /**
     * 다수의 데이터를 id 목록으로 한 번에 조회합니다. (`fetch`를 id마다 부르는 것과 결과 동일)
     *
     * 없는 id는 결과에서 빠지므로 반환 길이와 순서는 `ids`와 일치하지 않습니다. 호출자가 id로 다시
     * 색인합니다.
     *
     * 선택 구현입니다 — 없으면 `CacheCrudService`가 `fetch`를 반복해서 채웁니다. 브릿지 왕복은
     * 어느 쪽이든 1회이므로, 미구현이 성능 목표를 깨지는 않습니다.
     *
     * @param ids - 조회할 데이터의 고유 ID 배열
     * @param cid - (선택) 데이터 격리를 위한 Cloud ID
     * @param uid - (선택) 데이터 격리를 위한 User ID
     */
    fetchMany?: (ids: string[], cid?: string, uid?: string) => Promise<T[]>;

    /**
     * 다수(목록)의 캐시 데이터를 조건에 맞게 조회합니다.
     *
     * @param cid - (선택) 데이터 격리를 위한 Cloud ID
     * @param query - (선택) 도메인 특화 필터링, 정렬, 페이징 조건 (예: 채널 ID, limit 등)
     * @param uid - (선택) 데이터 격리를 위한 User ID
     * @returns 조회된 데이터 배열
     */
    fetchAll: (cid?: string, query?: Q, uid?: string) => Promise<T[]>;

    /**
     * 단일 데이터를 캐시에 저장합니다. (이미 존재하면 업데이트/Upsert)
     *
     * @param id - 저장할 데이터의 고유 ID
     * @param item - 저장할 데이터 모델 객체
     * @param cid - 데이터가 속한 Cloud ID (필수)
     * @param uid - 데이터가 속한 User ID (필수)
     */
    save: (id: string, item: T, cid: string, uid: string) => Promise<void>;

    /**
     * 다수의 데이터를 성능 최적화를 위해 일괄(Batch)로 캐시에 저장합니다. (Upsert)
     *
     * @param items - 저장할 데이터 식별자(`id`)와 실제 모델(`data`)을 포함하는 객체 배열
     * @param cid - 데이터들이 속한 Cloud ID (필수)
     * @param uid - 데이터들이 속한 User ID (필수)
     */
    saveAll: (items: { id: string; data: T }[], cid: string, uid: string) => Promise<void>;

    /**
     * 단일 데이터를 캐시에서 삭제합니다.
     *
     * @param id - 삭제할 데이터의 고유 ID
     * @param cid - 데이터가 속한 Cloud ID (필수)
     * @param uid - 데이터가 속한 User ID (필수)
     */
    remove: (id: string, cid: string, uid: string) => Promise<void>;

    /**
     * 다수의 데이터를 일괄(Batch)로 캐시에서 삭제합니다.
     *
     * @param ids - 삭제할 데이터들의 고유 ID 배열
     * @param cid - 데이터들이 속한 Cloud ID (필수)
     * @param uid - 데이터들이 속한 User ID (필수)
     */
    removeAll: (ids: string[], cid: string, uid: string) => Promise<void>;

    /**
     * 해당 데이터 소스(테이블)의 모든 캐시 데이터를 완전히 초기화(삭제)합니다.
     * 주의: cid 구분 없이 해당 도메인의 전체 데이터가 날아갑니다.
     */
    clear: (cid?: string, uid?: string) => Promise<void>;
}

/**
 * chat 전용 확장 — 채널별 최신 프리뷰 1건 + 최대 chat_no 일괄 조회 (ADR-0057).
 *
 * 홈 채널 목록의 `FetchLastChatsData`가 이 메서드 하나로 답합니다. chat 외 도메인에는 프리뷰
 * 개념이 없으므로 공통 인터페이스가 아니라 확장으로 둡니다.
 */
export interface IChatCacheDataSource<T, Q = void> extends ICacheDataSource<T, Q> {
    fetchLastPerChannel: (channelIds: string[], cid?: string, uid?: string) => Promise<LastChatItem[]>;
}
