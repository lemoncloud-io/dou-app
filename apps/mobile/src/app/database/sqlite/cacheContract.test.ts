import { SUPPORTED_CACHE_TYPES } from '../../services/cache/CacheCrudService';
import { CACHE_DOMAIN_CONTRACTS, deriveCacheDomainVersions } from './cacheContract';
import { MIGRATIONS, TARGET_VERSION } from './schema';

describe('CACHE_DOMAIN_CONTRACTS', () => {
    // The web reads a reported domain as "this app can persist it". A contract for a domain with no
    // switch arm in CacheCrudService would make the web trust a store that silently drops writes —
    // the exact failure the skew gate exists to prevent.
    it('declares exactly the domains CacheCrudService can actually persist', () => {
        expect(Object.keys(CACHE_DOMAIN_CONTRACTS).sort()).toEqual([...SUPPORTED_CACHE_TYPES].sort());
    });

    // Every domain's contract is on its first edition. Edition 2 appears only when a contract really
    // changes — not when a domain is added, and not to move a gate.
    it('starts every domain at edition 1', () => {
        for (const contract of Object.values(CACHE_DOMAIN_CONTRACTS)) {
            expect(contract.version).toBe(1);
        }
    });

    // sinceUserVersion is a coordinate into the migration list, so a typo would silently drop a
    // domain from every report (or, worse, report one whose table does not exist yet).
    it('keeps every sinceUserVersion inside the migration range', () => {
        const migrationCount = Object.keys(MIGRATIONS).length;
        expect(TARGET_VERSION).toBe(migrationCount);
        for (const contract of Object.values(CACHE_DOMAIN_CONTRACTS)) {
            expect(contract.sinceUserVersion).toBeGreaterThanOrEqual(1);
            expect(contract.sinceUserVersion).toBeLessThanOrEqual(TARGET_VERSION);
        }
    });
});

describe('deriveCacheDomainVersions', () => {
    it('reports every domain on a DB that reached the target version', () => {
        const versions = deriveCacheDomainVersions(TARGET_VERSION);

        expect(Object.keys(versions).sort()).toEqual([...SUPPORTED_CACHE_TYPES].sort());
        expect(versions.invite).toBe(1);
    });

    // A failed migration rolls the whole transaction back, so user_version stays put and the domains
    // introduced above it must drop out of the report — this is what "measured, not declared" buys.
    it('omits domains whose table the reached version cannot have', () => {
        // 10 = migrations 0..9 applied; `invites` (migration 10) never ran.
        const versions = deriveCacheDomainVersions(10);

        expect(versions.invite).toBeUndefined();
        expect(versions.meta).toBe(1); // migration 9
        expect(versions.profile).toBe(1); // migration 8
        expect(versions.chat).toBe(1);
    });

    it('drops meta and profile too when the reached version predates them', () => {
        const versions = deriveCacheDomainVersions(1);

        expect(Object.keys(versions).sort()).toEqual(['channel', 'chat', 'invitecloud', 'join', 'site', 'user'].sort());
    });

    // A fresh install that never got past `open()` reports nothing. The web still keeps the frozen
    // legacy domains on native (its own floor), so this degrades to "no new domains", not to loss.
    it('reports nothing for a DB with no migrations applied', () => {
        expect(deriveCacheDomainVersions(0)).toEqual({});
    });

    it('reports every domain on a DB ahead of this build (web rollback / downgrade)', () => {
        const versions = deriveCacheDomainVersions(TARGET_VERSION + 5);

        expect(Object.keys(versions).sort()).toEqual([...SUPPORTED_CACHE_TYPES].sort());
    });
});

// Ties each non-obvious coordinate back to the migration that justifies it. `metas` in particular
// was created in migration 0, DROPped in 5 and recreated in 9 — reading only the first CREATE would
// put meta at 1 and report a table a v5..v9 install does not have.
describe('sinceUserVersion coordinates', () => {
    const sqlOf = (version: number) => (MIGRATIONS[version] ?? []).join('\n');

    it('anchors meta to the migration that RECREATED metas, not the original', () => {
        expect(sqlOf(5)).toMatch(/DROP TABLE IF EXISTS metas/i);
        expect(sqlOf(9)).toMatch(/CREATE TABLE IF NOT EXISTS metas/i);
        expect(CACHE_DOMAIN_CONTRACTS.meta.sinceUserVersion).toBe(10);
    });

    it('anchors invite to the migration that created invites', () => {
        expect(sqlOf(10)).toMatch(/CREATE TABLE IF NOT EXISTS invites/i);
        expect(CACHE_DOMAIN_CONTRACTS.invite.sinceUserVersion).toBe(11);
    });

    it('anchors profile to the migration that created profiles', () => {
        expect(sqlOf(8)).toMatch(/CREATE TABLE IF NOT EXISTS profiles/i);
        expect(CACHE_DOMAIN_CONTRACTS.profile.sinceUserVersion).toBe(9);
    });
});
