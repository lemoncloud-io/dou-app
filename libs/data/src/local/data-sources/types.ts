import { logger } from '@chatic/bridges';

import type { DataContext, DataContextProvider } from '../../repositories/types';
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
    /**
     * The value this group last read, plus the read in flight if one is still running.
     *
     * This exists so a new subscriber does not have to hit storage again. Grouping alone merged
     * subscribers only at re-emit time, and **each mount still ran its own query** — one room entry
     * attached several hooks and produced that many round trips. If "the same key means the same
     * query" holds at re-emit, it holds at mount too.
     *
     * `hasValue` is separate for a reason: `value` being `null`/`undefined` ("there is no row") is
     * different from never having read at all, and the former is a valid answer to pass on as is.
     *
     * **How stale can this get?** While a subscriber is alive it is refreshed on every re-emit, and
     * when the last subscriber leaves the group lingers briefly (`RETIRED_GROUP_TTL_MS`) — but a
     * write matching this key during that grace period **discards the whole group** rather than
     * re-querying (`flush`), so a subscriber revived out of the grace period can only see a value
     * that "matches what the last subscriber saw, with no write since". The worst a new subscriber
     * can see is therefore still **exactly what the existing subscribers were seeing**, and this
     * rule is also what prevents one new subscriber from seeing a value ahead of everyone else.
     *
     * Put the other way: a path missing from the re-emit routing (`getAffectedListPrefixes`) makes
     * that staleness visible for longer. That is not a problem to paper over here — it is a problem
     * to fix in that routing.
     */
    value?: unknown;
    hasValue: boolean;
    pending?: Promise<unknown>;
}

/**
 * How long a group whose last subscriber left is held on to, value included.
 *
 * A screen transition destroys subscriptions and immediately recreates them — one room↔home cycle
 * wiped every group on home and made them all read again, and on native each of those reads was a
 * bridge round trip. A resubscriber returning within this grace period gets the group's value
 * immediately instead of going to storage. There is no risk of that value being stale: a write
 * matching a group in grace discards the whole group rather than re-querying (`flush`) — a re-query
 * with nobody listening is waste, and a value left behind would become a wrong answer. So the value
 * in a retired group is always one that "matches what the last subscriber saw, with no write since".
 */
const RETIRED_GROUP_TTL_MS = 60_000;

/** Cap on retired groups — past it the oldest are dropped first. They hold values (pages), so they must not accumulate without bound. */
const MAX_RETIRED_GROUPS = 256;

/** `unref`, which exists only on Node, keeps a grace timer from holding the process open (a no-op in browsers). */
const unrefTimer = (timer: ReturnType<typeof setTimeout>): void => {
    (timer as { unref?: () => void }).unref?.();
};

/**
 * How long to wait before retrying a failed first query (ADR-0059).
 *
 * When the first query failed (a native bridge timeout, a transient error) the callback was never
 * called once, so the screen stuck empty with no recovery path until the next write re-emit or a
 * resubscribe — the "permanently blank preview" from the 2026-08-14 storm audit. It reads again
 * once, after one second: the dominant cause of failure is momentary congestion, so one retry
 * recovers most cases, while looping through a sustained outage would make the retries themselves
 * the fuel for that congestion — those cases are left to the existing recovery paths (a write
 * re-emit, a resubscribe).
 */
const INITIAL_QUERY_RETRY_DELAY_MS = 1_000;

export abstract class BaseLocalDataSource {
    private nextObserverId = 0;
    private readonly itemObservers = new Map<string, ObserverGroup>();
    private readonly listObservers = new Map<string, ObserverGroup>();
    private readonly pendingItemKeys = new Set<string>();
    private readonly pendingListPrefixes = new Set<string>();
    /**
     * Expiry timers for groups in grace (zero subscribers). Keys are unique across both registries
     * (item keys carry an `|item|` segment). Insertion order equals the order grace began, so when
     * the cap is exceeded the first entry is the oldest.
     */
    private readonly retiredGroups = new Map<
        string,
        { registry: Map<string, ObserverGroup>; timer: ReturnType<typeof setTimeout> }
    >();
    private emitAllItems = false;
    private emitAllLists = false;
    private emitTimer: NodeJS.Timeout | null = null;

    protected constructor(protected readonly contextProvider: DataContextProvider) {}

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

    /**
     * The observer scope, deliberately the same shape as the storage partition
     * (`AdapterScope` = `{cid, uid}`, `ports/policy.ts`).
     *
     * It used to key by `sid` too, which split ONE physical partition across several observer
     * scopes: a write made under one sid never reemitted an observer that had subscribed under a
     * different one, even though both read the very same rows. Three data sources had already
     * overridden that away after hitting it in production — places (`placeCache>0` yet `usePlaces`
     * saw nothing, because a cloud switch clears and re-selects the sid on its own timeline),
     * channels (the same stale rail), and clouds (one global partition split per active cloud).
     * ADR-0085 moved the judgement here, next to where the storage partition is defined, so the two
     * can no longer disagree.
     *
     * Per-site views stay isolated where they are actually asked for — the `|sid:<sid>|` segment of
     * a list key (`ChannelLocalDataSource`, `ProfileLocalDataSource`). That is the rule this scope
     * leans on: **a field that reaches storage belongs in the key**, never in the scope alone.
     */
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

    /**
     * Indexes rows read from the cache by id.
     *
     * Why a merging write must go through this: `CacheStorage.loadMany` **omits ids it did not find**,
     * so the returned array differs from the requested id array in both length and order. Pairing them
     * by `existing[index]`, as the old code did, means that the moment one item in the middle is absent
     * from the cache, everything after it merges into somebody else's row — a failure that silently
     * mixes data, so it surfaces late.
     */
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

    /**
     * The item observer registry key. Like the list key, it includes the scope.
     *
     * The raw `id` used to be the key on its own. But a group **reuses the first registrant's query
     * closure** (`registerObserver`), so observing the same id from a different cid/uid handed the
     * later subscriber the earlier scope's data. In a domain where a row with the same id exists after
     * a cloud switch, that silently shows somebody else's data.
     *
     * The scope definition is owned by `getScopeKey`, so a subclass override (CloudLocalDataSource
     * pinning its one global partition) applies here too — observation and re-emit pass through the
     * same function, so the two cannot drift apart.
     */
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
        // Revive a group that was in grace — its value is still alive, so branch 1 below answers without storage.
        this.cancelRetirement(key);
        const group: ObserverGroup = registry.get(key) ?? {
            query: query as () => Promise<unknown>,
            callbacks: new Map(),
            hasValue: false,
        };
        group.callbacks.set(observerId, callback as (value: never) => void);
        registry.set(key, group);

        // The first emit goes to the newcomer alone — the others already have this value, and
        // re-delivering it would re-render every consumer on the key whenever one more mounts.
        //
        // Where the value comes from splits three ways. Only the last one reads storage afresh:
        //  1. If the group already holds a value, hand that over — the same justification by which a
        //     re-emit shares one value, and if it is stale the next flush sends everyone the new one.
        //  2. If a read for this key is in flight, attach to that Promise — a burst of mounts (several
        //     hooks on one screen) is exactly this case.
        //  3. Otherwise (the first subscriber for that key), read.
        if (group.hasValue) {
            void this.safeNotify(async () => callback(group.value as T));
        } else if (group.pending) {
            const pending = group.pending;
            void this.safeNotify(async () => callback((await pending) as T));
        } else {
            const pending = query();
            group.pending = pending;
            void this.safeNotify(async () => {
                try {
                    const value = await pending;
                    // Only plant the value if this group is still the live one in the registry. If the
                    // last subscriber left during the read the group is still in grace (planting the
                    // value means a resubscribe within grace receives it), so what gets filtered out
                    // here is only a group genuinely removed by grace expiry or invalidation — a fresh
                    // registration of that key gets a new object.
                    if (registry.get(key) === group) {
                        group.value = value;
                        group.hasValue = true;
                    }
                    callback(value);
                } catch (error) {
                    // Merely swallowing the failure leaves every waiter on this key with no news (a
                    // screen stuck empty). Read again once, later — see INITIAL_QUERY_RETRY_DELAY_MS.
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
                // Move it to grace rather than deleting immediately — the value survives a screen
                // transition's destroy/recreate cycle so a resubscribe skips storage (a bridge round
                // trip on native).
                this.retireGroup(registry, key);
            }
        };
    }

    /**
     * The single delayed retry for a failed first query. It does nothing if, in the meantime, the
     * group gained a value (a successful re-emit), another read is in flight, or grace expiry or
     * invalidation removed it. On success it plants the value and delivers it to **every callback
     * currently waiting** — subscribers that joined the first attempt's pending were left with no news
     * by that failure too, so it has to go to the whole group rather than one path to miss nobody.
     */
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

    /** Begins grace: schedules removal at TTL expiry, and past the cap drops the oldest retired group first. */
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

    /** Cancels grace (a resubscribe) — the group stays in the registry as it was. */
    private cancelRetirement(key: string): void {
        const retired = this.retiredGroups.get(key);
        if (!retired) return;
        clearTimeout(retired.timer);
        this.retiredGroups.delete(key);
    }

    /** Removes a retired group (expiry, cap, write invalidation) — discards the value too so the next subscription reads afresh. */
    private dropRetired(key: string): void {
        const retired = this.retiredGroups.get(key);
        if (!retired) return;
        clearTimeout(retired.timer);
        this.retiredGroups.delete(key);
        retired.registry.delete(key);
    }

    /**
     * `contextOverride` is needed so the **same scope key** is produced as at observation time. If the
     * write and the observation compute different scopes, the re-emit wakes nobody and the screen stays
     * stale.
     */
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
        // Collect GROUPS, not individual observers: one query per key, however many are listening.
        // When a group in grace (zero subscribers) is hit, discard the whole group rather than
        // re-querying — a re-query with nobody listening is waste, and leaving the value would give a
        // resubscribe within grace an answer from before this write. Discarded, that resubscribe reads
        // afresh like a first subscription, so a stale value cannot structurally exist.
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

    /** Runs a group's query once and delivers the value to everyone listening on that key. */
    private async notifyGroup(group: ObserverGroup): Promise<void> {
        let value: unknown;
        try {
            value = await group.query();
        } catch (error) {
            logger.error('CACHE', '[LocalDataSource] observer query failed', { error });
            return;
        }
        // Remember the re-emit result on the group as well. That is what lets a later subscriber on
        // the same key receive the current value without reading storage again — without it we either
        // hand out a stale value or (worse) fall back to the original problem of reading on every
        // mount. A failed re-emit is not recorded (it returns above).
        group.value = value;
        group.hasValue = true;
        for (const callback of group.callbacks.values()) {
            try {
                (callback as (value: unknown) => void)(value);
            } catch (error) {
                // One observer throwing must not stop the others, but it is still an app bug —
                // keep it in the buffer so it shows up as a breadcrumb on whatever report follows.
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
