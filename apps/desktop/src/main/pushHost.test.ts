import { join } from 'node:path';

const powerOn = jest.fn();
const appOn = jest.fn();
const blockerStart = jest.fn();

jest.mock('electron', () => ({
    app: { getPath: (name: string) => `/data/${name}`, on: (...args: unknown[]) => appOn(...args) },
    powerMonitor: { on: (...args: unknown[]) => powerOn(...args) },
    powerSaveBlocker: { start: (...args: unknown[]) => blockerStart(...args) },
}));

import { electronPushHost } from './pushHost';

describe('electronPushHost', () => {
    it('keeps the credentials file under userData where it always was', () => {
        expect(electronPushHost().credentialsPath).toBe(join('/data/userData', 'chatic-fcm.json'));
    });

    it('reconnects on resume and unlock, and passes window focus through', () => {
        const host = electronPushHost();
        const reconnect = jest.fn();
        host.onWake?.(reconnect);
        host.onFocus?.(reconnect);
        expect(powerOn.mock.calls).toEqual([
            ['resume', reconnect],
            ['unlock-screen', reconnect],
        ]);
        expect(appOn).toHaveBeenCalledWith('browser-window-focus', reconnect);
    });

    it('keeps the app awake with a prevent-app-suspension blocker', () => {
        electronPushHost().keepAwake?.();
        expect(blockerStart).toHaveBeenCalledWith('prevent-app-suspension');
    });
});
