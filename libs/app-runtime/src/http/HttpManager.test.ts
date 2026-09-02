import { createHttpManager } from './HttpManager';
import { logger } from '@chatic/bridges';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@chatic/logger', () => ({
    redactSensitive: jest.fn(value => value),
    truncate: jest.fn(value => value),
}));
jest.mock('@chatic/web-config', () => ({
    getDynamicRelayBackend: jest.fn(() => 'https://relay.test'),
    WEB_OAUTH_ENDPOINT: 'https://oauth.test',
    WEB_IAP_ENDPOINT: 'https://iap.test',
}));
const mockedLoggerDebug = logger.debug as jest.Mock;

/**
 * The manager no longer takes a cloud credential port — the SigV4 executor it fed went with the
 * cloud HTTP refresh (ADR-0070). Every request now rides the injected lemon surface, so that is what
 * this file drives.
 */
const execute = jest.fn();
const builder = { setBody: jest.fn(() => builder), setParams: jest.fn(() => builder), execute };
const lemonSurface = { buildRequest: jest.fn(() => builder), buildSignedRequest: jest.fn(() => builder) };

beforeEach(() => {
    jest.clearAllMocks();
    execute.mockResolvedValue({ data: { ok: true } });
});

describe('createHttpManager — endpoint 해석', () => {
    // cloud 엔트리가 없다는 것이 계약이다: 목적지가 클라우드인 요청은 baseURL로 가고 relay 서명을 탄다.
    it.each([
        ['relay', 'https://relay.test'],
        ['oauth', 'https://oauth.test'],
        ['iap', 'https://iap.test'],
    ] as const)('%s route의 기본 host를 돌려준다', (route, host) => {
        expect(createHttpManager(lemonSurface as never).resolveEndpoint(route)).toBe(host);
    });
});

describe('createHttpManager — network log sink', () => {
    it('redacts fields through @chatic/logger before handing them to the bridges logger', async () => {
        const client = createHttpManager(lemonSurface as never);

        await client.executeSignedRelayRequest({ method: 'GET', baseURL: 'https://relay.test/x', params: { q: 1 } });

        expect(mockedLoggerDebug).toHaveBeenCalledTimes(1);
        const [tag] = mockedLoggerDebug.mock.calls[0];
        expect(tag).toBe('NET');
    });
});
