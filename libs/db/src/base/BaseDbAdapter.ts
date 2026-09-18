import { logger } from '@chatic/bridges';
import type { CacheModelOf, CacheQueryOf, CacheType } from '@chatic/app-messages';
import type { AdapterScope, CacheStorage, DataContextProvider } from '@chatic/data';
import { resolveScopedContext } from '@chatic/data';

/**
 * An abstract class serving as the common base for every database adapter (IndexedDB, Native, etc).
 *
 * @template TType the cache domain type
 */
export abstract class BaseDbAdapter<TType extends CacheType> implements CacheStorage<TType> {
    constructor(
        protected readonly type: TType,
        protected readonly contextProvider: DataContextProvider
    ) {}

    /** Whether a missing scope has already been reported — one warning per adapter is enough to know the cause. */
    private warnedMissingScope = false;

    /**
     * Determines the scope (cid, uid) according to the domain type's policy. **`null` when
     * there is no session, and in that case every cache operation is skipped** — the caller
     * must respond with an empty value for reads and a no-op for writes.
     *
     * Previously, an empty uid was filled in as `'default'`, reading and writing to a
     * partition that didn't actually exist (that incident is recorded in `resolveBaseScope`'s
     * comment). To avoid putting a fallback back where one was removed, this function
     * returning `null` is the only answer — a sessionless user's cache partition doesn't
     * exist, so picking somewhere else to write instead would repeat the same incident.
     *
     * The fact that it was skipped is always left visible. Silently writing elsewhere and
     * silently doing nothing are equally hard to debug.
     */
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

    /**
     * The default implementation repeats `load` in parallel — when the store isn't behind a
     * bridge (IndexedDB), that's already the best option, so there's no reason for the adapter
     * to bother overriding it. Only `NativeDBAdapter`, which sits behind a bridge, overrides it
     * to fold the round trips down to one.
     *
     * `null`s are filtered out, so the return length and order don't match `ids` — the caller
     * is expected to re-index by id.
     */
    async loadMany(ids: string[]): Promise<CacheModelOf<TType>[]> {
        if (ids.length === 0) return [];
        // `load` filters out missing scope on each call and returns all nulls anyway, but with
        // no session that's one pointless round trip per id, so this cuts it off in one shot here.
        if (!this.getScope()) return [];
        const items: Array<CacheModelOf<TType> | null> = await Promise.all(ids.map(id => this.load(id)));
        return items.filter((item): item is CacheModelOf<TType> => !!item);
    }

    /**
     * The default implementation reads, filters, and deletes — a fallback path for a store with
     * no way to scope the delete itself to a channel. `IndexedDBAdapter` overrides it with a
     * channel index range, and `NativeDBAdapter` with a dedicated bridge message, falling back
     * to here on an older app that doesn't know that message (ADR-0067).
     *
     * **The read is scoped to the channel.** For a domain that declares `channelId` as a query
     * field (chat, join), only that channel's rows come back, so clearing out one room doesn't
     * send the whole table across the bridge. Other domains have no basis to narrow it, so they
     * scan the full set as before — the only real caller is chat.
     */
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

    /**
     * Gives that filter if this domain's query type accepts `channelId`, otherwise `undefined`.
     *
     * Why the cast is needed: `CacheQueryOf<TType>` is a per-domain mapped type, so it can't be
     * narrowed within the generic `TType`. The runtime guard vouches for that safety instead —
     * the same idiom as `loadLastPerChannel` branching off the chat-only path with
     * `this.type !== 'chat'`.
     */
    private asChannelQuery(channelId: string): CacheQueryOf<TType> | undefined {
        const isChannelScoped = this.type === 'chat' || this.type === 'join';
        return isChannelScoped ? ({ channelId } as CacheQueryOf<TType>) : undefined;
    }
}
