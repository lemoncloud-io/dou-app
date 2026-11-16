import { readProductionBuild, readSubscriptionAccountEnabled } from './stage';
import { readSubscriptionServer } from './subscriptionServer';

const ENV = {
    VITE_OAUTH_ENDPOINT: 'https://api.example.com/dou-d1',
    VITE_SOCIAL_OAUTH_ENDPOINT: 'https://oauth2.example.com',
    VITE_DOU_ENDPOINT: 'https://api.example.com/dou-d1',
    VITE_WS_ENDPOINT: 'wss://wss.example.com/cht-d1',
};

const PROD_ENV = {
    VITE_ENV: 'PROD',
    VITE_OAUTH_ENDPOINT: 'https://api.example.com/dou-v1',
    VITE_SOCIAL_OAUTH_ENDPOINT: 'https://oauth2.example.com',
    VITE_DOU_ENDPOINT: 'https://api.example.com/dou-v1',
    VITE_WS_ENDPOINT: 'wss://wss.example.com/cht-v1',
};

/** The server as the module composes it: the host and the build's own `VITE_ENV` decide the gate. */
const serverOn = (hostname: string, values: Record<string, string | undefined>) =>
    readSubscriptionServer(values, readSubscriptionAccountEnabled(hostname, readProductionBuild(values['VITE_ENV'])));

describe('readSubscriptionServer', () => {
    it('reads the server from the build values where the account surface is open', () => {
        const server = readSubscriptionServer(ENV, true);
        expect(server).toMatchObject({ socialOauth: 'https://oauth2.example.com' });
        expect(server?.env('VITE_DOU_ENDPOINT')).toBe('https://api.example.com/dou-d1');
        expect(server?.env('VITE_WS_ENDPOINT')).toBe('wss://wss.example.com/cht-d1');
    });

    it('has no server where the account surface is shut, or where an address is missing', () => {
        expect(readSubscriptionServer(ENV, false)).toBeUndefined();
        expect(readSubscriptionServer({ ...ENV, VITE_WS_ENDPOINT: '' }, true)).toBeUndefined();
    });

    it('opens on the production host with a production build that carries every address', () => {
        const server = serverOn('app.chatic.io', PROD_ENV);
        expect(server?.env('VITE_DOU_ENDPOINT')).toBe('https://api.example.com/dou-v1');
        expect(server?.env('VITE_ENV')).toBe('PROD');
    });

    it('stays shut on the production host for a dev build, or a production build missing an address', () => {
        expect(serverOn('app.chatic.io', { ...ENV, VITE_ENV: 'DEV' })).toBeUndefined();
        expect(serverOn('app.chatic.io', ENV)).toBeUndefined();
        expect(serverOn('app.chatic.io', { ...PROD_ENV, VITE_OAUTH_ENDPOINT: undefined })).toBeUndefined();
        expect(serverOn('app.chatic.io', { ...PROD_ENV, VITE_WS_ENDPOINT: '' })).toBeUndefined();
    });

    it('stays shut for a production build on any other host', () => {
        expect(serverOn('d1234abcd.cloudfront.net', PROD_ENV)).toBeUndefined();
        expect(serverOn('dou.chatic.io', PROD_ENV)).toBeUndefined();
    });
});
