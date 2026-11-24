import { createHttpDataSources } from './httpFactory';

const oauthGateway = jest.fn(() => ({ tag: 'oauth-gateway' }));
const userGateway = jest.fn(() => ({ tag: 'user-gateway' }));
const cloudGateway = jest.fn(() => ({ tag: 'cloud-gateway' }));
const subscriptionGateway = jest.fn(() => ({ tag: 'subscription-gateway' }));
const reportGateway = jest.fn(() => ({ tag: 'report-gateway' }));
const pairingGateway = jest.fn(() => ({ tag: 'pairing-gateway' }));

jest.mock('@chatic/transport', () => ({
    ...jest.requireActual('@chatic/transport'),
    oauthGateway: () => oauthGateway(),
    userGateway: () => userGateway(),
    cloudGateway: () => cloudGateway(),
    subscriptionGateway: () => subscriptionGateway(),
    reportGateway: () => reportGateway(),
    pairingGateway: () => pairingGateway(),
}));

const createDataHttpDataSources = jest.fn(({ gateways }: { gateways: unknown }) => ({ gateways }));
jest.mock('@chatic/data', () => ({
    ...jest.requireActual('@chatic/data'),
    createHttpDataSources: (args: { gateways: unknown }) => createDataHttpDataSources(args),
}));

beforeEach(() => jest.clearAllMocks());

describe('createHttpDataSources', () => {
    it('게이트웨이를 도메인 이름에 맞춰 묶는다', () => {
        createHttpDataSources();

        expect(createDataHttpDataSources).toHaveBeenCalledWith({
            gateways: {
                auth: { tag: 'oauth-gateway' },
                user: { tag: 'user-gateway' },
                cloud: { tag: 'cloud-gateway' },
                subscription: { tag: 'subscription-gateway' },
                report: { tag: 'report-gateway' },
                pairing: { tag: 'pairing-gateway' },
            },
        });
    });

    it('never returns the gateway bundle — only the data sources built on it (ADR-0036)', () => {
        const result = createHttpDataSources();

        expect(Object.keys(result)).toEqual(['httpDataSources']);
        expect(result).not.toHaveProperty('gateways');
    });

    it('공유 인스턴스를 쓴다 — 호출마다 새로 만들지 않는다', () => {
        createHttpDataSources();
        createHttpDataSources();

        const [first, second] = createDataHttpDataSources.mock.calls.map(([arg]) => arg.gateways);
        expect(first).toEqual(second);
    });
});
