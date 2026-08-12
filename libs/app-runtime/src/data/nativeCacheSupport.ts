import { logger } from '@chatic/bridges';
import type { CacheType } from '@chatic/app-messages';

/**
 * What the native shell reported about its local cache DB in the bridge handshake
 * (`OnWebAppReady`). Absent until that reply lands — and forever on a build that predates the
 * fields, which is exactly the skew this module exists to survive.
 */
export interface NativeCacheSupport {
    /** Native SQLite `PRAGMA user_version` target of the running app build. */
    schemaVersion: number | null;
    /** CacheTypes that app build can persist. */
    types: ReadonlySet<CacheType>;
}

/**
 * CacheTypes every SHIPPED native build can persist. FROZEN — never add to it.
 *
 * The web is deployed ahead of the app, so "does native support X" cannot be answered by the web's
 * own type union: a web build always knows more types than the app it is running inside. This set
 * is the floor that is true of every app build in the wild, and it is what makes an unreported
 * (legacy) app safe to keep using for these domains.
 *
 * Deliberately consulted BEFORE the reported list, so a native build that under-reports (a wiring
 * bug, a truncated payload) cannot silently move a warm cold-storage domain onto web storage.
 * The report can only ever ADD types, never take one away.
 */
const LEGACY_NATIVE_CACHE_TYPES: ReadonlySet<CacheType> = new Set<CacheType>([
    'channel',
    'chat',
    'user',
    'join',
    'site',
    'invitecloud',
    'profile',
    'meta',
]);

/**
 * Minimum native cache-schema version a type needs before the web will store it natively.
 *
 * Empty today, and that is the steady state: adding a FIELD to a model needs no entry, because
 * native persists the model as an opaque JSON blob and only projects a few columns. An entry is
 * needed only when the web starts depending on something native must have materialized — a new
 * extracted column, a new index, a query shape the old app cannot serve. Add the migration to
 * `apps/mobile/.../sqlite/schema.ts` FIRST, then declare the resulting `TARGET_VERSION` here.
 *
 * Exported for this module's own tests only (it is not re-exported from the package barrel) — the
 * map is empty in production, so the version gate would otherwise ship untested until its first use.
 */
export const MIN_SCHEMA_VERSION_BY_TYPE: Partial<Record<CacheType, number>> = {};

let support: NativeCacheSupport | null = null;

/**
 * Records the handshake reply. Call once per boot, before the data runtime is built — see the
 * ordering note on `isNativeCacheTypeUsable`.
 */
export const setNativeCacheSupport = (reported: {
    cacheSchemaVersion?: number;
    supportedCacheTypes?: string[];
}): void => {
    support = {
        schemaVersion: reported.cacheSchemaVersion ?? null,
        types: new Set((reported.supportedCacheTypes ?? []) as CacheType[]),
    };
    logger.info('CACHE', '[nativeCacheSupport] native cache capability reported', {
        data: { schemaVersion: support.schemaVersion, typeCount: support.types.size },
    });
};

/** Test seam — resets the snapshot to "nothing reported yet". */
export const resetNativeCacheSupport = (): void => {
    support = null;
};

/** The recorded snapshot, or null when the app has not reported (legacy build, or reply pending). */
export const getNativeCacheSupport = (): NativeCacheSupport | null => support;

/**
 * Whether the running native shell can be trusted to store `type`.
 *
 * False routes that domain to web storage instead (see `localFactory.getCacheStorage`). Two
 * independent reasons to answer false:
 *  - the type is newer than the app build (not legacy, not reported), or
 *  - the app's cache schema is older than what this type needs (`MIN_SCHEMA_VERSION_BY_TYPE`).
 *
 * ORDERING: this is read when a cache storage is created, which can happen before the handshake
 * reply lands. Unknown therefore resolves the same way a legacy app does — web storage for anything
 * outside the frozen set — so an early read is never WRONG, only conservative. Legacy types answer
 * true without consulting the snapshot at all, so the common path has no ordering dependency.
 */
export const isNativeCacheTypeUsable = (type: CacheType): boolean => {
    if (!LEGACY_NATIVE_CACHE_TYPES.has(type) && !support?.types.has(type)) {
        return false;
    }
    const required = MIN_SCHEMA_VERSION_BY_TYPE[type];
    if (required === undefined) {
        return true;
    }
    return (support?.schemaVersion ?? 0) >= required;
};
