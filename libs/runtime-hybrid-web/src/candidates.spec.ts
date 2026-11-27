import 'fake-indexeddb/auto';

import { MemoryStore } from '@chatic/storage';
import type { NativeSecureStore } from '@chatic/storage';
import type { RuntimeEngine } from '@chatic/runtime-core';
import type { WebHostFacts } from '@chatic/runtime-web';

jest.mock('./createBridgedRuntime', () => ({ createBridgedRuntime: () => ({ id: 'mirror' }) }));
jest.mock('@chatic/logger', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@chatic/logger';

import { engineCandidates, engineLocal, engineShell } from './adapters/engine';
import { chooseCandidate } from './candidates';
import { routedCachePorts } from './localCache/routedCachePorts';
import { resolveStorageStores } from './storage/resolveStorageStores';

const info = logger.info as jest.Mock;
const lines = () => info.mock.calls.map(call => call[1] as string);
const core = { id: 'core' } as unknown as RuntimeEngine;

beforeEach(() => info.mockClear());

describe('chooseCandidate', () => {
    it('takes the first candidate that supports the context and says why the earlier ones were passed over', () => {
        const choice = chooseCandidate(
            [
                { id: 'a', supports: () => false, because: 'a fits', refused: 'no a here' },
                { id: 'b', because: 'b fits' },
            ],
            {}
        );
        expect(choice.chosen.id).toBe('b');
        expect(choice.reason).toBe('b fits; not a: no a here');
    });

    it('fails loudly when no candidate fits', () => {
        expect(() => chooseCandidate([{ id: 'a', supports: () => false, because: '' }], {})).toThrow(/no candidate/);
    });
});

describe('the boot log', () => {
    it('says the engine ran in the shell, and why', async () => {
        const settle = async () => ({
            sessionOwner: 'native' as const,
            contract: 2,
            hello: { seq: 1, session: {} as never },
            port: {} as never,
        });
        await engineCandidates('engine.mirror', [engineShell({ settle }), engineLocal]).create({
            facts: { runtimeOffer: {} } as WebHostFacts,
            core: async () => core,
        });
        expect(lines()).toContain('[hybrid] engine → engine.shell (the shell holds the session (contract 2))');
    });

    it('says the engine ran in the page, and why the shell did not take it', async () => {
        const settle = async () => ({ sessionOwner: 'web' as const });
        const outcome = await engineCandidates('engine.mirror', [engineShell({ settle }), engineLocal]).create({
            facts: { runtimeOffer: undefined } as WebHostFacts,
            core: async () => core,
        });
        expect(outcome).toEqual({ engine: core, owner: { sessionOwner: 'web' } });
        expect(lines()).toContain(
            '[hybrid] engine → engine.local (the page runs the session; not engine.shell: the host offers no runtime)'
        );
    });

    it('says where the secret and plain state are kept', () => {
        resolveStorageStores(
            { inShell: true, shellKeepsVault: true, lateVaultConfirmed: false },
            () => ({}) as NativeSecureStore
        );
        expect(lines()).toEqual([
            '[hybrid] storage.secret → vault (the shell keeps a vault, said at launch or confirmed late)',
            '[hybrid] storage.plain → webLocal (a shell keeps it across relaunches)',
        ]);
    });

    it('says which store each cache domain went to, and why', () => {
        const store = { storage: jest.fn(), globalSearch: jest.fn() };
        const ports = routedCachePorts({
            bridge: 'react-native-webview',
            support: () => ({ schemaVersion: 1, types: new Set(), domainVersions: {}, messages: new Set() }),
            indexedDb: store as never,
            shellSqlite: store as never,
            webStorage: new MemoryStore() as never,
        });
        ports.routed([
            { type: 'invite', route: 'web' },
            { type: 'chat', route: 'native' },
        ]);
        expect(lines()[0]).toBe('[hybrid] cache domains → chat → native, invite → web (bridge react-native-webview)');
        expect(info.mock.calls[0][2].data.domains.invite.because).toMatch(/^IndexedDB; not native:/);
    });
});
