import { MemoryStore } from '@chatic/storage';

import type { ActiveStores, ActiveVault } from '../../../runtime/activeStorage';
import { activeKeyValueMedia, formatValueForEdit, readKeyValueEntries, valueToStore } from './keyValueMedia';

jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        session: { isSessionKey: (key: string) => key === 'chatic-relay-token' },
    })
);

const vaultOf = (status: 'available' | 'unavailable', entries: Record<string, string> = {}): ActiveVault => {
    const store = new MemoryStore();
    for (const [k, v] of Object.entries(entries)) store.set(k, v);
    return Object.assign(store, { status });
};

const tabStores = (): ActiveStores => {
    const webSession = new MemoryStore();
    return { secret: webSession, plain: webSession, vault: null, webLocal: new MemoryStore(), webSession };
};

const vaultStores = (vault: ActiveVault): ActiveStores => {
    const webLocal = new MemoryStore();
    return { secret: vault, plain: webLocal, vault, webLocal, webSession: new MemoryStore() };
};

describe('activeKeyValueMedia', () => {
    it('lists a plain tab as two media, the session in sessionStorage', () => {
        const media = activeKeyValueMedia(tabStores(), 'web');

        expect(media.map(m => [m.medium, m.roles])).toEqual([
            ['localStorage', ['device']],
            ['sessionStorage', ['secret', 'plain', 'tab']],
        ]);
    });

    it('lists the vault first, holding the secrets, when the run has one', () => {
        const media = activeKeyValueMedia(vaultStores(vaultOf('available')), 'web');

        expect(media.map(m => [m.medium, m.roles, m.blocked])).toEqual([
            ['vault', ['secret'], undefined],
            ['localStorage', ['plain', 'device'], undefined],
            ['sessionStorage', ['tab'], undefined],
        ]);
    });

    it('marks the vault blocked when the app holds the session or could not read it', () => {
        expect(activeKeyValueMedia(vaultStores(vaultOf('available')), 'native')[0].blocked).toBe('nativeOwned');
        expect(activeKeyValueMedia(vaultStores(vaultOf('unavailable')), 'web')[0].blocked).toBe('unavailable');
    });
});

describe('readKeyValueEntries', () => {
    it('reads every key of the unblocked media, grouped and sized, sorted by key', () => {
        const stores = vaultStores(vaultOf('available', { 'chatic-relay-token': 'tok' }));
        stores.webLocal.set('ui.theme', 'dark');
        stores.webLocal.set('@chatic/config.ui.lang', '"ko"');

        expect(readKeyValueEntries(activeKeyValueMedia(stores, 'web'))).toEqual([
            {
                id: 'vault:chatic-relay-token',
                medium: 'vault',
                key: 'chatic-relay-token',
                value: 'tok',
                group: 'session',
                bytes: 21,
            },
            {
                id: 'localStorage:@chatic/config.ui.lang',
                medium: 'localStorage',
                key: '@chatic/config.ui.lang',
                value: '"ko"',
                group: 'config',
                bytes: 26,
            },
            {
                id: 'localStorage:ui.theme',
                medium: 'localStorage',
                key: 'ui.theme',
                value: 'dark',
                group: 'other',
                bytes: 12,
            },
        ]);
    });

    it('reads nothing from a blocked vault and skips a store that throws', () => {
        const stores = vaultStores(vaultOf('available', { 'chatic-relay-token': 'tok' }));
        stores.webSession.keys = () => {
            throw new Error('blocked');
        };

        expect(readKeyValueEntries(activeKeyValueMedia(stores, 'native'))).toEqual([]);
    });
});

describe('value editing', () => {
    it('pretty-prints JSON for the editor and leaves other text alone', () => {
        expect(formatValueForEdit('{"a":1}')).toBe('{\n  "a": 1\n}');
        expect(formatValueForEdit('plain')).toBe('plain');
        expect(formatValueForEdit('{broken')).toBe('{broken');
    });

    it('stores JSON compact and anything else exactly as typed', () => {
        expect(valueToStore('{\n  "a": 1\n}')).toBe('{"a":1}');
        expect(valueToStore(' spaced ')).toBe(' spaced ');
        expect(valueToStore('[broken')).toBe('[broken');
    });
});
