/**
 * `createHttpDataSources` is `socketFactory`'s counterpart for HTTP — same non-negotiable:
 * the gateway bundle is never handed back out (ADR-0036), only the data sources built on it. This
 * mirrors `socketFactory.test.ts`'s framing (driven through the data sources, not the gateways).
 *
 * Building and caching the gateways is `http/gateways.ts`'s job now (and the HttpManager itself is
 * `http/factory.ts`'s) — those have their own tests. What is left here is the assembly.
 */
import { createHttpDataSources } from './httpFactory';

const oauthGateway = jest.fn(() => ({ tag: 'oauth-gateway' }));
const userGateway = jest.fn(() => ({ tag: 'user-gateway' }));
const cloudGateway = jest.fn(() => ({ tag: 'cloud-gateway' }));
const subscriptionGateway = jest.fn(() => ({ tag: 'subscription-gateway' }));
const reportGateway = jest.fn(() => ({ tag: 'report-gateway' }));

jest.mock('../../http/gateways', () => ({
    oauthGateway: () => oauthGateway(),
    userGateway: () => userGateway(),
    cloudGateway: () => cloudGateway(),
    subscriptionGateway: () => subscriptionGateway(),
    reportGateway: () => reportGateway(),
}));

// Named after the alias `httpFactory` imports it under, so it does not collide with the
// same-named factory under test.
const createDataHttpDataSources = jest.fn(({ gateways }: { gateways: unknown }) => ({ gateways }));
jest.mock('@chatic/data', () => ({
    createHttpDataSources: (...args: unknown[]) => createDataHttpDataSources(...args),
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
            },
        });
    });

    it('never returns the gateway bundle — only the data sources built on it (ADR-0036)', () => {
        const result = createHttpDataSources();

        expect(Object.keys(result)).toEqual(['httpDataSources']);
        expect(result).not.toHaveProperty('gateways');
    });

    // 예전에는 이 파일이 자기 번들을 새로 만들고 data/hooks·session/auth가 각자 또 캐시해서
    // cloud·user 게이트웨이가 동시에 두세 벌 있었다. 이제 공유 인스턴스 하나다.
    it('공유 인스턴스를 쓴다 — 호출마다 새로 만들지 않는다', () => {
        createHttpDataSources();
        createHttpDataSources();

        const [first, second] = createDataHttpDataSources.mock.calls.map(([arg]) => arg.gateways);
        expect(first).toEqual(second);
    });
});
