import {
    cloudGateway,
    configuredArchiveEndpoint,
    oauthGateway,
    pairingGateway,
    reportGateway,
    resetGateways,
    subscriptionGateway,
    userGateway,
} from './gateways';

const createOAuthHttpGateway = jest.fn((..._args: unknown[]) => ({ tag: 'oauth' }));
const createUserHttpGateway = jest.fn((..._args: unknown[]) => ({ tag: 'user' }));
const createCloudHttpGateway = jest.fn((..._args: unknown[]) => ({ tag: 'cloud' }));
const createSubscriptionHttpGateway = jest.fn((..._args: unknown[]) => ({ tag: 'subscription' }));
const createReportHttpGateway = jest.fn((..._args: unknown[]) => ({ tag: 'report' }));
const createPairingHttpGateway = jest.fn((..._args: unknown[]) => ({ tag: 'pairing' }));
const getHttpManager = jest.fn(() => ({ executor: true }));

jest.mock('@chatic/http', () => ({
    createOAuthHttpGateway: (...a: unknown[]) => createOAuthHttpGateway(...a),
    createUserHttpGateway: (...a: unknown[]) => createUserHttpGateway(...a),
    createCloudHttpGateway: (...a: unknown[]) => createCloudHttpGateway(...a),
    createSubscriptionHttpGateway: (...a: unknown[]) => createSubscriptionHttpGateway(...a),
    createReportHttpGateway: (...a: unknown[]) => createReportHttpGateway(...a),
    createPairingHttpGateway: (...a: unknown[]) => createPairingHttpGateway(...a),
}));
jest.mock('./factory', () => ({ getHttpManager: () => getHttpManager() }));

const configValues: Record<string, unknown> = {};
let relayOverridden = false;
jest.mock('@chatic/config', () => ({
    config: {
        get: (key: string) => configValues[key],
        snapshot: (key: string) => ({ key, value: configValues[key], isOverridden: relayOverridden }),
    },
}));

beforeEach(() => {
    jest.clearAllMocks();
    resetGateways();
    for (const key of Object.keys(configValues)) delete configValues[key];
    relayOverridden = false;
});

describe('공유 게이트웨이 인스턴스', () => {
    it('전부 같은 HttpManager에 묶인다', () => {
        oauthGateway();
        userGateway();
        cloudGateway();
        subscriptionGateway();
        reportGateway();
        pairingGateway();

        const executor = getHttpManager.mock.results[0].value;
        expect(createOAuthHttpGateway).toHaveBeenCalledWith(executor);
        expect(createUserHttpGateway).toHaveBeenCalledWith(executor);
        expect(createCloudHttpGateway).toHaveBeenCalledWith(executor);
        expect(createSubscriptionHttpGateway).toHaveBeenCalledWith(executor);
        expect(createReportHttpGateway).toHaveBeenCalledWith(executor, { archiveEndpoint: configuredArchiveEndpoint });
        expect(createPairingHttpGateway).toHaveBeenCalledWith(executor);
    });

    it('한 번 만들고 재사용한다 — 소비자가 몇이든 인스턴스는 하나다', () => {
        expect(cloudGateway()).toBe(cloudGateway());
        expect(createCloudHttpGateway).toHaveBeenCalledTimes(1);
    });

    it('resetGateways()가 전부 버린다 — 테스트 심', () => {
        oauthGateway();
        reportGateway();
        pairingGateway();
        resetGateways();
        oauthGateway();
        reportGateway();
        pairingGateway();

        expect(createOAuthHttpGateway).toHaveBeenCalledTimes(2);
        expect(createReportHttpGateway).toHaveBeenCalledTimes(2);
        expect(createPairingHttpGateway).toHaveBeenCalledTimes(2);
    });
});

describe('configuredArchiveEndpoint', () => {
    it('returns VITE_ARCHIVE_ENDPOINT through net.archive.endpoint', () => {
        configValues['net.archive.endpoint'] = 'https://api.example.com/arc-d1';

        expect(configuredArchiveEndpoint()).toBe('https://api.example.com/arc-d1');
    });

    it('returns empty when nothing is configured, so the gateway builds it from the relay', () => {
        expect(configuredArchiveEndpoint()).toBe('');
    });

    // A configured archive belongs to the build's relay; a deep-linked relay must keep its own stage.
    it('returns empty while a deep link has replaced the relay', () => {
        configValues['net.archive.endpoint'] = 'https://api.example.com/arc-v1';
        relayOverridden = true;

        expect(configuredArchiveEndpoint()).toBe('');
    });
});
