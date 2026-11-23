import { hostCapabilities } from './hostCapabilities';

const APP_DOES_IT = {
    media: 'shell',
    files: 'shell',
    links: 'shell',
    appShell: 'shell',
    signIn: 'shell',
    diagnostics: 'shell',
    push: 'shell',
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
