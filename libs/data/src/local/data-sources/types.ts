import type { CacheType } from '@chatic/bridge-messages';
import { logger } from '@chatic/logger';

import type { DataContext, DataContextProvider } from '../../repositories/types';
import type { CacheStorage, ScopedCacheStorage } from '../ports';
import { stableHash } from '../stableHash';

export type LocalDataSourceContextOverride = Partial<DataContext>;
export type LocalDataSourceUnsubscribe = () => void;
export type LocalDataSourceCallback<T> = (value: T) => void;

export interface ILocalDataSource<TItem, TListQuery, TListResult> {
    cacheRead(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<TItem | null>;
    cacheReadList(query: TListQuery, contextOverride?: LocalDataSourceContextOverride): Promise<TListResult | null>;

    observeItem(
        id: string,
        callback: LocalDataSourceCallback<TItem | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe;
    observeList(
        query: TListQuery,
        callback: LocalDataSourceCallback<TListResult | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe;

    cacheWrite(item: Partial<TItem>, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    cacheWriteMany(items: Array<Partial<TItem>>, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    cacheDelete(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    cacheClear(contextOverride?: LocalDataSourceContextOverride): Promise<void>;
}

interface ObserverGroup {
    query: () => Promise<unknown>;
    callbacks: Map<number, (value: never) => void>;
    value?: unknown;
    hasValue: boolean;
    pending?: Promise<unknown>;
}

const RETIRED_GROUP_TTL_MS = 60_000;

const MAX_RETIRED_GROUPS = 256;

const unrefTimer = (timer: ReturnType<typeof setTimeout>): void => {
    (timer as { unref?: () => void }).unref?.();
};

const INITIAL_QUERY_RETRY_DELAY_MS = 1_000;

export abstract class BaseLocalDataSource<TType extends CacheType = CacheType> {
    private nextObserverId = 0;
    private readonly itemObservers = new Map<string, ObserverGroup>();
    private readonly listObservers = new Map<string, ObserverGroup>();
    private readonly pendingItemKeys = new Set<string>();
    private readonly pendingListPrefixes = new Set<string>();
    private readonly retiredGroups = new Map<
        string,
        { registry: Map<string, ObserverGroup>; timer: ReturnType<typeof setTimeout> }
    >();
    private emitAllItems = false;
    private emitAllLists = false;
    private emitTimer: NodeJS.Timeout | null = null;

    protected constructor(
        protected readonly contextProvider: DataContextProvider,
        private readonly storages: ScopedCacheStorage<TType>
    ) {}

    protected storage(contextOverride?: LocalDataSourceContextOverride): CacheStorage<TType> {
        return this.storages.forScope(this.getContext(contextOverride));
    }

    protected resolveContext(contextOverride?: LocalDataSourceContextOverride): DataContext {
        const context = this.getContext(contextOverride);
        return { ...context, cid: context.cid, uid: context.uid };
    }

    protected getContext(contextOverride?: LocalDataSourceContextOverride): DataContext {
        return {
            ...this.contextProvider.getContext(),
            ...contextOverride,
        };
    }

    protected getUid(contextOverride?: LocalDataSourceContextOverride): string {
        return this.getContext(contextOverride).uid || 'default';
    }

    protected getCid(contextOverride?: LocalDataSourceContextOverride): string {
        return this.getContext(contextOverride).cid || 'default';
    }

    protected getSid(contextOverride?: LocalDataSourceContextOverride): string | undefined {
        return this.getContext(contextOverride).sid;
    }

    protected getScopeKey(contextOverride?: LocalDataSourceContextOverride): string {
        const context = this.getContext(contextOverride);
        return stableHash({
            cid: context.cid || 'default',
            uid: context.uid || 'default',
        });
    }

    protected createListObserverKey(
        parts: Array<string | number | boolean | undefined>,
        contextOverride?: LocalDataSourceContextOverride
    ): string {
        const normalized = parts.map(part => String(part ?? '__all__')).join('|');
        return `${this.getScopeKey(contextOverride)}|${normalized}`;
    }

    protected indexById<T extends { id?: string }>(items: T[]): Map<string, T> {
        const byId = new Map<string, T>();
        for (const item of items) {
            if (item?.id) byId.set(item.id, item);
        }
        return byId;
    }

    protected assertRequiredString(value: string | undefined, fieldName: string): string {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value;
        }
        throw new Error(`[LocalDataSource] ${fieldName} is required.`);
    }

    private createItemObserverKey(id: string, contextOverride?: LocalDataSourceContextOverride): string {
        return `${this.getScopeKey(contextOverride)}|item|${id}`;
    }

    protected observeItemQuery<T>(
        id: string,
        query: () => Promise<T>,
        callback: LocalDataSourceCallback<T>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.registerObserver(
            this.itemObservers,
            this.createItemObserverKey(id, contextOverride),
            query,
            callback
        );
    }

    protected observeListQuery<T>(
        key: string,
        query: () => Promise<T>,
        callback: LocalDataSourceCallback<T>
    ): LocalDataSourceUnsubscribe {
        return this.registerObserver(this.listObservers, key, query, callback);
    }

    private registerObserver<T>(
        registry: Map<string, ObserverGroup>,
        key: string,
        query: () => Promise<T>,
        callback: LocalDataSourceCallback<T>
    ): LocalDataSourceUnsubscribe {
        const observerId = ++this.nextObserverId;
        this.cancelRetirement(key);
        const group: ObserverGroup = registry.get(key) ?? {
            query: query as () => Promise<unknown>,
            callbacks: new Map(),
            hasValue: false,
        };
        group.callbacks.set(observerId, callback as (value: never) => void);
        registry.set(key, group);

        const deliver = (value: unknown): void => {
            if (group.callbacks.has(observerId)) callback(value as T);
        };

        if (group.hasValue) {
            void this.safeNotify(async () => deliver(group.value));
        } else if (group.pending) {
            const pending = group.pending;
            void this.safeNotify(async () => deliver(await pending));
        } else {
            const pending = query();
            group.pending = pending;
            void this.safeNotify(async () => {
                try {
                    const value = await pending;
                    if (registry.get(key) === group) {
                        group.value = value;
                        group.hasValue = true;
                    }
                    deliver(value);
                } catch (error) {
                    this.scheduleInitialQueryRetry(registry, key, group);
                    throw error;
                } finally {
                    if (group.pending === pending) group.pending = undefined;
                }
            });
        }

        return () => {
            const current = registry.get(key);
            if (!current) return;
            current.callbacks.delete(observerId);
            if (current.callbacks.size === 0) {
                this.retireGroup(registry, key);
            }
        };
    }

    private scheduleInitialQueryRetry(registry: Map<string, ObserverGroup>, key: string, group: ObserverGroup): void {
        const timer = setTimeout(() => {
            if (registry.get(key) !== group || group.hasValue || group.pending) return;
            const retry = group.query();
            group.pending = retry;
            void this.safeNotify(async () => {
                try {
                    const value = await retry;
                    if (registry.get(key) === group) {
                        group.value = value;
                        group.hasValue = true;
                    }
                    for (const callback of group.callbacks.values()) {
                        (callback as (value: unknown) => void)(value);
                    }
                } finally {
                    if (group.pending === retry) group.pending = undefined;
                }
            });
        }, INITIAL_QUERY_RETRY_DELAY_MS);
        unrefTimer(timer);
    }

    private retireGroup(registry: Map<string, ObserverGroup>, key: string): void {
        this.cancelRetirement(key);
        if (this.retiredGroups.size >= MAX_RETIRED_GROUPS) {
            const oldestKey = this.retiredGroups.keys().next().value;
            if (oldestKey !== undefined) this.dropRetired(oldestKey);
        }
        const timer = setTimeout(() => this.dropRetired(key), RETIRED_GROUP_TTL_MS);
        unrefTimer(timer);
        this.retiredGroups.set(key, { registry, timer });
    }

    private cancelRetirement(key: string): void {
        const retired = this.retiredGroups.get(key);
        if (!retired) return;
        clearTimeout(retired.timer);
        this.retiredGroups.delete(key);
    }

    private dropRetired(key: string): void {
        const retired = this.retiredGroups.get(key);
        if (!retired) return;
        clearTimeout(retired.timer);
        this.retiredGroups.delete(key);
        retired.registry.delete(key);
    }

    protected scheduleItemReemit(ids: string[], contextOverride?: LocalDataSourceContextOverride, delay = 50): void {
        if (ids.length === 0) return;
        for (const id of ids) {
            if (id) this.pendingItemKeys.add(this.createItemObserverKey(id, contextOverride));
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
        const groups: ObserverGroup[] = [];
        const collect = (key: string, group: ObserverGroup): void => {
            if (group.callbacks.size === 0) this.dropRetired(key);
            else groups.push(group);
        };

        if (this.emitAllItems) {
            for (const [key, group] of [...this.itemObservers.entries()]) collect(key, group);
        } else {
            for (const key of this.pendingItemKeys) {
                const group = this.itemObservers.get(key);
                if (group) collect(key, group);
            }
        }

        if (this.emitAllLists) {
            for (const [key, group] of [...this.listObservers.entries()]) collect(key, group);
        } else {
            for (const [key, group] of [...this.listObservers.entries()]) {
                const shouldEmit = Array.from(this.pendingListPrefixes).some(prefix => key.startsWith(prefix));
                if (shouldEmit) collect(key, group);
            }
        }

        this.pendingItemKeys.clear();
        this.pendingListPrefixes.clear();
        this.emitAllItems = false;
        this.emitAllLists = false;

        await Promise.all(Array.from(new Set(groups)).map(group => this.notifyGroup(group)));
    }

    private async notifyGroup(group: ObserverGroup): Promise<void> {
        let value: unknown;
        try {
            value = await group.query();
        } catch (error) {
            logger.error('CACHE', '[LocalDataSource] observer query failed', { error });
            return;
        }
        group.value = value;
        group.hasValue = true;
        for (const callback of group.callbacks.values()) {
            try {
                (callback as (value: unknown) => void)(value);
            } catch (error) {
                logger.error('CACHE', '[LocalDataSource] observer notify failed', { error });
            }
        }
    }

    private async safeNotify(task: () => Promise<void>): Promise<void> {
        try {
            await task();
        } catch (error) {
            logger.error('CACHE', '[LocalDataSource] observer notify failed', { error });
        }
    }
}
