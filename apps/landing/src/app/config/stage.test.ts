import { readProductionBuild, readStage, readSubscriptionAccountEnabled } from './stage';

describe('readStage', () => {
    it('reads the local dev server as local and dev', () => {
        expect(readStage('localhost', true)).toEqual({ isLocalhost: true, isDevStage: true, isProductionHost: false });
        expect(readStage('127.0.0.1', true)).toEqual({ isLocalhost: true, isDevStage: true, isProductionHost: false });
    });

    it('reads the dev host as dev even in a production build', () => {
        expect(readStage('app-dev.chatic.io', false)).toEqual({
            isLocalhost: false,
            isDevStage: true,
            isProductionHost: false,
        });
    });

    it('reads the production host as the production host, and neither local nor dev', () => {
        expect(readStage('app.chatic.io', false)).toEqual({
            isLocalhost: false,
            isDevStage: false,
            isProductionHost: true,
        });
    });

    it('reads a dev build as dev on any host, the production host still being the production host', () => {
        expect(readStage('app.chatic.io', true)).toEqual({
            isLocalhost: false,
            isDevStage: true,
            isProductionHost: true,
        });
    });

    it('does not take another name serving the same files for the production host', () => {
        expect(readStage('d1234abcd.cloudfront.net', false).isProductionHost).toBe(false);
        expect(readStage('www.app.chatic.io', false).isProductionHost).toBe(false);
    });
});

describe('readProductionBuild', () => {
    it.each([
        ['PROD', true],
        ['prod', true],
        ['DEV', false],
        ['LOCAL', false],
        ['', false],
        [undefined, false],
    ])('reads VITE_ENV=%s as a production build: %s', (value, production) => {
        expect(readProductionBuild(value)).toBe(production);
    });
});

describe('readSubscriptionAccountEnabled', () => {
    it.each([
        // The local dev server and the dev stage, whatever the build.
        ['localhost', false, true],
        ['localhost', true, true],
        ['127.0.0.1', false, true],
        ['app-dev.chatic.io', false, true],
        ['app-dev.chatic.io', true, true],
        // The production host with a production build.
        ['app.chatic.io', true, true],
        // A dev build on the production host would take production's payments on the dev server.
        ['app.chatic.io', false, false],
        // A production build anywhere else.
        ['dou.chatic.io', true, false],
        ['d1234abcd.cloudfront.net', true, false],
        ['www.app.chatic.io', true, false],
        ['dou.chatic.io', false, false],
    ])('opens the subscription pages on %s with a production build %s: %s', (hostname, productionBuild, open) => {
        expect(readSubscriptionAccountEnabled(hostname, productionBuild)).toBe(open);
    });
});
