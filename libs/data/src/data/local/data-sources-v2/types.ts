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

type ObserverNotify = () => Promise<void>;

export abstract class BaseLocalDataSourceV2 {
    private nextObserverId = 0;
    private readonly itemObservers = new Map<string, Map<number, ObserverNotify>>();
    private readonly listObservers = new Map<string, Map<number, ObserverNotify>>();
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
        const observerId = ++this.nextObserverId;
        const notify = async (): Promise<void> => {
            callback(await query());
        };

        const group = this.itemObservers.get(id) ?? new Map<number, ObserverNotify>();
        group.set(observerId, notify);
        this.itemObservers.set(id, group);
        void this.safeNotify(notify);

        return () => {
            const current = this.itemObservers.get(id);
            if (!current) return;
            current.delete(observerId);
            if (current.size === 0) {
                this.itemObservers.delete(id);
            }
        };
    }

    protected observeListQuery<T>(
        key: string,
        query: () => Promise<T>,
        callback: LocalDataSourceV2Callback<T>
    ): LocalDataSourceV2Unsubscribe {
        const observerId = ++this.nextObserverId;
        const notify = async (): Promise<void> => {
            callback(await query());
        };

        const group = this.listObservers.get(key) ?? new Map<number, ObserverNotify>();
        group.set(observerId, notify);
        this.listObservers.set(key, group);
        void this.safeNotify(notify);

        return () => {
            const current = this.listObservers.get(key);
            if (!current) return;
            current.delete(observerId);
            if (current.size === 0) {
                this.listObservers.delete(key);
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
        const itemTasks: ObserverNotify[] = [];
        const listTasks: ObserverNotify[] = [];

        if (this.emitAllItems) {
            for (const group of this.itemObservers.values()) {
                itemTasks.push(...group.values());
            }
        } else {
            for (const id of this.pendingItemIds) {
                const group = this.itemObservers.get(id);
                if (group) itemTasks.push(...group.values());
            }
        }

        if (this.emitAllLists) {
            for (const group of this.listObservers.values()) {
                listTasks.push(...group.values());
            }
        } else {
            for (const [key, group] of this.listObservers.entries()) {
                const shouldEmit = Array.from(this.pendingListPrefixes).some(prefix => key.startsWith(prefix));
                if (shouldEmit) listTasks.push(...group.values());
            }
        }

        this.pendingItemIds.clear();
        this.pendingListPrefixes.clear();
        this.emitAllItems = false;
        this.emitAllLists = false;

        const uniqueTasks = Array.from(new Set([...itemTasks, ...listTasks]));
        await Promise.all(uniqueTasks.map(task => this.safeNotify(task)));
    }

    private async safeNotify(task: ObserverNotify): Promise<void> {
        try {
            await task();
        } catch (error) {
            console.error('[LocalDataSourceV2] notify failed', error);
        }
    }
}
