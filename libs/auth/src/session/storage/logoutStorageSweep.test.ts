import { MemoryMedium } from '@chatic/storage';
import { sessionMedia } from '@chatic/session/store/ports';

import { logoutStorageSweeper } from './logoutStorageSweep';

const setUrl = (search: string): void => window.history.replaceState({}, '', `/${search}`);

describe('logoutStorageSweeper', () => {
    let plain: MemoryMedium;

    beforeEach(() => {
        plain = new MemoryMedium();
        sessionMedia.configure({ secret: new MemoryMedium(), plain });
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

    it('takes the app keys a sign-out takes, from the plain medium, on a document opened by logout', () => {
        setUrl('?logout=1');

        logoutStorageSweeper.sweep();

        expect(plain.keys().sort()).toEqual(['@chatic.i18nextLng', '@chatic/config.ui.theme', 'push-reg:v1:u:d:web']);
    });

    it('does nothing without the flag — a plain reload keeps everything', () => {
        logoutStorageSweeper.sweep();

        expect(plain.keys()).toHaveLength(6);
    });

    it('never fails the boot when storage throws', () => {
        sessionMedia.configure({
            secret: new MemoryMedium(),
            plain: Object.assign(new MemoryMedium(), {
                keys: () => {
                    throw new Error('SecurityError');
                },
            }),
        });
        setUrl('?logout=1');

        expect(() => logoutStorageSweeper.sweep()).not.toThrow();
    });
});
