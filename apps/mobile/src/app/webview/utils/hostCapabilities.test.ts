import { hostCapabilities } from './hostCapabilities';

// Every key past checkout: this app does each one itself.
const APP_DOES_IT = {
    media: 'app',
    files: 'app',
    links: 'app',
    appShell: 'app',
    signIn: 'app',
    diagnostics: 'app',
    push: 'app',
};

describe('hostCapabilities', () => {
    it("declares Apple's store on iOS", () => {
        expect(hostCapabilities('ios')).toEqual({ version: 4, checkout: ['apple'], ...APP_DOES_IT });
    });

    it("declares Google's store on Android", () => {
        expect(hostCapabilities('android')).toEqual({ version: 4, checkout: ['google'], ...APP_DOES_IT });
    });

    it('never offers the website, which a store-distributed app may not point a buyer at', () => {
        expect(hostCapabilities('ios').checkout).not.toContain('web');
        expect(hostCapabilities('android').checkout).not.toContain('web');
    });
});
