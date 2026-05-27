import type { CacheModelOf, CacheQueryOf, CacheType } from '@chatic/app-messages';
import type { CacheStorage } from './types';
import type {
    CacheReadPolicy,
    CacheErrorContext,
    CacheErrorReporter,
    DynamicCacheStorageOptions,
    PolicyResolver,
    EvictionStrategy,
    CapacityPolicy,
} from './dynamicCacheTypes';
import { STAMPEDE_TIMEOUT_MS, StampedeTimeoutError } from './dynamicCacheTypes';
import { DefaultPolicyResolver, DefaultEvictionStrategy, DefaultCapacityPolicy } from './defaultPolicies';
import { stableHash } from './stableHash';

interface InFlightEntry<T> {
    promise: Promise<T>;
    startedAt: number;
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
    private readonly policyResolver: PolicyResolver;
    private readonly evictionStrategy: EvictionStrategy;
    private readonly capacityPolicy: CapacityPolicy;
    private readonly reporter?: CacheErrorReporter;
    private readonly readPolicy: CacheReadPolicy;
    private readonly loadAllPolicy: CacheReadPolicy;

    /** Stampede 가드: 동일 queryKey에 대한 in-flight Promise 공유 */
    private readonly inFlight = new Map<string, InFlightEntry<CacheModelOf<TType>[]>>();

    constructor(
        private readonly hot: CacheStorage<TType>,
        private readonly cold: CacheStorage<TType>,
        private readonly options: DynamicCacheStorageOptions<TType> = {}
    ) {
        this.policyResolver = options.policyResolver ?? new DefaultPolicyResolver();
        this.evictionStrategy = options.evictionStrategy ?? new DefaultEvictionStrategy();
        this.capacityPolicy = options.capacityPolicy ?? new DefaultCapacityPolicy();
        this.reporter = options.reporter;

        // PolicyResolver가 있으면 type 기반으로 policy 결정, 없으면 옵션 fallback
        if (options.policyResolver && options.type) {
            this.readPolicy = options.policyResolver.resolveReadPolicy(options.type);
            this.loadAllPolicy = options.policyResolver.resolveLoadAllPolicy(options.type);
        } else {
            this.readPolicy = options.readPolicy ?? 'hot-first';
            this.loadAllPolicy = options.loadAllPolicy ?? 'cold-first';
        }
    }

    // ─── Inspector (테스트용) ─────────────────────────────────────────

    getPolicyResolver(): Readonly<PolicyResolver> {
        return this.policyResolver;
    }

    getCapacityPolicy(): Readonly<CapacityPolicy> {
        return this.capacityPolicy;
    }

    getEvictionStrategy(): Readonly<EvictionStrategy> {
        return this.evictionStrategy;
    }

    getReporter(): Readonly<CacheErrorReporter> | undefined {
        return this.reporter;
    }

    // ─── Error Reporting ──────────────────────────────────────────────

    private safeReport(error: unknown, context: CacheErrorContext): void {
        try {
            this.reporter?.(error, context);
        } catch {
            // 의도적 무시 — reporter 오류는 silent
        }
    }

    // ─── Hot helpers ──────────────────────────────────────────────────

    private isQuotaExceeded(error: unknown): boolean {
        if (error instanceof DOMException) {
            return error.name === 'QuotaExceededError';
        }
        return false;
    }

    /**
     * Hot에 fire-and-forget으로 저장 + eviction hook chain.
     */
    private fireAndForgetHotSave(id: string, item: CacheModelOf<TType>): void {
        this.hot
            .save(id, item)
            .then(() => {
                // Hot.save 성공 → onAfterWrite chain (background)
                this.evictionStrategy
                    .onAfterWrite(this.options.type ?? ('' as TType), [item], this.hot)
                    .catch(evErr => {
                        this.safeReport(evErr, {
                            tier: 'eviction',
                            operation: 'eviction',
                            type: this.options.type,
                        });
                    });
            })
            .catch(error => {
                this.safeReport(error, { tier: 'hot', operation: 'save', type: this.options.type });
                if (this.isQuotaExceeded(error)) {
                    this.evictionStrategy
                        .onQuotaExceeded(this.options.type ?? ('' as CacheType), this.hot)
                        .catch(() => {
                            // fire-and-forget
                        });
                }
            });
    }

    /**
     * Hot에 fire-and-forget으로 일괄 저장 + eviction hook chain.
     */
    private fireAndForgetHotSaveAll(items: CacheModelOf<TType>[]): void {
        if (items.length === 0) return;
        this.hot
            .saveAll(items)
            .then(() => {
                this.evictionStrategy.onAfterWrite(this.options.type ?? ('' as TType), items, this.hot).catch(evErr => {
                    this.safeReport(evErr, {
                        tier: 'eviction',
                        operation: 'eviction',
                        type: this.options.type,
                    });
                });
            })
            .catch(error => {
                this.safeReport(error, { tier: 'hot', operation: 'saveAll', type: this.options.type });
                if (this.isQuotaExceeded(error)) {
                    this.evictionStrategy
                        .onQuotaExceeded(this.options.type ?? ('' as CacheType), this.hot)
                        .catch(() => {
                            // fire-and-forget
                        });
                }
            });
    }

    // ─── Stampede Guard ───────────────────────────────────────────────

    private stampedeGuard(
        queryKey: string,
        factory: () => Promise<CacheModelOf<TType>[]>
    ): Promise<CacheModelOf<TType>[]> {
        const existing = this.inFlight.get(queryKey);
        if (existing) {
            const elapsed = Date.now() - existing.startedAt;
            if (elapsed > STAMPEDE_TIMEOUT_MS) {
                const timeoutError = new StampedeTimeoutError(queryKey, elapsed);
                this.safeReport(timeoutError, {
                    tier: 'stampede',
                    operation: 'stampede-timeout',
                    type: this.options.type,
                });
                this.inFlight.delete(queryKey);
                return Promise.reject(timeoutError);
            }
            return existing.promise;
        }

        const entry: InFlightEntry<CacheModelOf<TType>[]> = {
            promise: factory().finally(() => {
                this.inFlight.delete(queryKey);
            }),
            startedAt: Date.now(),
        };
        this.inFlight.set(queryKey, entry);
        return entry.promise;
    }

    // ─── Read ─────────────────────────────────────────────────────────

    async load(id: string): Promise<CacheModelOf<TType> | null> {
        if (this.readPolicy === 'cold-first') {
            return this.cold.load(id);
        }

        // hot-first
        let hotItem: CacheModelOf<TType> | null;
        try {
            hotItem = await this.hot.load(id);
        } catch (error) {
            this.safeReport(error, { tier: 'hot', operation: 'load', type: this.options.type });
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

    async loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]> {
        // cursorNo 분기: cursorNo != null → 강제 cold-first
        const cursorNo = (options as Record<string, unknown> | undefined)?.cursorNo;
        if (cursorNo != null) {
            const queryKey = `${this.options.type ?? ''}:loadAll:${stableHash(options)}`;
            return this.stampedeGuard(queryKey, async () => {
                const coldItems = await this.cold.loadAll(options);
                this.fireAndForgetHotSaveAll(coldItems);
                return coldItems;
            });
        }

        // PolicyResolver 기반 policy
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
            this.safeReport(error, { tier: 'hot', operation: 'loadAll', type: this.options.type });
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

    // ─── Write ────────────────────────────────────────────────────────

    async save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>> {
        const result = await this.cold.save(id, item);
        this.fireAndForgetHotSave(id, item);
        return result;
    }

    async saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]> {
        const result = await this.cold.saveAll(items);
        this.fireAndForgetHotSaveAll(items);
        return result;
    }

    // ─── Delete ───────────────────────────────────────────────────────

    async delete(id: string): Promise<void> {
        await this.cold.delete(id);
        try {
            await this.hot.delete(id);
        } catch (error) {
            this.safeReport(error, { tier: 'hot', operation: 'delete', type: this.options.type });
        }
    }

    async deleteAll(ids: string[]): Promise<void> {
        await this.cold.deleteAll(ids);
        try {
            await this.hot.deleteAll(ids);
        } catch (error) {
            this.safeReport(error, { tier: 'hot', operation: 'deleteAll', type: this.options.type });
        }
    }

    async clearAll(): Promise<void> {
        await this.cold.clearAll();
        try {
            await this.hot.clearAll();
        } catch (error) {
            this.safeReport(error, { tier: 'hot', operation: 'clearAll', type: this.options.type });
        }
    }

    async clearByChannelId(channelId: string): Promise<void> {
        await this.cold.clearByChannelId(channelId);
        try {
            await this.hot.clearByChannelId(channelId);
        } catch (error) {
            this.safeReport(error, { tier: 'hot', operation: 'clearByChannelId', type: this.options.type });
        }
    }
}
