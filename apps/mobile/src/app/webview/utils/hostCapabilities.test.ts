import { hostCapabilities } from './hostCapabilities';

describe('hostCapabilities', () => {
    it("declares Apple's store on iOS", () => {
        expect(hostCapabilities('ios')).toEqual({ version: 1, checkout: ['apple'] });
    });

    it("declares Google's store on Android", () => {
        expect(hostCapabilities('android')).toEqual({ version: 1, checkout: ['google'] });
    });

    it('never offers the website, which a store-distributed app may not point a buyer at', () => {
        expect(hostCapabilities('ios').checkout).not.toContain('web');
        expect(hostCapabilities('android').checkout).not.toContain('web');
    });
});
