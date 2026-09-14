import type { CacheModelMap, CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories/types';

const GLOBAL_CID = 'global';
const GLOBAL_UID = 'global';
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const CACHE_TTL_MS: Record<CacheType, number> = {
    channel: 30 * MINUTE_MS,
    chat: 100 * 12 * 30 * DAY_MS, // no expiration
    invitecloud: 100 * 12 * 30 * DAY_MS, // 100 years; permanent cache
    // Invite expiry is judged from the server's `state`/`expiredAt`, never from cache TTL — a TTL
    // eviction here would undo the whole point of this cache (instant render on cold boot).
    invite: 100 * 12 * 30 * DAY_MS, // 100 years; permanent cache
    join: 30 * MINUTE_MS,
    profile: 30 * MINUTE_MS,
    site: 30 * MINUTE_MS,
    user: 30 * MINUTE_MS,
    // Sync-cursor TTL. A watermark idle beyond the server's delta-history window points past the
    // range channel.sync/profile.sync can replay, so its delta comes back incomplete and the list
    // freezes stale until the cursor expires. On the cold (native) cache the cursor survives app
    // restarts, so a 1-day TTL kept reopened-after-idle lists stale for up to a day. An expired
    // cursor forces a full re-sync (since=0). Active use rarely hits this: each 60s poll re-saves the
    // cursor and refreshes its TTL, so it only expires across an inactivity gap longer than the TTL.
    //
    // TEMPORARY (migration): held at 5 minutes while data is migrating. A delta replayed across a
    // migration can describe a shape the client no longer has, and a full re-sync is the cheap way
    // out — so the cursor is expired aggressively to lean on since=0 instead of trusting deltas.
    // Cost: every user returning from an inactivity gap over 5 minutes pays a full re-sync, which is
    // real server load. Restore to `30 * MINUTE_MS` once the migration is done.
    meta: 5 * MINUTE_MS,
};

/** The scope representation shared by every adapter. */
export interface AdapterScope {
    cid: string;
    uid: string;
}

/** Computes the per-domain TTL policy, in ms. */
export const resolveTtlMs = (type: CacheType): number => CACHE_TTL_MS[type];

/** Builds the TTL metadata relative to now. */
export const createTtlMeta = (type: CacheType, now = Date.now()) => {
    const lastSyncedAt = now;
    return {
        lastSyncedAt,
        expiresAt: lastSyncedAt + resolveTtlMs(type),
        lastAccessedAt: now,
    };
};

/**
 * Normalizes the current context into a base scope. `null` when there is no session — meaning there
 * is no scope.
 *
 * **The fallbacks for cid and uid are not symmetric.** `'default'` for `cid` is a partition that
 * really exists (the relay). There is no such thing for `uid` — there is no cache belonging to a
 * logged-out user, so an empty uid is not a value to fall back from but a state in which nothing
 * should be written.
 *
 * This used to fill it in with `context.uid || 'default'`. So the moment a relay logout nulled the uid
 * (`clearRelaySession`), every read and write silently moved to a ghost partition named
 * `type:cid:default:id`, and the next login returned to the real uid partition. The rows and sync
 * cursors written in between were left somewhere nobody reads again — this one line was the source of
 * the symptom where the channel list froze empty and `channel.sync` only ever fetched deltas.
 */
export const resolveBaseScope = (contextProvider: DataContextProvider): AdapterScope | null => {
    const context = contextProvider.getContext();
    if (!context.uid) return null;
    return {
        cid: context.cid || 'default',
        uid: context.uid,
    };
};

/**
 * Computes the final scope after applying the per-type scope policy.
 * `invitecloud` forces a global CID and UID, with no cloud or user distinction.
 *
 * NOTE: pinning `invitecloud`'s cid to 'global' too is what makes the IndexedDB adapter pick the right
 * partition automatically. `InviteCloudLocalDataSource.runWithGlobalContext` used to mutate the shared
 * DataContextHolder temporarily instead, and during async work another DataSource would read the
 * poisoned context (cid='global'), causing cross-cloud data contamination.
 */
export const resolveScopedContext = (type: CacheType, contextProvider: DataContextProvider): AdapterScope | null => {
    // invitecloud is a pre-session domain (whoever opened an invite link may not be logged in yet), so
    // it answers ahead of the uid check — a fixed partition has a clear destination with no session.
    if (type === 'invitecloud') {
        return { cid: GLOBAL_CID, uid: GLOBAL_UID };
    }
    return resolveBaseScope(contextProvider);
};

/** Injects the TTL metadata into the model as it is cached. */
export const withCacheMeta = <K extends CacheType>(type: K, item: CacheModelMap[K]): CacheModelMap[K] => {
    return {
        ...(item as any),
        __cacheMeta: createTtlMeta(type),
    } as CacheModelMap[K];
};
