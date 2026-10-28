import { readSubscriptionServer } from './subscriptionServer';

const ENV = {
    VITE_OAUTH_ENDPOINT: 'https://api.example.com/dou-d1',
    VITE_SOCIAL_OAUTH_ENDPOINT: 'https://oauth2.example.com',
    VITE_DOU_ENDPOINT: 'https://api.example.com/dou-d1',
    VITE_WS_ENDPOINT: 'wss://wss.example.com/cht-d1',
};

describe('readSubscriptionServer', () => {
    it('reads the server from the build values where the account surface is open', () => {
        const server = readSubscriptionServer({ ...ENV, VITE_SUBSCRIPTION_PAYMENTS_MOCK: '1' }, true);
        expect(server).toMatchObject({
            backend: 'https://api.example.com/dou-d1',
            paymentsMock: true,
            socialOauth: 'https://oauth2.example.com',
        });
        expect(server?.env('VITE_WS_ENDPOINT')).toBe('wss://wss.example.com/cht-d1');
    });

    it('takes real payments unless the samples are asked for', () => {
        expect(readSubscriptionServer(ENV, true)?.paymentsMock).toBe(false);
    });

    it('has no server where the account surface is shut, or where an address is missing', () => {
        expect(readSubscriptionServer(ENV, false)).toBeUndefined();
        expect(readSubscriptionServer({ ...ENV, VITE_WS_ENDPOINT: '' }, true)).toBeUndefined();
    });
});
