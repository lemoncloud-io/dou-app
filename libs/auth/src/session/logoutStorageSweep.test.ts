// Restores the `?logout=1` cleanup that left with `@chatic/web-config` (ADR-0079). The reason it
// could vanish unnoticed is that it was an import side effect: no symbol broke, no type moved, and
// every suite stayed green while sign-out silently stopped clearing anything. These tests are the
// replacement for that missing compile-time evidence.
import { type KeyValueStore, WebMedium } from '@chatic/storage';
import { sessionMedia } from '@chatic/session/store/ports';

import { logoutStorageSweeper } from './logoutStorageSweep';

// The transport is the SDK's assembly point; only the two answers the sweep asks for are faked.
const mockLemon: { storage: KeyValueStore | null } = { storage: null };
jest.mock('@chatic/transport', () => ({
    lemonStorage: () => mockLemon.storage,
    lemonKeyPrefix: () => '@chatic.',
}));

const setUrl = (search: string): void => window.history.replaceState({}, '', `/${search}`);

/** Where the session and lemon live: localStorage inside an app or desktop shell, sessionStorage in a browser. */
const useEnvironment = (where: 'shell' | 'browser'): void => {
    const medium = where === 'shell' ? WebMedium.local() : WebMedium.session();
    sessionMedia.configure({ secret: medium, plain: medium });
    mockLemon.storage = medium;
};

/**
 * Every kind of key the app writes, in both storages. The comments name the writer, so a new kind of
 * key added to the app shows up as missing here rather than as a silent change in what logout takes.
 */
const KEYS_THE_APP_WRITES = [
    '@chatic.identity_token', // lemon-web-core's credential bundle
    '@chatic.access_key_id',
    '@chatic.i18nextLng', // the language lemon sends, under lemon's prefix
    '@chatic_dev.i18nextLng', // the web's own i18n key
    '@chatic/config.ui.theme', // the settings lane
    '@chatic/web.log.pending.tab-1', // the log upload queue
    '@chatic/web.log.pending.alive.tab-1',
    '@chatic/web.log.pending.tab',
    '@chatic/web.log.alive', // the crash sentinel
    '@chatic/web.telemetry.policy',
    '@chatic/web.telemetry.policy.override',
    'chatic-relay-token', // the session — cleared by the logout itself, before the redirect
    'chatic-device-id',
    'chatic-oauth-provider', // retired
    'push-reg:v1:u1:d1:web', // push registration record
    'vite-ui-theme',
] as const;

/**
 * What the namespace sweep removed, before it was split by owner: every `@` key except the config lane
 * and the language keys, from the storage the session lives in; and the retired OAuth marker from
 * both. Fixed here so the split cannot quietly change what a sign-out takes.
 */
const REMOVED_BEFORE_THE_SPLIT = {
    sessionStore: [
        '@chatic.identity_token',
        '@chatic.access_key_id',
        '@chatic/web.log.pending.tab-1',
        '@chatic/web.log.pending.alive.tab-1',
        '@chatic/web.log.pending.tab',
        '@chatic/web.log.alive',
        '@chatic/web.telemetry.policy',
        '@chatic/web.telemetry.policy.override',
        'chatic-oauth-provider',
    ],
    otherStore: ['chatic-oauth-provider'],
};

const seedBoth = (): void => {
    for (const key of KEYS_THE_APP_WRITES) {
        localStorage.setItem(key, 'x');
        sessionStorage.setItem(key, 'x');
    }
};

const removedFrom = (storage: Storage): string[] => KEYS_THE_APP_WRITES.filter(key => storage.getItem(key) === null);

describe('logoutStorageSweeper', () => {
    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
        useEnvironment('browser');
        setUrl('');
    });

    it.each([
        ['shell', () => localStorage, () => sessionStorage],
        ['browser', () => sessionStorage, () => localStorage],
    ] as const)('removes exactly the keys the namespace sweep removed, in a %s', (where, sessionStore, otherStore) => {
        useEnvironment(where);
        seedBoth();
        setUrl('?logout=1');

        logoutStorageSweeper.sweep();

        expect(removedFrom(sessionStore()).sort()).toEqual([...REMOVED_BEFORE_THE_SPLIT.sessionStore].sort());
        expect(removedFrom(otherStore())).toEqual(REMOVED_BEFORE_THE_SPLIT.otherStore);
    });

    it('does nothing without the flag — a plain reload must keep the session', () => {
        sessionStorage.setItem('@chatic.identity_token', 'token');

        logoutStorageSweeper.sweep();

        expect(sessionStorage.getItem('@chatic.identity_token')).toBe('token');
    });

    it('keeps the language key and the config lane — both share the `@` prefix, neither is session state', () => {
        sessionStorage.setItem('@chatic.i18nextLng', 'ko');
        sessionStorage.setItem('@chatic/config.ui.theme', '"dark"');
        sessionStorage.setItem('@chatic.identity_token', 'token');
        setUrl('?logout=1');

        logoutStorageSweeper.sweep();

        expect(sessionStorage.getItem('@chatic.i18nextLng')).toBe('ko');
        expect(sessionStorage.getItem('@chatic/config.ui.theme')).toBe('"dark"');
        expect(sessionStorage.getItem('@chatic.identity_token')).toBeNull();
    });

    it('removes every matching key — the walk must not skip on removal', () => {
        for (let i = 0; i < 10; i++) sessionStorage.setItem(`@chatic.key${i}`, String(i));
        setUrl('?logout=1');

        logoutStorageSweeper.sweep();

        expect(sessionStorage.length).toBe(0);
    });

    it('never fails the boot when storage throws', () => {
        mockLemon.storage = {
            ...WebMedium.session(),
            keys: () => {
                throw new Error('SecurityError');
            },
        };
        setUrl('?logout=1');

        expect(() => logoutStorageSweeper.sweep()).not.toThrow();
    });
});
