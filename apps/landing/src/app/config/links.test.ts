import { webConfigFor } from './links';

describe('webConfigFor', () => {
    it('hands a local page to the local web app', () => {
        expect(webConfigFor({ isLocalhost: true, isDevStage: true })).toEqual({
            domain: 'localhost:5003',
            protocol: 'http',
        });
    });

    it('hands the dev site to the dev web app', () => {
        expect(webConfigFor({ isLocalhost: false, isDevStage: true })).toEqual({
            domain: 'dou-dev.chatic.io',
            protocol: 'https',
        });
    });

    it('hands the production site to the production web app', () => {
        expect(webConfigFor({ isLocalhost: false, isDevStage: false })).toEqual({
            domain: 'dou.chatic.io',
            protocol: 'https',
        });
    });
});
