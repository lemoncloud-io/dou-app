import { authPlatform } from '../../platform';
import { fakeAuthPorts } from '../../testing/platform';
import { MemoryStore } from '@chatic/storage';
import { sessionStores } from '@chatic/session/store/ports';

import { logoutStorageSweeper } from './logoutStorageSweep';
import { signedOutAppKeys } from './signedOutAppKeys.util';

import type * as SweepModule from './logoutStorageSweep';

const setUrl = (search: string): void => window.history.replaceState({}, '', `/${search}`);

// The address the sweep reads its flag from: the jsdom page's.
beforeEach(() => authPlatform.configure(fakeAuthPorts()));

describe('logoutStorageSweeper', () => {
    let plain: MemoryStore;

    beforeEach(() => {
        plain = new MemoryStore();
        sessionStores.configure({ secret: new MemoryStore(), plain });
        // What apps/web's log and telemetry domains declare at boot.
        signedOutAppKeys.register(['@chatic/web.log.', '@chatic/web.telemetry.policy']);
        [
            '@chatic/web.log.pending.tab-1',
            '@chatic/web.log.alive',
            '@chatic/web.telemetry.policy',
            '@chatic/config.ui.theme',
            '@chatic.i18nextLng',
            'push-reg:v1:u:d:web',
        ].forEach(key => plain.set(key, 'x'));
        setUrl('');
    });

    it('takes the app keys a sign-out takes, from the plain store, on a document opened by logout', () => {
        setUrl('?logout=1');

        logoutStorageSweeper.sweep();

        expect(plain.keys().sort()).toEqual(['@chatic.i18nextLng', '@chatic/config.ui.theme', 'push-reg:v1:u:d:web']);
    });

    it('takes nothing when no domain declared a prefix — an app without those domains', () => {
        signedOutAppKeys.register([]);
        setUrl('?logout=1');

        logoutStorageSweeper.sweep();

        expect(plain.keys()).toHaveLength(6);
    });

    it("reads the flag from the platform's address, not the page's", () => {
        authPlatform.configure(fakeAuthPorts({ currentSearch: () => '?logout=1' }));

        logoutStorageSweeper.sweep();

        expect(plain.keys()).toHaveLength(3);
    });

    it('fails the boot when the platform was never wired, instead of skipping the sweep in silence', () => {
        jest.isolateModules(() => {
            const fresh = jest.requireActual<typeof SweepModule>('./logoutStorageSweep');
            expect(() => fresh.logoutStorageSweeper.sweep()).toThrow(/createRuntime/);
        });
    });

    it('does nothing without the flag — a plain reload keeps everything', () => {
        logoutStorageSweeper.sweep();

        expect(plain.keys()).toHaveLength(6);
    });

    it('never fails the boot when storage throws', () => {
        sessionStores.configure({
            secret: new MemoryStore(),
            plain: Object.assign(new MemoryStore(), {
                keys: () => {
                    throw new Error('SecurityError');
                },
            }),
        });
        setUrl('?logout=1');

        expect(() => logoutStorageSweeper.sweep()).not.toThrow();
    });
});
