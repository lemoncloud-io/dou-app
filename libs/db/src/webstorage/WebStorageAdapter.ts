import type { CacheModelOf, CacheQueryOf, CacheType } from '@chatic/bridge-messages';
import type { AdapterScope, DataContextProvider } from '@chatic/data';
import { withCacheMeta } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { BaseDbAdapter } from '../base/BaseDbAdapter';

type Rows<TType extends CacheType> = Record<string, CacheModelOf<TType>>;

/**
 * A `CacheStorage` over a Web Storage area (`sessionStorage`, `localStorage`), for a domain whose rows
 * must live exactly as long as that area does.
 *
 * Its one user is the plain-browser `invitecloud` domain, routed to `sessionStorage`: a browser tab's
 * guest identity is kept there, and an invited cloud is entered on that guest's grant, so a row that
 * outlived the tab would name a cloud nobody left can enter.
 *
 * One key per partition holds every row as a single JSON object, read and rewritten whole. That is
 * only reasonable for a small domain — a handful of rows, no paging — which is all it is meant for.
 * Query options are not interpreted (`loadAll` returns the whole partition), so a domain that filters
 * through `CacheQueryOf` does not belong here.
 *
 * Nothing announces a write to other tabs, deliberately: in a `sessionStorage` area there are none,
 * and the data source above the adapter already re-emits its own observers.
 */
export class WebStorageAdapter<TType extends CacheType> extends BaseDbAdapter<TType> {
    constructor(
        private readonly storage: Storage,
        type: TType,
        contextProvider: DataContextProvider
    ) {
        super(type, contextProvider);
    }

    private keyFor(scope: AdapterScope): string {
        return `chatic-cache:${this.type}:${scope.cid}:${scope.uid}`;
    }

    /**
     * An unreadable partition reads as empty rather than throwing: a value another build wrote in a
     * different shape, or storage access refused by the browser, must not take the domain's whole
     * read path down with it. The next write replaces the value.
     */
    private read(scope: AdapterScope): Rows<TType> {
        try {
            const raw = this.storage.getItem(this.keyFor(scope));
            if (!raw) return {};
            const parsed: unknown = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Rows<TType>) : {};
        } catch (error) {
            logger.warn('CACHE', '[WebStorageAdapter] unreadable partition — read as empty', {
                data: { type: this.type, error: error instanceof Error ? error.message : String(error) },
            });
            return {};
        }
    }

    private write(scope: AdapterScope, rows: Rows<TType>): void {
        this.storage.setItem(this.keyFor(scope), JSON.stringify(rows));
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
        // Same report as the IndexedDB adapter: otherwise the caller is told the batch was saved and an
        // item is simply missing.
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
        this.storage.removeItem(this.keyFor(scope));
    }
}
