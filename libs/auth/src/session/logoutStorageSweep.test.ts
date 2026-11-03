// Restores the `?logout=1` cleanup that left with `@chatic/web-config` (ADR-0079). The reason it
// could vanish unnoticed is that it was an import side effect: no symbol broke, no type moved, and
// every suite stayed green while sign-out silently stopped clearing anything. These tests are the
// replacement for that missing compile-time evidence.
import { isNative } from '@chatic/bridges';

import { logoutStorageSweeper } from './logoutStorageSweep';

jest.mock('@chatic/bridges', () => ({ isNative: jest.fn(() => false) }));

const mockIsNative = isNative as jest.MockedFunction<typeof isNative>;

const setUrl = (search: string): void => window.history.replaceState({}, '', `/${search}`);

describe('logoutStorageSweeper', () => {
    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
        mockIsNative.mockReturnValue(false);
        setUrl('');
    });

    it('clears the lemon token bundle when the URL carries `?logout=1`', () => {
        sessionStorage.setItem('@chatic.identity_token', 'token');
        sessionStorage.setItem('@chatic.accountId', 'acc');
        setUrl('?logout=1');

        logoutStorageSweeper.sweep();

        expect(sessionStorage.getItem('@chatic.identity_token')).toBeNull();
        expect(sessionStorage.getItem('@chatic.accountId')).toBeNull();
    });

    it('does nothing without the flag — a plain reload must keep the session', () => {
        sessionStorage.setItem('@chatic.identity_token', 'token');

        logoutStorageSweeper.sweep();

        expect(sessionStorage.getItem('@chatic.identity_token')).toBe('token');
    });

    it('keeps the language key and the config lane — both share the `@` prefix, neither is session state', () => {
        sessionStorage.setItem('@chatic_dev.i18nextLng', 'ko');
        sessionStorage.setItem('@chatic/config.ui.theme', '"dark"');
        sessionStorage.setItem('@chatic.identity_token', 'token');
        setUrl('?logout=1');

        logoutStorageSweeper.sweep();

        expect(sessionStorage.getItem('@chatic_dev.i18nextLng')).toBe('ko');
        expect(sessionStorage.getItem('@chatic/config.ui.theme')).toBe('"dark"');
        expect(sessionStorage.getItem('@chatic.identity_token')).toBeNull();
    });

    it('leaves keys outside the `@` namespace alone', () => {
        sessionStorage.setItem('push-reg:v1:u1:d1:web', '{}');
        setUrl('?logout=1');

        logoutStorageSweeper.sweep();

        expect(sessionStorage.getItem('push-reg:v1:u1:d1:web')).toBe('{}');
    });

    it('sweeps localStorage inside a native shell — that is where the session lives there', () => {
        mockIsNative.mockReturnValue(true);
        localStorage.setItem('@chatic.identity_token', 'token');
        sessionStorage.setItem('@chatic.identity_token', 'other-tab');
        setUrl('?logout=1');

        logoutStorageSweeper.sweep();

        expect(localStorage.getItem('@chatic.identity_token')).toBeNull();
        // Only the storage the app actually uses is swept, exactly as before ADR-0079.
        expect(sessionStorage.getItem('@chatic.identity_token')).toBe('other-tab');
    });

    it('clears the OAuth provider marker from BOTH storages — either one can hold it', () => {
        sessionStorage.setItem('chatic-oauth-provider', 'google');
        localStorage.setItem('chatic-oauth-provider', 'google');
        setUrl('?logout=1');

        logoutStorageSweeper.sweep();

        expect(sessionStorage.getItem('chatic-oauth-provider')).toBeNull();
        expect(localStorage.getItem('chatic-oauth-provider')).toBeNull();
    });

    it('removes every matching key — the index walk must not skip on removal', () => {
        for (let i = 0; i < 10; i++) sessionStorage.setItem(`@chatic.key${i}`, String(i));
        setUrl('?logout=1');

        logoutStorageSweeper.sweep();

        expect(sessionStorage.length).toBe(0);
    });
});
