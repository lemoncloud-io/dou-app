import { deviceDisplayName, pairingClientOf } from './pairingClient';

const MAC_CHROME =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

describe('pairingClientOf', () => {
    it('names a browser after its browser and system', () => {
        expect(pairingClientOf({ userAgent: MAC_CHROME })).toEqual({ name: 'Chrome · macOS', platform: 'web' });
    });

    it.each([
        ['ios', 'iPhone'],
        ['android', 'Android'],
    ])('names a %s app after its system — its injected model is only a hardware id', (appPlatform, name) => {
        expect(pairingClientOf({ appPlatform, userAgent: MAC_CHROME })).toEqual({ name, platform: appPlatform });
    });

    it('sends no name for a browser it cannot identify', () => {
        expect(pairingClientOf({ userAgent: 'curl/8.0' })).toEqual({ platform: 'web' });
    });
});

describe('deviceDisplayName', () => {
    it.each([
        ['ios', 'iPhone'],
        ['android', 'Android'],
    ])('names a %s phone after its system, not the user agent the server kept for it', (platform, name) => {
        expect(deviceDisplayName({ platform, name: MAC_CHROME })).toBe(name);
    });

    it('names the desktop app after its system', () => {
        expect(deviceDisplayName({ platform: 'macos', name: `${MAC_CHROME} Electron/38.0.0` })).toBe('macOS');
    });

    it('turns a stored user agent into `<browser> · <OS>`', () => {
        expect(deviceDisplayName({ platform: 'web', name: MAC_CHROME })).toBe('Chrome · macOS');
        expect(deviceDisplayName({ name: MAC_CHROME })).toBe('Chrome · macOS');
    });

    it('keeps a name the device saved itself', () => {
        expect(deviceDisplayName({ platform: 'web', name: 'Chrome · macOS' })).toBe('Chrome · macOS');
    });

    it('has nothing to show for a missing name or an unreadable user agent', () => {
        expect(deviceDisplayName({ platform: 'web' })).toBeUndefined();
        expect(deviceDisplayName({ name: '  ' })).toBeUndefined();
        expect(deviceDisplayName({ name: 'Mozilla/5.0 (compatible; Bot)' })).toBeUndefined();
    });
});
