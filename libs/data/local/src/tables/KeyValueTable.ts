import type { CacheModelOf, CacheQueryOf, CacheType } from '@chatic/bridge-messages';
import type { DataContextProvider } from '@chatic/data-model';
import { logger } from '@chatic/logger';
import type { KeyValueStore } from '@chatic/storage';

import { withCacheMeta } from '../ports/policy';
import type { AdapterScope } from '../ports/policy';
import { BaseDbAdapter } from './BaseDbAdapter';

type Rows<TType extends CacheType> = Record<string, CacheModelOf<TType>>;

export class KeyValueTable<TType extends CacheType> extends BaseDbAdapter<TType> {
    constructor(
        private readonly store: KeyValueStore,
        type: TType,
        contextProvider: DataContextProvider
    ) {
        super(type, contextProvider);
    }

    private keyFor(scope: AdapterScope): string {
        return `chatic-cache:${this.type}:${scope.cid}:${scope.uid}`;
    }

    private read(scope: AdapterScope): Rows<TType> {
        try {
            const raw = this.store.get(this.keyFor(scope));
            if (!raw) return {};
            const parsed: unknown = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Rows<TType>) : {};
        } catch (error) {
            logger.warn('CACHE', '[KeyValueTable] unreadable partition — read as empty', {
                data: { type: this.type, error: error instanceof Error ? error.message : String(error) },
            });
            return {};
        }
    }

    private write(scope: AdapterScope, rows: Rows<TType>): void {
        this.store.set(this.keyFor(scope), JSON.stringify(rows));
    }

    async save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>> {
        const scope = this.getScope();
        if (!scope) return item;
        const rows = this.read(scope);
        rows[id] = withCacheMeta(this.type, item);
        this.write(scope, rows);
        return item;
    }

    async saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]> {
        if (items.length === 0) return [];
        const scope = this.getScope();
        if (!scope) return items;
        const rows = this.read(scope);
        let dropped = 0;
        for (const item of items) {
            const id = (item as { id?: string }).id;
            if (!id) {
                dropped++;
                continue;
            }
            rows[id] = withCacheMeta(this.type, item);
        }
        if (dropped > 0) {
            logger.warn('CACHE', `dropped ${dropped} item(s) with no id from saveAll`, {
                data: { type: this.type, dropped, total: items.length },
            });
        }
        this.write(scope, rows);
        return items;
    }

    async load(id: string): Promise<CacheModelOf<TType> | null> {
        const scope = this.getScope();
        if (!scope) return null;
        return this.read(scope)[id] ?? null;
    }

    async loadAll(_options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]> {
        const scope = this.getScope();
        if (!scope) return [];
        return Object.values(this.read(scope));
    }

    async delete(id: string): Promise<void> {
        await this.deleteAll([id]);
    }

    async deleteAll(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const scope = this.getScope();
        if (!scope) return;
        const rows = this.read(scope);
        ids.forEach(id => delete rows[id]);
        this.write(scope, rows);
    }

    async clearAll(): Promise<void> {
        const scope = this.getScope();
        if (!scope) return;
        this.store.remove(this.keyFor(scope));
    }
}
