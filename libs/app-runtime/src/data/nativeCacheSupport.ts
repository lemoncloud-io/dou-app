import { logger } from '@chatic/bridges';
import type { CacheDomainVersions, CacheType } from '@chatic/app-messages';

/**
 * What the native shell reported about its local cache DB in the bridge handshake
 * (`OnWebAppReady`). Absent until that reply lands — and forever on a build that predates the
 * fields, which is exactly the skew this module exists to survive.
 */
export interface NativeCacheSupport {
    /**
     * Native SQLite `PRAGMA user_version` target of the running app build.
     *
     * Recorded for logging and debugging only. Routing does NOT read it: a global counter cannot
     * say anything about one domain, since an unrelated migration moves it too (ADR-0053).
     */
    schemaVersion: number | null;
    /** CacheTypes that app build reported by name. Read as "contract edition 1" for that domain. */
    types: ReadonlySet<CacheType>;
    /** Per-domain contract editions the app build reported implementing (ADR-0053). */
    domainVersions: CacheDomainVersions;
}

/**
 * CacheTypes every SHIPPED native build can persist. FROZEN — never add to it.
 *
 * The web is deployed ahead of the app, so "does native support X" cannot be answered by the web's
 * own type union: a web build always knows more types than the app it is running inside. This set
 * is the floor that is true of every app build in the wild, and it is what makes an unreported
 * (legacy) app safe to keep using for these domains.
 *
 * A FLOOR, not a default: it is folded into `appVersion` with `Math.max`, so a native build that
 * under-reports (a wiring bug, a truncated payload) cannot drag one of these domains below edition
 * 1 and silently move a warm cache onto web storage. The report can only ever ADD, never take away.
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
 * Domains whose cache IS the authority — no server list API to refill them from.
 *
 * Everywhere else a wrong gate verdict costs durability and the server re-syncs the rows back. Here
 * it costs the rows: moving `invitecloud` to another store does not repopulate it, it loses it, and
 * the only recovery path (`issueCloudDelegationToken(cloudId)`) needs a cloudId that lived in the
 * lost row. So these domains are not gated at all — see `REQUIRED_DOMAIN_VERSION`, whose key type
 * refuses them, and `docs/data/invite-cloud-durability.md` for what makes this one special.
 *
 * Exported for this module's own tests only (not re-exported from the package barrel): the runtime
 * guarantee it stands for — these types stay native under every report shape — has to be asserted
 * somewhere, since the type-level refusal above cannot be.
 */
export const LOCAL_AUTHORITY_CACHE_TYPES = ['invitecloud'] as const;
type LocalAuthorityCacheType = (typeof LOCAL_AUTHORITY_CACHE_TYPES)[number];

/** Domains a version floor may be declared for — everything except the local-authority ones. */
type GateableCacheType = Exclude<CacheType, LocalAuthorityCacheType>;

/**
 * Minimum contract edition the web requires of the app, per domain. Absent = edition 1 is enough.
 *
 * Empty today, and that is the steady state: adding a FIELD to a model needs no entry, because
 * native persists the model as an opaque JSON blob and only projects a few columns. An entry is
 * needed only when the web starts depending on something native must have materialized — a new
 * extracted column, a new index, a query shape the old app cannot serve. Bump the domain's
 * `version` in `apps/mobile/.../sqlite/cacheContract.ts` and ship that app FIRST, then declare the
 * requirement here; the reverse order routes everyone to web storage until the app catches up.
 *
 * Monotonic by construction, so there is no on→off→on transition to get wrong. Local-authority
 * domains are excluded by the KEY TYPE, not by review: for them "route elsewhere until the app
 * catches up" means losing the rows (ADR-0053 decision 3).
 *
 * Exported for this module's own tests only (it is not re-exported from the package barrel) — the
 * map is empty in production, so the version gate would otherwise ship untested until its first use.
 */
export const REQUIRED_DOMAIN_VERSION: Partial<Record<GateableCacheType, number>> = {};

let support: NativeCacheSupport | null = null;

/**
 * Records the handshake reply. Call once per boot, before the data runtime is built — see the
 * ordering note on `isNativeCacheTypeUsable`.
 */
export const setNativeCacheSupport = (reported: {
    cacheSchemaVersion?: number;
    supportedCacheTypes?: string[];
    cacheDomainVersions?: CacheDomainVersions;
}): void => {
    support = {
        schemaVersion: reported.cacheSchemaVersion ?? null,
        types: new Set((reported.supportedCacheTypes ?? []) as CacheType[]),
        domainVersions: reported.cacheDomainVersions ?? {},
    };
    logger.debug('CACHE', '[nativeCacheSupport] native cache capability reported', {
        data: {
            schemaVersion: support.schemaVersion,
            typeCount: support.types.size,
            domainVersions: support.domainVersions,
        },
    });
};

/** Test seam — resets the snapshot to "nothing reported yet". */
export const resetNativeCacheSupport = (): void => {
    support = null;
};

/** The recorded snapshot, or null when the app has not reported (legacy build, or reply pending). */
export const getNativeCacheSupport = (): NativeCacheSupport | null => support;

/**
 * The contract edition the installed app implements for `type`, as the MAXIMUM of three readings.
 *
 * Taking the max is what makes the three mechanisms one comparison, and what made adopting contract
 * versions a no-op at the moment of the switch: the web ships ahead of the app, so most apps a new
 * web meets report only names. Reading the new field alone would score their `invite` as edition 0
 * and push a domain they persist perfectly well onto web storage — a pure regression. Converting a
 * name-only report to edition 1 keeps every routing decision exactly where it was.
 */
const legacyVersion = (type: CacheType): number => (LEGACY_NATIVE_CACHE_TYPES.has(type) ? 1 : 0);
const reportedByName = (type: CacheType): number => (support?.types.has(type) ? 1 : 0);
const appVersion = (type: CacheType): number =>
    Math.max(support?.domainVersions[type] ?? 0, reportedByName(type), legacyVersion(type));

/** Absent = edition 1 suffices. Local-authority types cannot be keys, so they always land here. */
const requiredVersion = (type: CacheType): number => REQUIRED_DOMAIN_VERSION[type as GateableCacheType] ?? 1;

/**
 * Whether the running native shell can be trusted to store `type`.
 *
 * False routes that domain to web storage instead (see `localFactory.getCacheStorage`): the app
 * would otherwise take the write into a `default:` arm that answers `null` with `success: true` —
 * a permanently empty cache rather than an error.
 *
 * ORDERING: this is read when a cache storage is created, which can happen before the handshake
 * reply lands. Unknown therefore resolves the same way a legacy app does — web storage for anything
 * outside the frozen set — so an early read is never WRONG, only conservative. Legacy types clear
 * the default requirement on the floor alone, so the common path has no ordering dependency.
 */
export const isNativeCacheTypeUsable = (type: CacheType): boolean => appVersion(type) >= requiredVersion(type);
