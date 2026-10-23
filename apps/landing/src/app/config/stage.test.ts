import { readStage } from './stage';

describe('readStage', () => {
    it('reads the local dev server as local and dev', () => {
        expect(readStage('localhost', true)).toEqual({ isLocalhost: true, isDevStage: true });
        expect(readStage('127.0.0.1', true)).toEqual({ isLocalhost: true, isDevStage: true });
    });

    it('reads the dev host as dev even in a production build', () => {
        expect(readStage('app-dev.chatic.io', false)).toEqual({ isLocalhost: false, isDevStage: true });
    });

    it('reads the production host as neither', () => {
        expect(readStage('app.chatic.io', false)).toEqual({ isLocalhost: false, isDevStage: false });
    });

    it('reads a dev build as dev on any host', () => {
        expect(readStage('app.chatic.io', true)).toEqual({ isLocalhost: false, isDevStage: true });
    });
});
