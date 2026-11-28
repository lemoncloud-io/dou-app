import { getCustomUiApi, getDownloadsApi, getLoginItemApi, getShellApp } from './preload';

afterEach(() => {
    delete window.electronAPI;
});

describe('preload readers', () => {
    it('reads nothing outside the desktop app', () => {
        expect(getShellApp()).toBeUndefined();
        expect(getCustomUiApi()).toBeUndefined();
        expect(getLoginItemApi()).toBeUndefined();
        expect(getDownloadsApi()).toBeUndefined();
    });

    it("reads the app's version and platform, and each optional API the preload exposes", () => {
        const loginItem = { get: jest.fn(), set: jest.fn() };
        window.electronAPI = { appVersion: '1.4.0', platform: 'darwin', loginItem };

        expect(getShellApp()).toEqual({ appVersion: '1.4.0', platform: 'darwin' });
        expect(getLoginItemApi()).toBe(loginItem);
        expect(getCustomUiApi()).toBeUndefined();
        expect(getDownloadsApi()).toBeUndefined();
    });
});
