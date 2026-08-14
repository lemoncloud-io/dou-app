import { logger } from '@chatic/bridges';
import type { IWebBridgeClient } from '@chatic/bridges';
import type {
    CacheModelOf,
    CacheQueryOf,
    CacheType,
    WebMessageData,
    WebMessageResponse,
    WebMessageType,
    ClearCacheDataPayload,
    DeleteAllCacheDataPayload,
    DeleteCacheDataPayload,
    FetchAllCacheDataPayload,
    FetchCacheDataPayload,
    FetchManyCacheDataPayload,
    OnFetchAllCacheDataPayload,
    OnFetchCacheDataPayload,
    OnFetchManyCacheDataPayload,
    SaveAllCacheDataPayload,
    SaveCacheDataPayload,
} from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories-v2/types';
import { withCacheMeta } from './utils';
import { type NativeCacheOperation, recordNativeCacheOperation } from './nativeCacheMetrics';
import { stableHash } from './stableHash';
import { BaseDbAdapter } from './types';

/** 브릿지 메시지 → 계측 연산명. 이 어댑터가 보내는 8종이 전부입니다. */
const OPERATION_BY_MESSAGE: Record<string, NativeCacheOperation> = {
    SaveCacheData: 'save',
    SaveAllCacheData: 'saveAll',
    FetchCacheData: 'load',
    FetchManyCacheData: 'loadMany',
    FetchAllCacheData: 'loadAll',
    DeleteCacheData: 'delete',
    DeleteAllCacheData: 'deleteAll',
    ClearCacheData: 'clearAll',
};

/**
 * `FetchManyCacheData`를 모르는 앱 빌드가 설치되어 있는가.
 *
 * 웹은 앱보다 먼저 배포되므로 이 메시지를 처리할 핸들러가 없는 빌드 안에서 실행될 수 있습니다. 그
 * 경우 host가 `NOT_FOUND`로 거절하고, 여기서 그 사실을 기억해 이후로는 시도조차 하지 않습니다.
 * 핸드셰이크 능력 보고에 의존하지 않는 이유는 그게 비동기로 도착해서 어댑터 생성 시점에는 아직
 * 없을 수 있기 때문입니다 — 실패 한 번으로 배우는 쪽이 레이스가 없습니다.
 *
 * 모듈 스코프인 것은 의도입니다. 설치된 앱은 하나이므로 도메인마다 따로 배울 이유가 없고, 어댑터는
 * 타입별로 만들어지므로 인스턴스 스코프면 9번 학습하게 됩니다.
 */
let batchReadUnsupported = false;

/** 테스트 seam — 배운 폴백 상태를 되돌립니다. */
export const resetNativeBatchReadSupport = (): void => {
    batchReadUnsupported = false;
};

/**
 * 네이티브 앱 환경(SQLite 등)의 로컬 DB와 WebBridge를 통해 통신하는 캐시 스토리지 어댑터 클래스입니다.
 *
 * @template TType 캐시 도메인 타입
 */
export class NativeDBAdapter<TType extends CacheType> extends BaseDbAdapter<TType> {
    /**
     * 지금 응답을 기다리고 있는 읽기 요청들 (key: 실제로 브릿지에 나가는 페이로드).
     *
     * 같은 페이로드가 동시에 두 번 요청되면 두 번째는 첫 번째의 Promise를 그대로 받습니다. 논리
     * 계층에서 중복을 접는 것과 별개로 필요한 이유는, **논리 키가 달라도 물리 쿼리는 같은 경우**가
     * 흔하기 때문입니다 — user/channel/profile/place의 `cacheReadList`는 인자 없는 `loadAll()`로
     * 테이블 전체를 받아 JS에서 필터링하므로, 옵저버 키가 서로 다른 두 구독자가 바이트 단위로
     * 동일한 `FetchAllCacheData`를 동시에 내보냅니다. 옵저버 그룹핑은 "같은 키"만 합치므로 이건
     * 잡지 못합니다.
     *
     * 읽기 전용입니다. 쓰기를 합치면 두 번째 호출자가 자기 쓰기가 반영됐다고 믿게 되므로 절대
     * 넣지 않습니다. 읽기는 같은 시점의 같은 쿼리가 같은 답이어야 하므로 안전하며, 정착(settle)
     * 즉시 맵에서 빠지므로 창은 "실제로 비행 중인 동안"으로 한정됩니다 — 캐시가 아닙니다.
     */
    private readonly inflightReads = new Map<string, Promise<unknown>>();

    constructor(
        private readonly bridge: IWebBridgeClient,
        type: TType,
        contextProvider: DataContextProvider
    ) {
        super(type, contextProvider);
    }

    /**
     * 브릿지 왕복을 태우는 유일한 지점. 여기서 소요 시간을 재므로 새 연산을 추가해도 계측이 저절로
     * 따라옵니다(`bridge.request`를 직접 부르면 빠집니다).
     *
     * 실패해도 기록하려고 `finally`를 씁니다 — 타임아웃이 가장 느린 호출인데 그걸 빼면 분포가
     * 실제보다 좋아 보입니다. 계측 비용은 호출당 `Date.now()` 두 번이라 왕복 앞에서 무시할 수준입니다.
     */
    private async send<K extends WebMessageType>(message: WebMessageData<K>): Promise<WebMessageResponse<K>> {
        const startedAt = Date.now();
        try {
            return await this.bridge.request(message);
        } finally {
            recordNativeCacheOperation(OPERATION_BY_MESSAGE[message.type], this.type, Date.now() - startedAt);
        }
    }

    /**
     * 읽기 전용 `send`. 이미 같은 페이로드가 비행 중이면 그 Promise를 공유합니다.
     *
     * 실패도 공유합니다 — 같은 순간의 같은 쿼리는 같은 결과여야 하고, 그건 실패에도 적용됩니다.
     * `finally`로 지우므로 다음 호출은 새로 나갑니다(실패가 캐시되지 않습니다).
     */
    private sendRead<K extends WebMessageType>(message: WebMessageData<K>): Promise<WebMessageResponse<K>> {
        const key = stableHash(message);
        const existing = this.inflightReads.get(key);
        if (existing) return existing as Promise<WebMessageResponse<K>>;

        const request = this.send(message).finally(() => {
            this.inflightReads.delete(key);
        });
        this.inflightReads.set(key, request);
        return request;
    }

    async save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>> {
        const scope = this.getScope();

        await this.send({
            type: 'SaveCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                id,
                item: withCacheMeta(this.type, item),
                // Double cast: the generic TType cannot narrow the discriminated payload union.
            } as unknown as Extract<SaveCacheDataPayload, { type: TType }>,
        });
        return item;
    }

    async saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]> {
        if (items.length === 0) return [];
        const scope = this.getScope();

        await this.send({
            type: 'SaveAllCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                items: items.map(item => withCacheMeta(this.type, item)),
                // Double cast: the generic TType cannot narrow the discriminated payload union.
            } as unknown as Extract<SaveAllCacheDataPayload, { type: TType }>,
        });
        return items;
    }

    async load(id: string): Promise<CacheModelOf<TType> | null> {
        const scope = this.getScope();

        const response = await this.sendRead({
            type: 'FetchCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                id,
            } as Extract<FetchCacheDataPayload, { type: TType }>,
        });

        const data = response?.data as Extract<OnFetchCacheDataPayload, { type: TType }> | undefined;
        return (data?.item ?? null) as CacheModelOf<TType> | null;
    }

    /**
     * id 목록을 한 번의 왕복으로 읽습니다.
     *
     * 기본 구현(`BaseDbAdapter.loadMany`)은 `load`를 N번 부르는데, 네이티브에서는 그게 왕복 N회가
     * 됩니다 — 채팅 50건을 병합 저장하려고 기존 행을 읽는 것만으로 50 왕복이었습니다. 여기서
     * `FetchManyCacheData` 하나로 접습니다.
     *
     * 이 메시지를 모르는 앱 빌드에서는 host가 `NOT_FOUND`로 거절하므로, 그걸 감지해 id별 조회로
     * 폴백하고 그 사실을 기억합니다(`batchReadUnsupported`). 그 외 실패는 삼키지 않고 그대로
     * 던집니다 — 타임아웃이나 저장소 오류를 폴백으로 감추면 왕복이 2배가 되면서 원인도 숨습니다.
     */
    override async loadMany(ids: string[]): Promise<CacheModelOf<TType>[]> {
        if (ids.length === 0) return [];
        if (batchReadUnsupported) return super.loadMany(ids);

        const scope = this.getScope();

        try {
            const response = await this.sendRead({
                type: 'FetchManyCacheData',
                data: {
                    type: this.type,
                    cid: scope.cid,
                    uid: scope.uid,
                    ids,
                } as Extract<FetchManyCacheDataPayload, { type: TType }>,
            });

            const data = response?.data as Extract<OnFetchManyCacheDataPayload, { type: TType }> | undefined;
            return (data?.items ?? []) as CacheModelOf<TType>[];
        } catch (error) {
            if ((error as { code?: string })?.code !== 'NOT_FOUND') throw error;

            batchReadUnsupported = true;
            logger.info('CACHE', '[NativeDBAdapter] batch read unsupported by this app build — falling back', {
                data: { type: this.type },
            });
            return super.loadMany(ids);
        }
    }

    async loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]> {
        const scope = this.getScope();
        const query = {
            cid: scope.cid,
            uid: scope.uid,
            ...options,
        };

        const response = await this.sendRead({
            type: 'FetchAllCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                query,
            } as Extract<FetchAllCacheDataPayload, { type: TType }>,
        });

        const data = response?.data as Extract<OnFetchAllCacheDataPayload, { type: TType }> | undefined;
        return (data?.items ?? []) as CacheModelOf<TType>[];
    }

    async delete(id: string): Promise<void> {
        const scope = this.getScope();

        await this.send({
            type: 'DeleteCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                id,
            } as Extract<DeleteCacheDataPayload, { type: TType }>,
        });
    }

    async deleteAll(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const scope = this.getScope();

        await this.send({
            type: 'DeleteAllCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                ids,
            } as Extract<DeleteAllCacheDataPayload, { type: TType }>,
        });
    }

    async clearAll(): Promise<void> {
        const scope = this.getScope();

        await this.send({
            type: 'ClearCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
            } as Extract<ClearCacheDataPayload, { type: TType }>,
        });
    }
}
