import { pairingClientOf } from './pageDevice';

describe('pairingClientOf', () => {
    afterEach(() => {
        delete (window as unknown as { CHATIC_APP_PLATFORM?: string }).CHATIC_APP_PLATFORM;
    });

    it("names a phone after its system, from the shell's platform the page was given", () => {
        (window as unknown as { CHATIC_APP_PLATFORM?: string }).CHATIC_APP_PLATFORM = 'ios';
        expect(pairingClientOf()).toEqual({ name: 'iPhone', platform: 'ios' });
    });

    it("reads a browser from the page's own user agent, with no runtime configured", () => {
        expect(pairingClientOf().platform).toBe('web');
    });
});
