import type { CacheModelOf, CacheQueryOf, CacheType } from '@chatic/app-messages';
import type { CacheStorage } from './types';

/**
 * load() 메서드에 적용할 읽기 정책
 * - 'hot-first': Hot 조회 → miss 시 Cold fallback
 * - 'cold-first': Cold 직접 조회
 */
export type CacheReadPolicy = 'hot-first' | 'cold-first';

/**
 * DynamicCacheStorage에서 수행하는 작업 종류 (에러 콜백 context용)
 */
export type DynamicCacheOperation =
    | 'save'
    | 'saveAll'
    | 'load'
    | 'loadAll'
    | 'delete'
    | 'deleteAll'
    | 'clearAll'
    | 'clearByChannelId';

/**
 * DynamicCacheStorage 생성 옵션
 */
export interface DynamicCacheStorageOptions<TType extends CacheType> {
    /** 도메인 타입 (에러 콜백 context에 포함) */
    type?: TType;
    /** load() 메서드의 읽기 정책 (기본: 'hot-first') */
    readPolicy?: CacheReadPolicy;
    /** loadAll() 메서드의 읽기 정책 (기본: 'cold-first') */
    loadAllPolicy?: CacheReadPolicy;
    /** warm-up 시 chunk 크기 (향후 확장용) */
    warmupChunkSize?: number;
    /** Hot 계층 에러 발생 시 호출되는 콜백 */
    onHotError?: (error: unknown, context: { type?: TType; operation: DynamicCacheOperation }) => void;
}

/**
 * Hot/Cold 2-Tier 캐시 저장소 구현체입니다.
 *
 * DB에 직접 접근하지 않고, 두 개의 CacheStorage 어댑터를 조합(composition)하여
 * Hot/Cold 전략을 실행합니다.
 *
 * - Cold = Source of Truth: 모든 쓰기는 Cold 먼저
 * - Hot = 파생 캐시: 유실 시 Cold에서 복구, Hot 실패는 비치명적
 * - 삭제는 stale 방지 우선: Cold 성공 후 Hot 무효화를 best-effort await
 */
export class DynamicCacheStorage<TType extends CacheType> implements CacheStorage<TType> {
    private readonly readPolicy: CacheReadPolicy;
    private readonly loadAllPolicy: CacheReadPolicy;

    constructor(
        private readonly hot: CacheStorage<TType>,
        private readonly cold: CacheStorage<TType>,
        private readonly options: DynamicCacheStorageOptions<TType> = {}
    ) {
        this.readPolicy = options.readPolicy ?? 'hot-first';
        this.loadAllPolicy = options.loadAllPolicy ?? 'cold-first';
    }

    /**
     * Hot 에러를 onHotError 콜백에 전달하고 삼킵니다.
     */
    private reportHotError(error: unknown, operation: DynamicCacheOperation): void {
        this.options.onHotError?.(error, {
            type: this.options.type,
            operation,
        });
    }

    /**
     * Hot에 fire-and-forget으로 저장합니다. 에러는 삼킵니다.
     */
    private fireAndForgetHotSave(id: string, item: CacheModelOf<TType>): void {
        this.hot.save(id, item).catch(error => {
            this.reportHotError(error, 'save');
        });
    }

    /**
     * Hot에 fire-and-forget으로 일괄 저장합니다. 에러는 삼킵니다.
     */
    private fireAndForgetHotSaveAll(items: CacheModelOf<TType>[]): void {
        if (items.length === 0) return;
        this.hot.saveAll(items).catch(error => {
            this.reportHotError(error, 'saveAll');
        });
    }

    // ─── Read ────────────────────────────────────────────────────────────

    /**
     * 단건 조회 (readPolicy에 따라 동작)
     *
     * hot-first: Hot → miss → Cold → background Hot.save
     * cold-first: Cold 직접 조회
     */
    async load(id: string): Promise<CacheModelOf<TType> | null> {
        if (this.readPolicy === 'cold-first') {
            return this.cold.load(id);
        }

        // hot-first
        let hotItem: CacheModelOf<TType> | null;
        try {
            hotItem = await this.hot.load(id);
        } catch (error) {
            this.reportHotError(error, 'load');
            // Hot 에러 → Cold fallback
            return this.cold.load(id);
        }

        if (hotItem !== null) {
            return hotItem;
        }

        // Hot miss → Cold fallback
        const coldItem = await this.cold.load(id);
        if (coldItem !== null) {
            this.fireAndForgetHotSave(id, coldItem);
        }
        return coldItem;
    }

    /**
     * 전체 조회 (loadAllPolicy에 따라 동작)
     *
     * hot-first: Hot → 빈 배열/에러 → Cold → background Hot.saveAll
     * cold-first: Cold → background Hot.saveAll
     */
    async loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]> {
        if (this.loadAllPolicy === 'cold-first') {
            const coldItems = await this.cold.loadAll(options);
            this.fireAndForgetHotSaveAll(coldItems);
            return coldItems;
        }

        // hot-first
        let hotItems: CacheModelOf<TType>[];
        try {
            hotItems = await this.hot.loadAll(options);
        } catch (error) {
            this.reportHotError(error, 'loadAll');
            // Hot 에러 → Cold fallback
            const coldItems = await this.cold.loadAll(options);
            this.fireAndForgetHotSaveAll(coldItems);
            return coldItems;
        }

        if (hotItems.length > 0) {
            return hotItems;
        }

        // Hot 빈 배열 → Cold fallback
        const coldItems = await this.cold.loadAll(options);
        this.fireAndForgetHotSaveAll(coldItems);
        return coldItems;
    }

    // ─── Write ───────────────────────────────────────────────────────────

    /**
     * 단건 저장: Cold 먼저 → 성공 시 background Hot.save (fire-and-forget)
     */
    async save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>> {
        const result = await this.cold.save(id, item);
        this.fireAndForgetHotSave(id, item);
        return result;
    }

    /**
     * 일괄 저장: Cold 먼저 → 성공 시 background Hot.saveAll (fire-and-forget)
     */
    async saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]> {
        const result = await this.cold.saveAll(items);
        this.fireAndForgetHotSaveAll(items);
        return result;
    }

    // ─── Delete ──────────────────────────────────────────────────────────

    /**
     * 단건 삭제: Cold 먼저 → 성공 시 Hot await best-effort (에러 삼킴)
     */
    async delete(id: string): Promise<void> {
        await this.cold.delete(id);
        try {
            await this.hot.delete(id);
        } catch (error) {
            this.reportHotError(error, 'delete');
        }
    }

    /**
     * 일괄 삭제: Cold 먼저 → 성공 시 Hot await best-effort (에러 삼킴)
     */
    async deleteAll(ids: string[]): Promise<void> {
        await this.cold.deleteAll(ids);
        try {
            await this.hot.deleteAll(ids);
        } catch (error) {
            this.reportHotError(error, 'deleteAll');
        }
    }

    /**
     * 전체 삭제: Cold 먼저 → 성공 시 Hot await best-effort (에러 삼킴)
     */
    async clearAll(): Promise<void> {
        await this.cold.clearAll();
        try {
            await this.hot.clearAll();
        } catch (error) {
            this.reportHotError(error, 'clearAll');
        }
    }

    /**
     * 채널별 삭제: Cold 먼저 → 성공 시 Hot await best-effort (에러 삼킴)
     */
    async clearByChannelId(channelId: string): Promise<void> {
        await this.cold.clearByChannelId(channelId);
        try {
            await this.hot.clearByChannelId(channelId);
        } catch (error) {
            this.reportHotError(error, 'clearByChannelId');
        }
    }
}
