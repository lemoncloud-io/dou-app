import type { CacheModelOf, CacheQueryOf, CacheType } from '@chatic/bridge-messages';
import type { DataContextProvider } from '@chatic/data-model';
import { logger } from '@chatic/logger';

import type { DbTable } from '../ports/cacheStorage';
import { resolveScopedContext } from '../ports/policy';
import type { AdapterScope } from '../ports/policy';

export abstract class BaseDbAdapter<TType extends CacheType> implements DbTable<TType> {
    constructor(
        protected readonly type: TType,
        protected readonly contextProvider: DataContextProvider
    ) {}

    private warnedMissingScope = false;

    protected getScope(): AdapterScope | null {
        const scope = resolveScopedContext(this.type, this.contextProvider);
        if (!scope && !this.warnedMissingScope) {
            this.warnedMissingScope = true;
            logger.warn('CACHE', '[BaseDbAdapter] no session scope — cache access skipped', {
                data: { type: this.type },
            });
        }
        return scope;
    }

    abstract save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>>;
    abstract saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]>;
    abstract load(id: string): Promise<CacheModelOf<TType> | null>;
    abstract loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]>;
    abstract delete(id: string): Promise<void>;
    abstract deleteAll(ids: string[]): Promise<void>;
    abstract clearAll(): Promise<void>;

    async loadMany(ids: string[]): Promise<CacheModelOf<TType>[]> {
        if (ids.length === 0) return [];
        if (!this.getScope()) return [];
        const items: Array<CacheModelOf<TType> | null> = await Promise.all(ids.map(id => this.load(id)));
        return items.filter((item): item is CacheModelOf<TType> => !!item);
    }

    async clearByChannelId(channelId: string): Promise<void> {
        if (!this.getScope()) return;
        const items = await this.loadAll(this.asChannelQuery(channelId));
        const ids = items
            .filter(item => (item as any).channelId === channelId)
            .map(item => (item as any).id as string)
            .filter(Boolean);
        if (ids.length > 0) {
            await this.deleteAll(ids);
        }
    }

    private asChannelQuery(channelId: string): CacheQueryOf<TType> | undefined {
        const isChannelScoped = this.type === 'chat' || this.type === 'join';
        return isChannelScoped ? ({ channelId } as CacheQueryOf<TType>) : undefined;
    }
}
