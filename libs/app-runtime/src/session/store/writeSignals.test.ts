/**
 * Design principle 8 — "a write method emits its own `SessionSignalKind` with no exceptions"
 * (ADR-0076 Decision 2).
 *
 * The three stores are the **only writer** of session state, yet there was no direct test down at
 * this level: 12 suites erased this module with `jest.mock`, and nobody watched the write's side
 * effect. `signal.test.ts` only verifies the signal **mechanism** (per-kind subscription, batch,
 * nesting), so the contract "which write emits which kind" lived only in the docs. That mapping is
 * what this file pins down.
 *
 * The point is that a miss is silent. A write that forgets to emit still saves fine, and only the
 * screen goes stale — the fact that a single notification was missing isn't observed until whoever
 * is looking at that screen hits refresh. Conversely, an unnecessary emit turns into a fan-out storm,
 * which is exactly the problem Decision 2 originally fixed (one cloud switch firing eight times).
 *
 * The store classes aren't exported (only the singletons are), so this uses the real singletons as-is
 * and fakes only the signal and the storage — it doesn't widen the production surface for the sake
 * of testing.
 */
import type { SessionSignalKind } from './signal';

import { cloudStore } from './cloudStore';
import { identityStore } from './identityStore';
import { relayStore } from './relayStore';

const mockEmitted: SessionSignalKind[] = [];
/** Closed batches, each with the kinds that came out of it. Counts the contract that one use case is one fan-out. */
const mockBatches: SessionSignalKind[][] = [];
/** The stack of currently open batches. Without this, an emit after a batch ends would still get
 *  counted as that batch's — this file's first version did exactly that, and missed the mutant that
 *  moves an emit outside the batch. */
const mockOpen: SessionSignalKind[][] = [];

jest.mock('./signal', () => ({
    sessionSignal: {
        emit: (kind: SessionSignalKind) => {
            mockEmitted.push(kind);
            mockOpen[mockOpen.length - 1]?.push(kind);
        },
        batch: (run: () => void) => {
            const collected: SessionSignalKind[] = [];
            mockOpen.push(collected);
            try {
                run();
            } finally {
                mockOpen.pop();
                mockBatches.push(collected);
            }
        },
        subscribe: () => () => undefined,
    },
}));

// The real `storage` wraps sessionStorage and adds a project prefix. What's being checked here is the
// notification, not the key, so an in-memory fake is enough.
const mockCells = new Map<string, string>();
jest.mock('@chatic/shared', () => ({
    storage: {
        get: (key: string) => mockCells.get(key) ?? null,
        set: (key: string, value: string) => {
            mockCells.set(key, value);
        },
        remove: (key: string) => {
            mockCells.delete(key);
        },
    },
}));

const TOKEN = { Token: { identityToken: 'id-token' } } as never;

beforeEach(() => {
    mockEmitted.length = 0;
    mockBatches.length = 0;
    mockOpen.length = 0;
    mockCells.clear();
});

/**
 * The full write → kind mapping. It's kept as a table because when a new write method appears and
 * nobody adds a line here, it stands out in review — the census test below enforces exactly that.
 */
const WRITES: Array<{ name: string; write: () => void; kinds: SessionSignalKind[] }> = [
    {
        name: 'relayStore.saveSelectedSiteId',
        write: () => relayStore.saveSelectedSiteId('site-1'),
        kinds: ['selection'],
    },
    { name: 'relayStore.clearSelectedSite', write: () => relayStore.clearSelectedSite(), kinds: ['selection'] },
    { name: 'relayStore.saveRelayToken', write: () => relayStore.saveRelayToken(TOKEN), kinds: ['relay:token'] },
    { name: 'relayStore.clearToken', write: () => relayStore.clearToken(), kinds: ['relay:token'] },
    {
        name: 'cloudStore.saveDelegationToken',
        write: () => cloudStore.saveDelegationToken(TOKEN),
        kinds: ['cloud:token'],
    },
    { name: 'cloudStore.saveCloudToken', write: () => cloudStore.saveCloudToken(TOKEN), kinds: ['cloud:token'] },
    {
        name: 'cloudStore.saveSelectedCloudId',
        write: () => cloudStore.saveSelectedCloudId('cloud-1'),
        kinds: ['selection'],
    },
    {
        name: 'cloudStore.saveSelectedSiteId',
        write: () => cloudStore.saveSelectedSiteId('site-1'),
        kinds: ['selection'],
    },
    { name: 'cloudStore.clearSelectedSite', write: () => cloudStore.clearSelectedSite(), kinds: ['selection'] },
    {
        name: 'cloudStore.clearSession',
        write: () => cloudStore.clearSession(),
        // The token and the selection disappear together — leaving a cloud is, observably, one change.
        kinds: ['cloud:token', 'selection'],
    },
    { name: 'identityStore.setDelegatorId', write: () => identityStore.setDelegatorId('deleg-1'), kinds: ['identity'] },
    // null is the delete path. It's a removal rather than a save, but state still moved, so the
    // notification is the same.
    {
        name: 'identityStore.setDelegatorId(null)',
        write: () => identityStore.setDelegatorId(null),
        kinds: ['identity'],
    },
    { name: 'identityStore.setDeviceId', write: () => identityStore.setDeviceId('device-1'), kinds: ['identity'] },
    { name: 'identityStore.setDeviceId(null)', write: () => identityStore.setDeviceId(null), kinds: ['identity'] },
];

describe('세션 스토어 — 쓰기마다 자기 종류를 통지한다 (원칙 8)', () => {
    it.each(WRITES)('$name → $kinds', ({ write, kinds }) => {
        write();

        expect(mockEmitted).toEqual(kinds);
    });
});

describe('세션 스토어 — 통지하지 않는 쓰기', () => {
    /**
     * The one legitimate exception, and the reason is in the name: it's a cache, not session state.
     * Notifying would tack on one more re-derivation per cloud switch, and no subscriber reads this
     * value anyway.
     */
    it('setCachedCloudTokens는 세션 상태가 아니라 캐시라 아무것도 emit하지 않는다', () => {
        cloudStore.setCachedCloudTokens('cloud-1', { cloudToken: TOKEN, delegationToken: TOKEN } as never);

        expect(mockEmitted).toEqual([]);
    });

    it('읽기는 통지하지 않는다 — 만료된 캐시 항목을 스스로 지우는 읽기까지', () => {
        // Seed an expired entry and getCachedCloudTokens deletes it right there (it writes). Even so
        // there must be no notification: no state actually moved, and the expiry was already an
        // observable fact.
        cloudStore.setCachedCloudTokens('cloud-1', {
            cloudToken: { Token: { credential: { Expiration: new Date(Date.now() - 1000).toISOString() } } },
            delegationToken: TOKEN,
        } as never);
        mockEmitted.length = 0;

        expect(cloudStore.getCachedCloudTokens('cloud-1')).toBeNull();
        expect(mockEmitted).toEqual([]);
    });
});

describe('세션 스토어 — 유스케이스 하나는 팬아웃 하나 (원칙 8 후반)', () => {
    it('clearSession의 두 종류는 한 batch 안에서 나온다', () => {
        cloudStore.clearSession();

        // If the two emits were outside a batch, an observer would see an intermediate state once —
        // "the token is gone but the selection is still here" — exactly the state Decision 2 got rid of.
        expect(mockBatches).toEqual([['cloud:token', 'selection']]);
    });

    it('단건 쓰기는 batch를 열지 않는다 — 경계는 유스케이스의 것이다', () => {
        relayStore.saveRelayToken(TOKEN);

        expect(mockBatches).toEqual([]);
    });
});

describe('세션 스토어 — 쓰기 인구조사', () => {
    /**
     * Confirms the table above covers the stores' entire write surface. Add a new write method
     * without updating the table and this fails — that's the device keeping this file from going
     * stale. The naming convention (`save*`/`set*`/`clear*`) is the criterion, and a write that
     * doesn't follow the prefix is itself something to flag in review.
     */
    it('표가 세 스토어의 쓰기 메서드를 전부 덮는다', () => {
        const covered = new Set(
            WRITES.map(entry => entry.name.replace(/\(null\)$/, '')).concat([
                'cloudStore.setCachedCloudTokens', // covered by the exception suite above
            ])
        );

        // Methods live on the prototype, not the instance — `Object.keys(store)` would return 0 and
        // the census would pass silently. This file's first version passed exactly that way.
        const methodsOf = (store: object, label: string): string[] =>
            Object.getOwnPropertyNames(Object.getPrototypeOf(store))
                .filter(key => key !== 'constructor')
                .map(key => `${label}.${key}`);

        const surface = [
            ...methodsOf(relayStore, 'relayStore'),
            ...methodsOf(cloudStore, 'cloudStore'),
            ...methodsOf(identityStore, 'identityStore'),
        ];
        const writes = surface.filter(name => /\.(save|set|clear)[A-Z]/.test(name));

        expect(writes.length).toBeGreaterThan(0);
        expect(writes.filter(name => !covered.has(name))).toEqual([]);
    });
});
