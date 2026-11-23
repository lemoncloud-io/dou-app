import { TARGET_VERSION } from '../../database/sqlite/schema';
import { resetCacheDomainVersions, resolveCacheDomainVersions } from './cacheDomainVersions';

const mockGetSchemaVersion = jest.fn();

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
        mockGetSchemaVersion.mockResolvedValue(10);

        await expect(resolveCacheDomainVersions()).resolves.not.toHaveProperty('invite');
    });

    it('answers undefined instead of rejecting when the DB is unreachable', async () => {
        mockGetSchemaVersion.mockRejectedValue(new Error('database is locked'));

        await expect(resolveCacheDomainVersions()).resolves.toBeUndefined();
    });

    it('answers undefined when the measurement outruns its timeout', async () => {
        jest.useFakeTimers();
        mockGetSchemaVersion.mockReturnValue(new Promise(() => undefined));

        const pending = resolveCacheDomainVersions();
        jest.advanceTimersByTime(3_000);

        await expect(pending).resolves.toBeUndefined();
        jest.useRealTimers();
    });

    it('measures once and reuses the answer', async () => {
        mockGetSchemaVersion.mockResolvedValue(TARGET_VERSION);

        const first = await resolveCacheDomainVersions();
        const second = await resolveCacheDomainVersions();

        expect(mockGetSchemaVersion).toHaveBeenCalledTimes(1);
        expect(second).toBe(first);
    });

    it('retries after a failure instead of caching the non-answer', async () => {
        mockGetSchemaVersion.mockRejectedValueOnce(new Error('database is locked'));
        await expect(resolveCacheDomainVersions()).resolves.toBeUndefined();

        mockGetSchemaVersion.mockResolvedValue(TARGET_VERSION);

        await expect(resolveCacheDomainVersions()).resolves.toMatchObject({ invite: 1 });
        expect(mockGetSchemaVersion).toHaveBeenCalledTimes(2);
    });
});
