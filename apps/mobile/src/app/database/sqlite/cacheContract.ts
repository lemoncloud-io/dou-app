import type { CacheDomainVersions, CacheType } from '@chatic/app-messages';

/**
 * What this app build promises the web about each cache domain (ADR-0053).
 *
 * The web declares what it REQUIRES; this declares what we IMPLEMENT. The two are deliberately not
 * a shared constant — sharing the value would turn a negotiation into an identity.
 */
export interface CacheDomainContract {
    /**
     * The contract's edition. Bumped ONLY when the contract itself changes in a way that must
     * exclude older apps — never to mark that a domain is new, and never to move a gate (a gate is
     * the web's `REQUIRED_DOMAIN_VERSION`). Unrelated to the global schema number.
     *
     * DISCIPLINE: a bump must stay compatible with older WEB bundles, because the comparison is
     * one-directional (`>=`). A change that breaks an older web is a new `CacheType`, not a bump.
     */
    version: number;
    /**
     * The reached `user_version` at which this domain's table exists — purely a coordinate for
     * measuring, never sent to the web. Migration `k` creating the table means `k + 1` (see
     * `MIGRATIONS` in ./schema). It is a historical fact, so unrelated migrations landing later do
     * NOT move it — that is the whole difference from the global-counter gate this replaced.
     */
    sinceUserVersion: number;
}

/**
 * Every domain starts at edition 1. The number says "which edition of THIS domain's contract", not
 * when the domain was added: `invite` is the newest domain here yet its contract has never changed.
 */
export const CACHE_DOMAIN_CONTRACTS: Record<CacheType, CacheDomainContract> = {
    // Migration 0 — shipped in the first native DB build.
    channel: { version: 1, sinceUserVersion: 1 },
    chat: { version: 1, sinceUserVersion: 1 },
    user: { version: 1, sinceUserVersion: 1 },
    join: { version: 1, sinceUserVersion: 1 },
    site: { version: 1, sinceUserVersion: 1 },
    invitecloud: { version: 1, sinceUserVersion: 1 },
    // Migration 8.
    profile: { version: 1, sinceUserVersion: 9 },
    // Migration 9. The original `metas` (a query→ids index) was DROPped in migration 5; this is the
    // sync-cursor table that replaced it, so the coordinate is 10 rather than 1.
    meta: { version: 1, sinceUserVersion: 10 },
    // Migration 10 (ADR-0052).
    invite: { version: 1, sinceUserVersion: 11 },
};

/**
 * The contract report for a DB that reached `userVersion`.
 *
 * A domain whose table cannot exist at that version is simply absent, which the web reads as
 * "edition 0" and routes to its own storage — the right answer, since writing into a missing table
 * is how a permanently empty cache is born. Frozen legacy domains are still floored to native on
 * the web side, so a bad measurement cannot strand data the app has always been able to hold.
 */
export const deriveCacheDomainVersions = (userVersion: number): CacheDomainVersions => {
    const versions: CacheDomainVersions = {};
    for (const [type, contract] of Object.entries(CACHE_DOMAIN_CONTRACTS) as [CacheType, CacheDomainContract][]) {
        if (userVersion >= contract.sinceUserVersion) versions[type] = contract.version;
    }
    return versions;
};
