import { TolerantMedium } from '@chatic/storage';

import { LATE_VAULT_MARK, readStorageEnvironment, resolveStorageMedia } from './resolveStorageMedia';

import type { NativeSecureMedium } from '@chatic/storage';

const mockIsNative = jest.fn();
const mockShellKeeps = jest.fn();
jest.mock('@chatic/bridges', () => ({
    isNative: () => mockIsNative(),
    shellKeepsStorageMedium: (medium: string) => mockShellKeeps(medium),
    webClient: {},
    BridgeStorageChannel: jest.fn(),
}));

const fakeVault = { name: 'vault' } as unknown as NativeSecureMedium;
const vaultFactory = jest.fn(() => fakeVault);

describe('resolveStorageMedia', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        vaultFactory.mockClear();
    });

    it('puts the secrets in the vault and the plain state in localStorage inside a shell that keeps one', () => {
        const media = resolveStorageMedia(
            { inShell: true, shellKeepsVault: true, lateVaultConfirmed: false },
            vaultFactory
        );
        expect(media.vault).toBe(fakeVault);
        expect(media.secret).toBe(fakeVault);
        media.plain.set('k', 'v');
        expect(localStorage.getItem('k')).toBe('v');
    });

    it('keeps both session ports in localStorage in a shell from before the vault', () => {
        const media = resolveStorageMedia(
            { inShell: true, shellKeepsVault: false, lateVaultConfirmed: false },
            vaultFactory
        );
        expect(vaultFactory).not.toHaveBeenCalled();
        expect(media.vault).toBeNull();
        expect(media.secret).toBe(media.plain);
        media.secret.set('k', 'v');
        expect(localStorage.getItem('k')).toBe('v');
    });

    it('takes the vault when an earlier load of this tab confirmed it late', () => {
        const media = resolveStorageMedia(
            { inShell: true, shellKeepsVault: false, lateVaultConfirmed: true },
            vaultFactory
        );
        expect(media.vault).toBe(fakeVault);
    });

    it('keeps the session in sessionStorage in a plain browser tab', () => {
        const media = resolveStorageMedia(
            { inShell: false, shellKeepsVault: false, lateVaultConfirmed: false },
            vaultFactory
        );
        expect(media.vault).toBeNull();
        media.secret.set('s', '1');
        media.plain.set('p', '1');
        expect(sessionStorage.getItem('s')).toBe('1');
        expect(sessionStorage.getItem('p')).toBe('1');
        expect(localStorage.length).toBe(0);
    });

    it('keeps device state in localStorage and tab state in sessionStorage in every environment, tolerantly', () => {
        for (const inShell of [true, false]) {
            localStorage.clear();
            sessionStorage.clear();
            const media = resolveStorageMedia({ inShell, shellKeepsVault: false, lateVaultConfirmed: false });
            expect(media.device).toBeInstanceOf(TolerantMedium);
            expect(media.tab).toBeInstanceOf(TolerantMedium);
            media.device.set('d', '1');
            media.tab.set('t', '1');
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
