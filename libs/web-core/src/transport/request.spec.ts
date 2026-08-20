// The 200-body `error` convention vs a record's own `error` column. Every relay call funnels
// through these helpers, so the opt-out has to be exactly opt-in: default stays "reject", and only
// a caller that declares `allowRecordError` gets the body handed back untouched.
jest.mock('../session/core', () => ({
    cloudCore: { getIdentityToken: () => null, getCredential: () => null },
    DOU_ENDPOINT: 'https://api.test',
    OAUTH_ENDPOINT: 'https://oauth.test',
    getDynamicDOUEndpoint: () => 'https://api.test',
}));
jest.mock('./awsSigning', () => ({ signAwsRequest: jest.fn() }));
// Logging is asserted in networkLog.spec — here it is a passthrough.
jest.mock('./networkLog', () => ({ withNetworkLog: (_meta: unknown, run: () => unknown) => run() }));
jest.mock('./webTransport', () => ({
    WEB_IAP_ENDPOINT: 'https://iap.test',
    webTransport: { buildRequest: jest.fn(), buildSignedRequest: jest.fn() },
}));

import { executeSignedRelayRequest } from './request';
import { webTransport } from './webTransport';

const execute = jest.fn();
const builder = {
    setBody: jest.fn(() => builder),
    setParams: jest.fn(() => builder),
    execute,
};

beforeEach(() => {
    jest.clearAllMocks();
    (webTransport.buildSignedRequest as jest.Mock).mockReturnValue(builder);
});

const releasedCloud = { id: '1000047', status: 'error', error: '.accountNo[#mock:1] is invalid' };

describe('executeSignedRelayRequest — 200 body carrying `error`', () => {
    it('rejects with that message by default', async () => {
        execute.mockResolvedValue({ data: { error: 'NOT_FOUND' } });

        await expect(executeSignedRelayRequest({ method: 'GET', baseURL: 'https://api.test/x' })).rejects.toThrow(
            'NOT_FOUND'
        );
    });

    it('returns the record untouched when the caller passes allowRecordError', async () => {
        execute.mockResolvedValue({ data: releasedCloud });

        await expect(
            executeSignedRelayRequest({
                method: 'POST',
                baseURL: 'https://api.test/clouds/1000047/release',
                body: {},
                allowRecordError: true,
            })
        ).resolves.toEqual(releasedCloud);
    });

    it('still resolves a clean body without the flag', async () => {
        execute.mockResolvedValue({ data: { id: '1000038', error: null } });

        await expect(executeSignedRelayRequest({ method: 'GET', baseURL: 'https://api.test/x' })).resolves.toEqual({
            id: '1000038',
            error: null,
        });
    });
});
