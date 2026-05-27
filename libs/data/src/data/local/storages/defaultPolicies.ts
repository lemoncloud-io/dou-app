import type { CacheModelOf, CacheType } from '@chatic/app-messages';
import type { CacheReadPolicy, PolicyResolver, EvictionStrategy, CapacityPolicy } from './dynamicCacheTypes';
import type { CacheStorage } from './types';

/**
 * 모든 type에 'cold-first' 반환 (정합성 우선, 성능 희생).
 * dev/test에서 PolicyResolver 미주입 시 fallback으로 사용됩니다.
 */
export class DefaultPolicyResolver implements PolicyResolver {
    resolveReadPolicy(_type: CacheType): CacheReadPolicy {
        return 'cold-first';
    }
    resolveLoadAllPolicy(_type: CacheType): CacheReadPolicy {
        return 'cold-first';
    }
}

/**
 * 3-훅 모두 no-op (eviction 없음).
 * EvictionStrategy 미주입 시 fallback으로 사용됩니다.
 */
export class DefaultEvictionStrategy implements EvictionStrategy {
    async onStartup(_hot: CacheStorage<any>): Promise<void> {
        // no-op
    }
    async onAfterWrite<T extends CacheType>(_type: T, _items: CacheModelOf<T>[], _hot: CacheStorage<T>): Promise<void> {
        // no-op
    }
    async onQuotaExceeded(_type: CacheType, _hot: CacheStorage<any>): Promise<void> {
        // no-op
    }
}

/**
 * getLimit() = null (무한), getGroupKey() = undefined.
 * CapacityPolicy 미주입 시 fallback으로 사용됩니다.
 */
export class DefaultCapacityPolicy implements CapacityPolicy {
    getLimit(_type: CacheType, _groupKey?: string): number | null {
        return null;
    }
    getGroupKey<T extends CacheType>(_type: T, _item: CacheModelOf<T>): string | undefined {
        return undefined;
    }
}
