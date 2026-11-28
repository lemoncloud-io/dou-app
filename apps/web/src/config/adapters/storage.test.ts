import { pageStorageAreas, tabStorageStores, vaultStorageStores } from '@chatic/runtime-hybrid-web';
import type { StorageStores, WebHostFacts } from '@chatic/runtime-hybrid-web';

import { storageResolved } from './storage';

const mockPrepare = jest.fn();
jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        boot: { prepareSecretStorage: (...args: unknown[]) => mockPrepare(...args) },
    })
);

const mockRead = jest.fn();
jest.mock('@chatic/bridges', () => ({
    ...jest.requireActual('@chatic/bridges'),
    BridgeStorageChannel: jest.fn().mockImplementation(() => ({ read: () => mockRead() })),
}));

const facts = {} as WebHostFacts;

const fakeVault = (status: 'available' | 'unavailable') =>
    ({ status }) as unknown as NonNullable<StorageStores['vault']>;

const vaultStores = (status: 'available' | 'unavailable' = 'available'): StorageStores =>
    vaultStorageStores({ ...pageStorageAreas(), vault: fakeVault(status) });

const setVisibility = (state: DocumentVisibilityState) =>
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });

beforeEach(() => {
    jest.clearAllMocks();
    mockPrepare.mockResolvedValue('vault');
    setVisibility('visible');
});

describe('storage.resolved', () => {
    it('hands out the very stores the entry resolved, not copies of them', async () => {
        const stores = tabStorageStores(pageStorageAreas());

        const built = await storageResolved(stores).create({ facts });

        expect(built.secret).toBe(stores.secret);
        expect(built.plain).toBe(stores.plain);
        expect(built.device).toBe(stores.device);
        expect(built.tab).toBe(stores.webSession);
        expect(mockPrepare).not.toHaveBeenCalled();
    });

    it('loads the vault before the boot on a launch the page owns', async () => {
        const stores = vaultStores();

        await storageResolved(stores).create({ facts, sessionOwner: 'web' });

        expect(mockPrepare).toHaveBeenCalledWith({
            vault: stores.vault,
            plain: stores.plain,
            web: stores.webLocal,
            tab: stores.webSession,
            afterLogout: false,
        });
    });

    it('loads the vault when nothing settled the owner, as a launch the page owns', async () => {
        await storageResolved(vaultStores()).create({ facts });

        expect(mockPrepare).toHaveBeenCalledTimes(1);
    });

    it('never opens the vault on a launch the shell owns', async () => {
        const stores = vaultStores();

        const built = await storageResolved(stores).create({ facts, sessionOwner: 'native' });

        expect(mockPrepare).not.toHaveBeenCalled();
        expect(built.secret).toBe(stores.vault);
    });

    it('hears the logout flag the shell restarts the page with', async () => {
        window.history.replaceState(null, '', '/?logout=1');
        try {
            await storageResolved(vaultStores()).create({ facts, sessionOwner: 'web' });
        } finally {
            window.history.replaceState(null, '', '/');
        }

        expect(mockPrepare).toHaveBeenCalledWith(expect.objectContaining({ afterLogout: true }));
    });
});

describe('storage.resolved — a vault unreadable at launch', () => {
    it.each(['unavailable', 'unavailable-with-web-copy'])(
        'starts over once the shown page finds the vault readable (%s)',
        async outcome => {
            mockPrepare.mockResolvedValue(outcome);
            const listen = jest.spyOn(document, 'addEventListener');
            const unlisten = jest.spyOn(document, 'removeEventListener');
            const reload = jest.fn();
            await storageResolved(vaultStores('unavailable'), reload).create({ facts, sessionOwner: 'web' });
            const onVisible = listen.mock.calls.find(
                ([type]) => type === 'visibilitychange'
            )?.[1] as () => Promise<void>;
            expect(onVisible).toBeDefined();

            mockRead.mockResolvedValueOnce({ status: 'unavailable' });
            await onVisible();
            expect(unlisten).not.toHaveBeenCalledWith('visibilitychange', onVisible);
            expect(reload).not.toHaveBeenCalled();

            setVisibility('hidden');
            await onVisible();
            expect(mockRead).toHaveBeenCalledTimes(1);

            setVisibility('visible');
            mockRead.mockResolvedValueOnce({ status: 'available' });
            await onVisible();
            expect(unlisten).toHaveBeenCalledWith('visibilitychange', onVisible);
            expect(reload).toHaveBeenCalledTimes(1);
            listen.mockRestore();
            unlisten.mockRestore();
        }
    );

    it('does not watch a vault that answered at launch', async () => {
        const listen = jest.spyOn(document, 'addEventListener');
        for (const outcome of ['vault', 'migrated', 'empty']) {
            mockPrepare.mockResolvedValueOnce(outcome);
            await storageResolved(vaultStores()).create({ facts, sessionOwner: 'web' });
        }

        expect(listen.mock.calls.some(([type]) => type === 'visibilitychange')).toBe(false);
        listen.mockRestore();
    });
});
