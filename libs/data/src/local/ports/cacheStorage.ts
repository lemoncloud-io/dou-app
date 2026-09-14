import type { CacheModelOf, CacheQueryOf, CacheType, LastChatItem } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories-v2/types';

/**
 * 실제 저장소 구현체(IndexedDB/native 등)가 만족해야 하는 공통 인터페이스입니다.
 * 모든 상위 팩터리 타입은 이 인터페이스를 중심으로 연결됩니다.
 *
 * @template TType 캐시 도메인 타입 (예: 'channel', 'chat' 등)
 */
export interface CacheStorage<TType extends CacheType> {
    save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>>;
    saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]>;
    load(id: string): Promise<CacheModelOf<TType> | null>;
    /**
     * id 목록으로 여러 행을 읽습니다. `load`를 id마다 부르는 것과 결과는 같습니다.
     *
     * 없는 id는 결과에서 빠지므로 **반환 길이와 순서가 `ids`와 일치하지 않습니다.** 호출자는
     * `new Map(items.map(item => [item.id, item]))`처럼 id로 다시 색인해야 합니다. 위치로 짝을
     * 맞추면(`items[index]`) 중간에 없는 id가 하나라도 있으면 그 뒤가 전부 밀립니다.
     */
    loadMany(ids: string[]): Promise<CacheModelOf<TType>[]>;
    loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]>;
    delete(id: string): Promise<void>;
    deleteAll(ids: string[]): Promise<void>;
    clearAll(): Promise<void>;
    clearByChannelId(channelId: string): Promise<void>;
    /**
     * 채널별 최신 프리뷰 1건 + 그 채널의 최대 chatNo를 한 번에 읽습니다 (chat 전용, ADR-0057).
     *
     * 선택 구현입니다. `null`은 "이 저장소는 이 조회를 제공하지 못한다"는 뜻으로 — 미구현
     * 어댑터(IndexedDB), 이 메시지를 모르는 구버전 앱, 일시적 네이티브 오류가 전부 여기에
     * 해당합니다 — 호출자(`ChatLocalDataSourceV2`)가 채널별 윈도우 읽기로 폴백합니다.
     * IndexedDB가 구현하지 않는 이유: 폴백 경로가 인프로세스라 왕복 비용이 없어 그게 곧
     * 최선이고, 굳이 판정 로직을 두 벌 두면 의미론만 드리프트합니다.
     *
     * 반환 배열은 요청 순서·길이를 보장하지 않습니다 — 호출자가 channelId로 다시 색인합니다.
     */
    loadLastPerChannel?(channelIds: string[]): Promise<LastChatItem[] | null>;
}

/**
 * 캐시 저장소에 보관되는 모델 타입 단축 정의
 */
export type CacheStorageItem<TType extends CacheType> = CacheModelOf<TType>;

/**
 * 데이터베이스에 저장될 레코드의 기본 스키마를 정의합니다.
 *
 * @template TType 캐시 도메인 타입
 */
export interface CacheSchema<TType extends CacheType> {
    key: string; // Primary key (e.g., "channel:cid:uid:id")
    type: TType; // CacheType (e.g., "channel")
    cid: string;
    uid: string;
    id: string; // Original ID
    data: CacheModelOf<TType>;
}

export type CacheStorageFactory = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
) => CacheStorage<TType>;

export interface LocalCacheStorages {
    channel: CacheStorage<'channel'>;
    chat: CacheStorage<'chat'>;
    inviteCloud: CacheStorage<'invitecloud'>;
    join: CacheStorage<'join'>;
    profile: CacheStorage<'profile'>;
    site: CacheStorage<'site'>;
    user: CacheStorage<'user'>;
    meta: CacheStorage<'meta'>;
    invite: CacheStorage<'invite'>;
}

export const createCacheStorages = (
    contextProvider: DataContextProvider,
    storageFactory: CacheStorageFactory
): LocalCacheStorages => ({
    channel: storageFactory('channel', contextProvider),
    chat: storageFactory('chat', contextProvider),
    inviteCloud: storageFactory('invitecloud', contextProvider),
    join: storageFactory('join', contextProvider),
    profile: storageFactory('profile', contextProvider),
    site: storageFactory('site', contextProvider),
    user: storageFactory('user', contextProvider),
    meta: storageFactory('meta', contextProvider),
    invite: storageFactory('invite', contextProvider),
});
