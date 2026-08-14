import { TARGET_VERSION } from '../../database/sqlite/schema';
import { resetCacheDomainVersions, resolveCacheDomainVersions } from './cacheDomainVersions';

const mockGetSchemaVersion = jest.fn();

// The provider getter is what opens SQLite; stub the whole module so these tests never touch it.
jest.mock('../provider', () => ({
    provider: {
        get sqliteDatabase() {
            return { getSchemaVersion: () => mockGetSchemaVersion() };
        },
    },
}));

beforeEach(() => {
    jest.clearAllMocks();
    resetCacheDomainVersions();
});

describe('resolveCacheDomainVersions', () => {
    it('derives the report from the version the DB actually reached', async () => {
        mockGetSchemaVersion.mockResolvedValue(TARGET_VERSION);

        await expect(resolveCacheDomainVersions()).resolves.toMatchObject({ chat: 1, invite: 1 });
    });

    it('drops the domains a partially migrated DB cannot hold', async () => {
        // Migration 10 (invites) rolled back, so the DB sits at 10.
        mockGetSchemaVersion.mockResolvedValue(10);

        await expect(resolveCacheDomainVersions()).resolves.not.toHaveProperty('invite');
    });

    // The handshake awaits this, so a failure must degrade to "no measurement" — the bridge host
    // then reports the static declaration, i.e. exactly the pre-ADR-0053 payload.
    it('answers undefined instead of rejecting when the DB is unreachable', async () => {
        mockGetSchemaVersion.mockRejectedValue(new Error('database is locked'));

        await expect(resolveCacheDomainVersions()).resolves.toBeUndefined();
    });

    it('answers undefined when the measurement outruns its timeout', async () => {
        jest.useFakeTimers();
        mockGetSchemaVersion.mockReturnValue(new Promise(() => undefined)); // never settles

        const pending = resolveCacheDomainVersions();
        jest.advanceTimersByTime(3_000);

        await expect(pending).resolves.toBeUndefined();
        jest.useRealTimers();
    });

    // One handshake per web load, but a WebView reload runs another; the answer cannot change within
    // a process, and re-measuring would re-open the DB on a path that must stay cheap.
    it('measures once and reuses the answer', async () => {
        mockGetSchemaVersion.mockResolvedValue(TARGET_VERSION);

        const first = await resolveCacheDomainVersions();
        const second = await resolveCacheDomainVersions();

        expect(mockGetSchemaVersion).toHaveBeenCalledTimes(1);
        expect(second).toBe(first);
    });

    // A failure is transient (a wedged first boot, a lock held by a migration), unlike a real
    // report. Caching it would let one slow boot pin every later handshake to the static fallback
    // for the rest of the process.
    it('retries after a failure instead of caching the non-answer', async () => {
        mockGetSchemaVersion.mockRejectedValueOnce(new Error('database is locked'));
        await expect(resolveCacheDomainVersions()).resolves.toBeUndefined();

        mockGetSchemaVersion.mockResolvedValue(TARGET_VERSION);

        await expect(resolveCacheDomainVersions()).resolves.toMatchObject({ invite: 1 });
        expect(mockGetSchemaVersion).toHaveBeenCalledTimes(2);
    });
});
