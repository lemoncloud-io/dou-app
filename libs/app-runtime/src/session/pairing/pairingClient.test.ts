import { pairingClientOf } from './pairingClient';

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
