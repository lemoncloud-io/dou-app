import { cloudGateway, oauthGateway, reportGateway, resetGateways, subscriptionGateway, userGateway } from './gateways';

const createOAuthHttpGateway = jest.fn(() => ({ tag: 'oauth' }));
const createUserHttpGateway = jest.fn(() => ({ tag: 'user' }));
const createCloudHttpGateway = jest.fn(() => ({ tag: 'cloud' }));
const createSubscriptionHttpGateway = jest.fn(() => ({ tag: 'subscription' }));
const createReportHttpGateway = jest.fn(() => ({ tag: 'report' }));
const getHttpManager = jest.fn(() => ({ executor: true }));

jest.mock('@chatic/http', () => ({
    createOAuthHttpGateway: (...a: unknown[]) => createOAuthHttpGateway(...a),
    createUserHttpGateway: (...a: unknown[]) => createUserHttpGateway(...a),
    createCloudHttpGateway: (...a: unknown[]) => createCloudHttpGateway(...a),
    createSubscriptionHttpGateway: (...a: unknown[]) => createSubscriptionHttpGateway(...a),
    createReportHttpGateway: (...a: unknown[]) => createReportHttpGateway(...a),
}));
jest.mock('./factory', () => ({ getHttpManager: () => getHttpManager() }));

beforeEach(() => {
    jest.clearAllMocks();
    resetGateways();
});

describe('공유 게이트웨이 인스턴스', () => {
    it('전부 같은 HttpManager에 묶인다', () => {
        oauthGateway();
        userGateway();
        cloudGateway();
        subscriptionGateway();
        reportGateway();

        const executor = getHttpManager.mock.results[0].value;
        expect(createOAuthHttpGateway).toHaveBeenCalledWith(executor);
        expect(createUserHttpGateway).toHaveBeenCalledWith(executor);
        expect(createCloudHttpGateway).toHaveBeenCalledWith(executor);
        expect(createSubscriptionHttpGateway).toHaveBeenCalledWith(executor);
        expect(createReportHttpGateway).toHaveBeenCalledWith(executor);
    });

    it('한 번 만들고 재사용한다 — 소비자가 몇이든 인스턴스는 하나다', () => {
        expect(cloudGateway()).toBe(cloudGateway());
        expect(createCloudHttpGateway).toHaveBeenCalledTimes(1);
    });

    it('resetGateways()가 전부 버린다 — 테스트 심', () => {
        oauthGateway();
        reportGateway();
        resetGateways();
        oauthGateway();
        reportGateway();

        expect(createOAuthHttpGateway).toHaveBeenCalledTimes(2);
        expect(createReportHttpGateway).toHaveBeenCalledTimes(2);
    });
});
