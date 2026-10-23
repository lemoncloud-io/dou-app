import { loadStartingPolicy, refreshPolicy, TELEMETRY_POLICY_OVERRIDE_KEY } from './policy';

const STORED = '@chatic/web.telemetry.policy';
const on = { version: 4, enabled: true, ttlSec: 60, defaults: { perf: 1 } };

beforeEach(() => localStorage.clear());

describe('loadStartingPolicy', () => {
    it('starts with statistics off when nothing was ever fetched', () => {
        expect(loadStartingPolicy(0, false)).toEqual({ version: 0, enabled: false });
    });

    it('starts with the stored policy while its ttl holds, and the default after', () => {
        localStorage.setItem(STORED, JSON.stringify({ raw: on, savedAt: 1_000 }));

        expect(loadStartingPolicy(1_000 + 60_000, false).version).toBe(4);
        expect(loadStartingPolicy(1_000 + 60_001, false).version).toBe(0);
    });

    it('honours the development override only when allowed', () => {
        localStorage.setItem(TELEMETRY_POLICY_OVERRIDE_KEY, JSON.stringify({ version: 9, enabled: true }));

        expect(loadStartingPolicy(0, true).version).toBe(9);
        expect(loadStartingPolicy(0, false).version).toBe(0);
    });

    it('falls back to the default on a stored document that is not a policy', () => {
        localStorage.setItem(STORED, '{not json');
        expect(loadStartingPolicy(0, false).enabled).toBe(false);
    });
});

describe('refreshPolicy', () => {
    it('stores a fetched policy for the next run and returns it', async () => {
        const policy = await refreshPolicy(
            async () => on,
            () => 5,
            false
        );

        expect(policy?.version).toBe(4);
        expect(JSON.parse(localStorage.getItem(STORED) ?? '{}')).toEqual({ raw: on, savedAt: 5 });
    });

    it('returns nothing and stores nothing when the fetch fails or is not a policy', async () => {
        await expect(
            refreshPolicy(
                async () => Promise.reject(new Error('net')),
                () => 5,
                false
            )
        ).resolves.toBeUndefined();
        await expect(
            refreshPolicy(
                async () => ({ nope: true }),
                () => 5,
                false
            )
        ).resolves.toBeUndefined();
        expect(localStorage.getItem(STORED)).toBeNull();
    });
});
