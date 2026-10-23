import { createHttpManager } from './HttpManager';
import { logger } from '@chatic/bridges';
import { setTelemetryRecorder } from '@chatic/logger';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@chatic/logger', () => {
    // The statistics slot is the real one: it is what the api_request tests drive.
    const actual = jest.requireActual('@chatic/logger');
    return {
        redactSensitive: jest.fn(value => value),
        truncate: jest.fn(value => value),
        recordTelemetry: actual.recordTelemetry,
        setTelemetryRecorder: actual.setTelemetryRecorder,
    };
});
jest.mock('@chatic/config', () => ({
    config: {
        get: jest.fn(
            (key: string) =>
                ({
                    'net.relay.backend': 'https://relay.test',
                    'net.oauth.endpoint': 'https://oauth.test',
                    'net.iap.endpoint': 'https://iap.test',
                })[key]
        ),
    },
}));
const mockedLoggerDebug = logger.debug as jest.Mock;
const mockedLoggerError = logger.error as jest.Mock;

/**
 * The manager no longer takes a cloud credential port — the SigV4 executor it fed went with the
 * cloud HTTP refresh (ADR-0070). Every request now rides the injected lemon surface, so that is what
 * this file drives.
 */
// The builder chains: `setBody`/`setParams` return the builder itself. That self-reference has to be
// annotated — inferring it from the initializer is circular (TS7022/TS7024).
type FakeBuilder = { setBody: jest.Mock<FakeBuilder>; setParams: jest.Mock<FakeBuilder>; execute: jest.Mock };
const execute = jest.fn();
const builder: FakeBuilder = { setBody: jest.fn(() => builder), setParams: jest.fn(() => builder), execute };
const lemonSurface = { buildRequest: jest.fn(() => builder), buildSignedRequest: jest.fn(() => builder) };

beforeEach(() => {
    jest.clearAllMocks();
    execute.mockResolvedValue({ data: { ok: true } });
});

describe('createHttpManager — endpoint 해석', () => {
    // Having no cloud entry is the contract: a request destined for the cloud goes to baseURL and
    // rides the relay signature.
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

describe('createHttpManager — network log sink, failures', () => {
    const fail = (error: unknown) => execute.mockRejectedValueOnce(error);

    it('lifts the HTTP status onto the entry as httpStatus and keeps it in data', async () => {
        fail(Object.assign(new Error('unauthorized'), { response: { status: 401, data: { error: 'expired' } } }));
        const client = createHttpManager(lemonSurface as never);

        await expect(
            client.executeSignedRelayRequest({ method: 'GET', baseURL: 'https://relay.test/x' })
        ).rejects.toThrow();

        const [tag, , options] = mockedLoggerError.mock.calls[0];
        expect(tag).toBe('NET');
        expect(options.httpStatus).toBe(401);
        expect(options.errorCode).toBeUndefined();
        expect(options.data).toMatchObject({ outcome: 'error', status: 401 });
    });

    it('lifts a transport code as errorCode when no response came back', async () => {
        fail(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
        const client = createHttpManager(lemonSurface as never);

        await expect(
            client.executeSignedRelayRequest({ method: 'GET', baseURL: 'https://relay.test/x' })
        ).rejects.toThrow();

        const [, , options] = mockedLoggerError.mock.calls[0];
        expect(options.httpStatus).toBeUndefined();
        expect(options.errorCode).toBe('ERR_NETWORK');
    });
});

describe('createHttpManager — api_request statistics', () => {
    afterEach(() => setTelemetryRecorder(undefined));

    it('records each request as an api_request sample through the process recorder, capped per minute', async () => {
        const record = jest.fn();
        setTelemetryRecorder({ record });
        execute.mockResolvedValue({ data: { ok: true }, status: 200, headers: { 'content-length': '10' } });
        const client = createHttpManager(lemonSurface as never);

        for (let i = 0; i < 12; i += 1) {
            await client.executeSignedRelayRequest({ method: 'GET', baseURL: `https://relay.test/clouds/${i}` });
        }

        expect(record).toHaveBeenCalledTimes(10);
        expect(record).toHaveBeenCalledWith('sample', 'api_request', {
            attrs: { endpoint: '/clouds/:id', method: 'GET', status_class: '2xx', outcome: 'ok', backend: 'relay' },
            metrics: { rtt_ms: expect.any(Number), res_bytes: 10 },
        });
    });

    it('tells a relay request from a cloud backend one, and names neither for the oauth host', async () => {
        const record = jest.fn();
        setTelemetryRecorder({ record });
        execute.mockResolvedValue({ data: { ok: true }, status: 200, headers: {} });
        const client = createHttpManager(lemonSurface as never);

        await client.executeRelayRequest({ method: 'POST', baseURL: 'https://relay.test/oauth/login-invite' });
        await client.executeRelayRequest({ method: 'POST', baseURL: 'https://cloud-7.test/oauth/login-invite' });
        await client.executeRelayRequest({ method: 'POST', baseURL: 'https://oauth.test/oauth/google/token' });

        const backends = record.mock.calls.map(([, , fields]) => fields.attrs.backend);
        expect(backends).toEqual(['relay', 'cloud', undefined]);
        // The host itself is never carried.
        expect(JSON.stringify(record.mock.calls)).not.toContain('cloud-7.test');
    });

    it('does not measure a request that bypasses the network log, as the log batch upload does', async () => {
        const record = jest.fn();
        setTelemetryRecorder({ record });
        const client = createHttpManager(lemonSurface as never);

        await client.executeSignedRelayRequest({
            method: 'POST',
            baseURL: 'https://relay.test/hello/report-bulk',
            bypass: ['networkLog'],
        });

        expect(record).not.toHaveBeenCalled();
    });

    it('keeps the response size out of the log line', async () => {
        execute.mockResolvedValue({ data: { ok: true }, status: 200, headers: { 'content-length': '10' } });
        const client = createHttpManager(lemonSurface as never);

        await client.executeSignedRelayRequest({ method: 'GET', baseURL: 'https://relay.test/x' });

        expect(mockedLoggerDebug.mock.calls[0][2]).not.toHaveProperty('responseBytes');
    });
});
