import { logger } from '@chatic/bridges';
import type { IWebBridgeClient } from '@chatic/bridges';
import type {
    CacheModelOf,
    CacheQueryOf,
    CacheType,
    WebMessageData,
    WebMessageResponse,
    WebMessageType,
    ClearCacheDataByChannelPayload,
    ClearCacheDataPayload,
    DeleteAllCacheDataPayload,
    DeleteCacheDataPayload,
    FetchAllCacheDataPayload,
    FetchCacheDataPayload,
    FetchManyCacheDataPayload,
    LastChatItem,
    OnFetchAllCacheDataPayload,
    OnFetchCacheDataPayload,
    OnFetchLastChatsDataPayload,
    OnFetchManyCacheDataPayload,
    SaveAllCacheDataPayload,
    SaveCacheDataPayload,
} from '@chatic/app-messages';
import type { DataContextProvider } from '@chatic/data';
import { stableHash, withCacheMeta } from '@chatic/data';
import { BaseDbAdapter } from '../base/BaseDbAdapter';
import { type NativeCacheOperation, recordNativeCacheOperation } from './nativeCacheMetrics';

/** Bridge message → instrumentation operation name. These are all 10 kinds this adapter sends. */
const OPERATION_BY_MESSAGE: Record<string, NativeCacheOperation> = {
    SaveCacheData: 'save',
    SaveAllCacheData: 'saveAll',
    FetchCacheData: 'load',
    FetchManyCacheData: 'loadMany',
    FetchAllCacheData: 'loadAll',
    FetchLastChatsData: 'loadLast',
    DeleteCacheData: 'delete',
    DeleteAllCacheData: 'deleteAll',
    ClearCacheData: 'clearAll',
    ClearCacheDataByChannel: 'clearByChannel',
};

/**
 * Is an app build installed that doesn't know `FetchManyCacheData`?
 *
 * Since web ships ahead of the app, this can run inside a build with no handler for this
 * message. In that case the host rejects with `NOT_FOUND`, and this remembers that fact so it
 * doesn't even try again afterward. This doesn't rely on a handshake capability report because
 * that arrives asynchronously and may not be there yet at adapter-construction time — learning
 * from a single failure has no race.
 *
 * Module scope is intentional. There's only one installed app, so there's no reason to learn
 * this separately per domain, and since an adapter is created per type, instance scope would
 * mean learning it 9 times.
 */
let batchReadUnsupported = false;

/** Test seam — resets the learned fallback state. */
export const resetNativeBatchReadSupport = (): void => {
    batchReadUnsupported = false;
};

/**
 * Is an app build installed that doesn't know `FetchLastChatsData` (ADR-0057)?
 *
 * A module-scope learning flag on the same basis as `batchReadUnsupported` — since web ships
 * ahead of the app, once a `NOT_FOUND` is received from a host that doesn't know this message,
 * it isn't tried again afterward, and the caller falls back to a per-channel window read.
 */
let lastChatsUnsupported = false;

/** Test seam — resets the learned fallback state. */
export const resetNativeLastChatsSupport = (): void => {
    lastChatsUnsupported = false;
};

/**
 * Is an app build installed that doesn't know `ClearCacheDataByChannel` (ADR-0067)?
 *
 * A module-scope learning flag on the same basis as the two above. The fallback's nature
 * differs, though — a failed read can just come back empty-handed, but a delete has to actually
 * happen, so this one really does fall through to `super`'s read-then-delete path to finish
 * the job the same way.
 */
let clearByChannelUnsupported = false;

/** Test seam — resets the learned fallback state. */
export const resetNativeClearByChannelSupport = (): void => {
    clearByChannelUnsupported = false;
};

/**
 * A cache storage adapter class that communicates over WebBridge with the local DB in the
 * native app environment (SQLite, etc).
 *
 * @template TType the cache domain type
 */
export class NativeDBAdapter<TType extends CacheType> extends BaseDbAdapter<TType> {
    /**
     * Read requests currently awaiting a response (key: the payload actually sent over the bridge).
     *
     * If the same payload is requested twice at the same time, the second call gets back the
     * first call's Promise as-is. This is needed separate from deduping at the logical layer
     * because **different logical keys often resolve to the same physical query** — `user`,
     * `channel`, `profile`, and `place`'s `cacheReadList` fetch the whole table with an argless
     * `loadAll()` and filter in JS, so two subscribers with different observer keys can send out
     * byte-for-byte identical `FetchAllCacheData` calls at the same time. Observer grouping only
     * merges "the same key", so it can't catch this.
     *
     * Read-only. Never merge writes here — doing so would make the second caller believe its own
     * write took effect. A read is safe to share because the same query at the same moment must
     * have the same answer, and it's removed from the map the instant it settles, so the window
     * is limited to "while actually in flight" — this is not a cache.
     */
    private readonly inflightReads = new Map<string, Promise<unknown>>();

    constructor(
        private readonly bridge: IWebBridgeClient,
        type: TType,
        contextProvider: DataContextProvider
    ) {
        super(type, contextProvider);
    }

    /**
     * The single point where a bridge round trip is made. Since duration is measured here,
     * instrumentation automatically covers any new operation added (calling `bridge.request`
     * directly would skip it).
     *
     * Uses `finally` so failures get recorded too — a timeout is the slowest call of all, and
     * excluding it would make the distribution look better than it actually is. The
     * instrumentation cost is two `Date.now()` calls per call, negligible next to the round trip.
     */
    private async send<K extends WebMessageType>(message: WebMessageData<K>): Promise<WebMessageResponse<K>> {
        const startedAt = Date.now();
        try {
            return await this.bridge.request(message);
        } finally {
            recordNativeCacheOperation(OPERATION_BY_MESSAGE[message.type], this.type, Date.now() - startedAt);
        }
    }

    /**
     * A read-only `send`. If the same payload is already in flight, shares that Promise.
     *
     * Failures are shared too — the same query at the same moment must have the same result,
     * and that applies to failures as well. It's removed via `finally`, so the next call goes
     * out fresh (a failure is never cached).
     */
    private sendRead<K extends WebMessageType>(message: WebMessageData<K>): Promise<WebMessageResponse<K>> {
        const key = stableHash(message);
        const existing = this.inflightReads.get(key);
        if (existing) return existing as Promise<WebMessageResponse<K>>;

        const request = this.send(message).finally(() => {
            this.inflightReads.delete(key);
        });
        this.inflightReads.set(key, request);
        return request;
    }

    async save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>> {
        const scope = this.getScope();
        if (!scope) return item;

        await this.send({
            type: 'SaveCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                id,
                item: withCacheMeta(this.type, item),
                // Double cast: the generic TType cannot narrow the discriminated payload union.
            } as unknown as Extract<SaveCacheDataPayload, { type: TType }>,
        });
        return item;
    }

    async saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]> {
        if (items.length === 0) return [];
        const scope = this.getScope();
        if (!scope) return items;

        await this.send({
            type: 'SaveAllCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                items: items.map(item => withCacheMeta(this.type, item)),
                // Double cast: the generic TType cannot narrow the discriminated payload union.
            } as unknown as Extract<SaveAllCacheDataPayload, { type: TType }>,
        });
        return items;
    }

    async load(id: string): Promise<CacheModelOf<TType> | null> {
        const scope = this.getScope();
        if (!scope) return null;

        const response = await this.sendRead({
            type: 'FetchCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                id,
            } as Extract<FetchCacheDataPayload, { type: TType }>,
        });

        const data = response?.data as Extract<OnFetchCacheDataPayload, { type: TType }> | undefined;
        return (data?.item ?? null) as CacheModelOf<TType> | null;
    }

    /**
     * Reads a list of ids in a single round trip.
     *
     * The default implementation (`BaseDbAdapter.loadMany`) calls `load` N times, which on
     * native means N round trips — merge-saving 50 chat messages meant 50 round trips just to
     * read the existing rows. This folds it into one `FetchManyCacheData` call.
     *
     * On an app build that doesn't know this message, the host rejects with `NOT_FOUND`, which
     * is detected here to fall back to per-id lookups and remember that fact
     * (`batchReadUnsupported`). Any other failure is not swallowed and is rethrown as-is —
     * hiding a timeout or storage error behind the fallback would double the round trips while
     * also hiding the cause.
     */
    override async loadMany(ids: string[]): Promise<CacheModelOf<TType>[]> {
        if (ids.length === 0) return [];
        if (batchReadUnsupported) return super.loadMany(ids);

        const scope = this.getScope();
        if (!scope) return [];

        try {
            const response = await this.sendRead({
                type: 'FetchManyCacheData',
                data: {
                    type: this.type,
                    cid: scope.cid,
                    uid: scope.uid,
                    ids,
                } as Extract<FetchManyCacheDataPayload, { type: TType }>,
            });

            const data = response?.data as Extract<OnFetchManyCacheDataPayload, { type: TType }> | undefined;
            return (data?.items ?? []) as CacheModelOf<TType>[];
        } catch (error) {
            if ((error as { code?: string })?.code !== 'NOT_FOUND') throw error;

            batchReadUnsupported = true;
            logger.info('CACHE', '[NativeDBAdapter] batch read unsupported by this app build — falling back', {
                data: { type: this.type },
            });
            return super.loadMany(ids);
        }
    }

    async loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]> {
        const scope = this.getScope();
        if (!scope) return [];
        const query = {
            cid: scope.cid,
            uid: scope.uid,
            ...options,
        };

        const response = await this.sendRead({
            type: 'FetchAllCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                query,
            } as Extract<FetchAllCacheDataPayload, { type: TType }>,
        });

        const data = response?.data as Extract<OnFetchAllCacheDataPayload, { type: TType }> | undefined;
        return (data?.items ?? []) as CacheModelOf<TType>[];
    }

    /**
     * Reads the latest preview per channel plus the max chatNo in a single round trip
     * (chat-only, ADR-0057).
     *
     * `null` always means "fall back" — a non-chat type, an older app that doesn't know this
     * message (learned via a single `NOT_FOUND`), a native processing error (`items: null` —
     * not learned, applies only to this read), or any other bridge failure (timeout, etc —
     * also not learned). Why no error is thrown: whenever this lookup fails, the correct answer
     * is always "today's behavior" (a per-channel window read), and it's simpler for the caller
     * (`ChatLocalDataSource`) to make that call in one fallback spot.
     */
    async loadLastPerChannel(channelIds: string[]): Promise<LastChatItem[] | null> {
        if (this.type !== 'chat') return null;
        if (channelIds.length === 0) return [];
        if (lastChatsUnsupported) return null;

        const scope = this.getScope();
        // `[]`, not `null` — `null` means "fall back to a per-channel window read", and that path
        // is skipped for the same reason, so it would only add one more round trip. With no
        // session, the answer is an empty list.
        if (!scope) return [];
        try {
            const response = await this.sendRead({
                type: 'FetchLastChatsData',
                data: { type: 'chat', cid: scope.cid, uid: scope.uid, channelIds },
            });
            const data = response?.data as OnFetchLastChatsDataPayload | undefined;
            return data?.items ?? null;
        } catch (error) {
            if ((error as { code?: string })?.code === 'NOT_FOUND') {
                lastChatsUnsupported = true;
                logger.info('CACHE', '[NativeDBAdapter] last-chats read unsupported by this app build — falling back', {
                    data: { type: this.type },
                });
                return null;
            }
            logger.warn('CACHE', '[NativeDBAdapter] last-chats read failed — falling back this read', { error });
            return null;
        }
    }

    async delete(id: string): Promise<void> {
        const scope = this.getScope();
        if (!scope) return;

        await this.send({
            type: 'DeleteCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                id,
            } as Extract<DeleteCacheDataPayload, { type: TType }>,
        });
    }

    async deleteAll(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const scope = this.getScope();
        if (!scope) return;

        await this.send({
            type: 'DeleteAllCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                ids,
            } as Extract<DeleteAllCacheDataPayload, { type: TType }>,
        });
    }

    async clearAll(): Promise<void> {
        const scope = this.getScope();
        if (!scope) return;

        await this.send({
            type: 'ClearCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
            } as Extract<ClearCacheDataPayload, { type: TType }>,
        });
    }

    /**
     * Deletes one channel's rows directly on native (ADR-0067) — a single-condition
     * `channel_id` DELETE, so it's one round trip with zero payload.
     *
     * An older app that doesn't know this message rejects with `NOT_FOUND`, which is learned
     * once, falling through to `super`'s read-then-delete path. That path also scopes its read
     * to `channelId` (see base), so the fallback doesn't pull in the whole table.
     *
     * Any other failure (timeout, etc) is not learned and is thrown — unlike a read, a delete
     * must not silently swallow "it didn't happen this time"; the caller decides how to handle
     * that failure.
     *
     * One thing not distinguished here, though, is native answering with **`success: false`
     * instead of a rejection** (a SQL error) — the same is true of this adapter's other write
     * paths. The leftover row is hidden from the screen by `isInJoinWindow`, so the user-visible
     * result is the same, and firing a fallback at the same DB again would only fail for the
     * same reason.
     */
    override async clearByChannelId(channelId: string): Promise<void> {
        if (clearByChannelUnsupported) return super.clearByChannelId(channelId);

        const scope = this.getScope();
        if (!scope) return;
        try {
            await this.send({
                type: 'ClearCacheDataByChannel',
                data: {
                    type: this.type,
                    cid: scope.cid,
                    uid: scope.uid,
                    channelId,
                } as Extract<ClearCacheDataByChannelPayload, { type: TType }>,
            });
        } catch (error) {
            if ((error as { code?: string })?.code !== 'NOT_FOUND') throw error;
            clearByChannelUnsupported = true;
            logger.info(
                'CACHE',
                '[NativeDBAdapter] channel-scoped clear unsupported by this app build — falling back',
                {
                    data: { type: this.type },
                }
            );
            await super.clearByChannelId(channelId);
        }
    }
}
