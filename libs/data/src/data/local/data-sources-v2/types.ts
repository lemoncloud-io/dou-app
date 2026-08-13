import { logger } from '@chatic/bridges';

import type { DataContext, DataContextProvider } from '../../repositories-v2/types';
import { stableHash } from '../storages';

export type LocalDataSourceV2ContextOverride = Partial<DataContext>;
export type LocalDataSourceV2Unsubscribe = () => void;
export type LocalDataSourceV2Callback<T> = (value: T) => void;

export interface ILocalDataSourceV2<TItem, TListQuery, TListResult> {
    cacheRead(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<TItem | null>;
    cacheReadList(query: TListQuery, contextOverride?: LocalDataSourceV2ContextOverride): Promise<TListResult | null>;

    observeItem(
        id: string,
        callback: LocalDataSourceV2Callback<TItem | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe;
    observeList(
        query: TListQuery,
        callback: LocalDataSourceV2Callback<TListResult | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe;

    cacheWrite(item: Partial<TItem>, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void>;
    cacheWriteMany(items: Array<Partial<TItem>>, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void>;
    cacheDelete(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void>;
    cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceV2ContextOverride): Promise<void>;
    cacheClear(contextOverride?: LocalDataSourceV2ContextOverride): Promise<void>;
}

/**
 * Observers that resolved to the same key, plus the one query they all need.
 *
 * The key is built from the query's own parameters, so same key means same query means same
 * result — the group runs it ONCE per re-emit and hands the value to every callback. Before this,
 * each observer ran its own copy: three mounted `useMyJoins` consumers observing one channel meant
 * three identical reads, and on native each read is a bridge round trip that queues behind the
 * others (measured 4 reads per write).
 *
 * This only holds while a key fully determines its query. A data source that lets a field reach
 * storage without putting it in the key would collapse two different reads into one wrong answer.
 */
interface ObserverGroup {
    query: () => Promise<unknown>;
    callbacks: Map<number, (value: never) => void>;
}

export abstract class BaseLocalDataSourceV2 {
    private nextObserverId = 0;
    private readonly itemObservers = new Map<string, ObserverGroup>();
    private readonly listObservers = new Map<string, ObserverGroup>();
    private readonly pendingItemIds = new Set<string>();
    private readonly pendingListPrefixes = new Set<string>();
    private emitAllItems = false;
    private emitAllLists = false;
    private emitTimer: NodeJS.Timeout | null = null;

    protected constructor(protected readonly contextProvider: DataContextProvider) {}

    protected getContext(contextOverride?: LocalDataSourceV2ContextOverride): DataContext {
        return {
            ...this.contextProvider.getContext(),
            ...contextOverride,
        };
    }

    protected getUid(contextOverride?: LocalDataSourceV2ContextOverride): string {
        return this.getContext(contextOverride).uid || 'default';
    }

    protected getCid(contextOverride?: LocalDataSourceV2ContextOverride): string {
        return this.getContext(contextOverride).cid || 'default';
    }

    protected getSid(contextOverride?: LocalDataSourceV2ContextOverride): string | undefined {
        return this.getContext(contextOverride).sid;
    }

    protected getScopeKey(contextOverride?: LocalDataSourceV2ContextOverride): string {
        const context = this.getContext(contextOverride);
        // Scope hashing keeps observers isolated per cid/sid/uid tuple.
        return stableHash({
            cid: context.cid || 'default',
            sid: context.sid || '',
            uid: context.uid || 'default',
        });
    }

    protected createListObserverKey(
        parts: Array<string | number | boolean | undefined>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): string {
        const normalized = parts.map(part => String(part ?? '__all__')).join('|');
        return `${this.getScopeKey(contextOverride)}|${normalized}`;
    }

    protected assertRequiredString(value: string | undefined, fieldName: string): string {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value;
        }
        throw new Error(`[LocalDataSourceV2] ${fieldName} is required.`);
    }

    protected observeItemQuery<T>(
        id: string,
        query: () => Promise<T>,
        callback: LocalDataSourceV2Callback<T>
    ): LocalDataSourceV2Unsubscribe {
        return this.registerObserver(this.itemObservers, id, query, callback);
    }

    protected observeListQuery<T>(
        key: string,
        query: () => Promise<T>,
        callback: LocalDataSourceV2Callback<T>
    ): LocalDataSourceV2Unsubscribe {
        return this.registerObserver(this.listObservers, key, query, callback);
    }

    private registerObserver<T>(
        registry: Map<string, ObserverGroup>,
        key: string,
        query: () => Promise<T>,
        callback: LocalDataSourceV2Callback<T>
    ): LocalDataSourceV2Unsubscribe {
        const observerId = ++this.nextObserverId;
        const group = registry.get(key) ?? { query: query as () => Promise<unknown>, callbacks: new Map() };
        group.callbacks.set(observerId, callback as (value: never) => void);
        registry.set(key, group);

        // The first emit goes to the newcomer alone — the others already have this value, and
        // re-delivering it would re-render every consumer on the key whenever one more mounts.
        void this.safeNotify(async () => callback(await query()));

        return () => {
            const current = registry.get(key);
            if (!current) return;
            current.callbacks.delete(observerId);
            if (current.callbacks.size === 0) {
                registry.delete(key);
            }
        };
    }

    protected scheduleItemReemit(ids: string[], delay = 50): void {
        if (ids.length === 0) return;
        for (const id of ids) {
            if (id) this.pendingItemIds.add(id);
        }
        this.scheduleFlush(delay);
    }

    protected scheduleListReemit(prefixes: string[], delay = 50): void {
        if (prefixes.length === 0) return;
        for (const prefix of prefixes) {
            if (prefix) this.pendingListPrefixes.add(prefix);
        }
        this.scheduleFlush(delay);
    }

    protected scheduleFullReemit(delay = 50): void {
        this.emitAllItems = true;
        this.emitAllLists = true;
        this.scheduleFlush(delay);
    }

    private scheduleFlush(delay: number): void {
        if (this.emitTimer) {
            clearTimeout(this.emitTimer);
        }
        this.emitTimer = setTimeout(() => {
            void this.flush();
            this.emitTimer = null;
        }, delay);
    }

    private async flush(): Promise<void> {
        // Collect GROUPS, not individual observers: one query per key, however many are listening.
        const groups: ObserverGroup[] = [];

        if (this.emitAllItems) {
            groups.push(...this.itemObservers.values());
        } else {
            for (const id of this.pendingItemIds) {
                const group = this.itemObservers.get(id);
                if (group) groups.push(group);
            }
        }

        if (this.emitAllLists) {
            groups.push(...this.listObservers.values());
        } else {
            for (const [key, group] of this.listObservers.entries()) {
                const shouldEmit = Array.from(this.pendingListPrefixes).some(prefix => key.startsWith(prefix));
                if (shouldEmit) groups.push(group);
            }
        }

        this.pendingItemIds.clear();
        this.pendingListPrefixes.clear();
        this.emitAllItems = false;
        this.emitAllLists = false;

        await Promise.all(Array.from(new Set(groups)).map(group => this.notifyGroup(group)));
    }

    /** Runs a group's query once and delivers the value to everyone listening on that key. */
    private async notifyGroup(group: ObserverGroup): Promise<void> {
        let value: unknown;
        try {
            value = await group.query();
        } catch (error) {
            logger.error('CACHE', '[LocalDataSourceV2] observer query failed', { error });
            return;
        }
        for (const callback of group.callbacks.values()) {
            try {
                (callback as (value: unknown) => void)(value);
            } catch (error) {
                // One observer throwing must not stop the others, but it is still an app bug —
                // keep it in the buffer so it shows up as a breadcrumb on whatever report follows.
                logger.error('CACHE', '[LocalDataSourceV2] observer notify failed', { error });
            }
        }
    }

    private async safeNotify(task: () => Promise<void>): Promise<void> {
        try {
            await task();
        } catch (error) {
            logger.error('CACHE', '[LocalDataSourceV2] observer notify failed', { error });
        }
    }
}
