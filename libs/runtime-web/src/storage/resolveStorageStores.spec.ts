import { TolerantStore } from '@chatic/storage';

import { LATE_VAULT_MARK, readStorageEnvironment, resolveStorageStores } from './resolveStorageStores';

import type { NativeSecureStore } from '@chatic/storage';

const mockIsNative = jest.fn();
const mockShellKeeps = jest.fn();
jest.mock('@chatic/bridges', () => ({
    isNative: () => mockIsNative(),
    shellKeepsStorageMedium: (medium: string) => mockShellKeeps(medium),
    webClient: {},
    BridgeStorageChannel: jest.fn(),
}));

const fakeVault = { name: 'vault' } as unknown as NativeSecureStore;
const vaultFactory = jest.fn(() => fakeVault);

describe('resolveStorageStores', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        vaultFactory.mockClear();
    });

    it('puts the secrets in the vault and the plain state in localStorage inside a shell that keeps one', () => {
        const stores = resolveStorageStores(
            { inShell: true, shellKeepsVault: true, lateVaultConfirmed: false },
            vaultFactory
        );
        expect(stores.vault).toBe(fakeVault);
        expect(stores.secret).toBe(fakeVault);
        stores.plain.set('k', 'v');
        expect(localStorage.getItem('k')).toBe('v');
    });

    it('keeps both session ports in localStorage in a shell from before the vault', () => {
        const stores = resolveStorageStores(
            { inShell: true, shellKeepsVault: false, lateVaultConfirmed: false },
            vaultFactory
        );
        expect(vaultFactory).not.toHaveBeenCalled();
        expect(stores.vault).toBeNull();
        expect(stores.secret).toBe(stores.plain);
        stores.secret.set('k', 'v');
        expect(localStorage.getItem('k')).toBe('v');
    });

    it('takes the vault when an earlier load of this tab confirmed it late', () => {
        const stores = resolveStorageStores(
            { inShell: true, shellKeepsVault: false, lateVaultConfirmed: true },
            vaultFactory
        );
        expect(stores.vault).toBe(fakeVault);
    });

    it('keeps the session in sessionStorage in a plain browser tab', () => {
        const stores = resolveStorageStores(
            { inShell: false, shellKeepsVault: false, lateVaultConfirmed: false },
            vaultFactory
        );
        expect(stores.vault).toBeNull();
        stores.secret.set('s', '1');
        stores.plain.set('p', '1');
        expect(sessionStorage.getItem('s')).toBe('1');
        expect(sessionStorage.getItem('p')).toBe('1');
        expect(localStorage.length).toBe(0);
    });

    it('keeps device state in localStorage and tab state in sessionStorage in every environment, tolerantly', () => {
        for (const inShell of [true, false]) {
            localStorage.clear();
            sessionStorage.clear();
            const stores = resolveStorageStores({ inShell, shellKeepsVault: false, lateVaultConfirmed: false });
            expect(stores.device).toBeInstanceOf(TolerantStore);
            expect(stores.tab).toBeInstanceOf(TolerantStore);
            stores.device.set('d', '1');
            stores.tab.set('t', '1');
            expect(localStorage.getItem('d')).toBe('1');
            expect(sessionStorage.getItem('t')).toBe('1');
        }
    });
});

describe('readStorageEnvironment', () => {
    beforeEach(() => sessionStorage.clear());

    it('reads the shell, the injected vault flag and the late-vault mark', () => {
        mockIsNative.mockReturnValue(true);
        mockShellKeeps.mockReturnValue(false);
        sessionStorage.setItem(LATE_VAULT_MARK, '1');
        expect(readStorageEnvironment()).toEqual({ inShell: true, shellKeepsVault: false, lateVaultConfirmed: true });
        expect(mockShellKeeps).toHaveBeenCalledWith('nativeSecure');
    });
});
