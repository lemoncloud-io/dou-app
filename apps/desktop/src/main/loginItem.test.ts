import { createLoginItem, type LoginItemHost } from './loginItem';

/** Stands in for Electron's `app`, which jest cannot import (see jest.config.js). */
const fakeHost = (openAtLogin = false) => {
    const calls: { openAtLogin: boolean }[] = [];
    let current = openAtLogin;
    const host: LoginItemHost = {
        getLoginItemSettings: () => ({ openAtLogin: current }),
        setLoginItemSettings: settings => {
            calls.push(settings);
            current = settings.openAtLogin;
        },
    };
    return { host, calls };
};

describe('createLoginItem on a supported platform', () => {
    it('reads the current OS setting', () => {
        const { host } = fakeHost(true);
        expect(createLoginItem(host, 'darwin').read()).toEqual({ enabled: true, supported: true });
    });

    it('defaults to off when the OS has no login item registered', () => {
        const { host } = fakeHost(false);
        expect(createLoginItem(host, 'win32').read()).toEqual({ enabled: false, supported: true });
    });

    it('writes the requested state to the OS', () => {
        const { host, calls } = fakeHost(false);
        expect(createLoginItem(host, 'darwin').write(true)).toEqual({ enabled: true, supported: true });
        expect(calls).toEqual([{ openAtLogin: true }]);
    });

    it('turns the login item back off', () => {
        const { host, calls } = fakeHost(true);
        expect(createLoginItem(host, 'win32').write(false)).toEqual({ enabled: false, supported: true });
        expect(calls).toEqual([{ openAtLogin: false }]);
    });

    it('reports what the OS actually did, not what was asked', () => {
        // macOS 13+ can answer `requires-approval` and leave openAtLogin false. Echoing the
        // request would leave the toggle showing a state the OS never entered.
        const host: LoginItemHost = {
            getLoginItemSettings: () => ({ openAtLogin: false }),
            setLoginItemSettings: () => undefined,
        };
        expect(createLoginItem(host, 'darwin').write(true)).toEqual({ enabled: false, supported: true });
    });
});

describe('createLoginItem on an unsupported platform', () => {
    it('reports unsupported instead of guessing', () => {
        const { host } = fakeHost(true);
        expect(createLoginItem(host, 'linux').read()).toEqual({ enabled: false, supported: false });
    });

    it('never touches the OS on write', () => {
        const { host, calls } = fakeHost(false);
        expect(createLoginItem(host, 'linux').write(true)).toEqual({ enabled: false, supported: false });
        expect(calls).toEqual([]);
    });
});
