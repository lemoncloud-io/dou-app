import { archiveEndpointFor, createReportHttpGateway } from './report';

import type { HttpGatewayExecutor } from './types';

const executeSignedRelayRequest = jest.fn();
const resolveEndpoint = jest.fn<string, [string]>();

const exec: HttpGatewayExecutor = {
    executeRelayRequest: jest.fn(),
    executeSignedRelayRequest,
    resolveEndpoint,
};

beforeEach(() => {
    jest.clearAllMocks();
    executeSignedRelayRequest.mockResolvedValue({});
    resolveEndpoint.mockReturnValue('https://relay.test/dou-d1');
});

describe('archiveEndpointFor', () => {
    it('swaps the dev relay stage for the dev archive stage', () => {
        expect(archiveEndpointFor('https://api.eureka.codes/dou-d1')).toBe('https://api.eureka.codes/arc-d1');
    });

    it('swaps the prod relay stage for the prod archive stage', () => {
        expect(archiveEndpointFor('https://api.eureka.codes/dou-v1')).toBe('https://api.eureka.codes/arc-v1');
    });

    it('ignores trailing slashes on the relay', () => {
        expect(archiveEndpointFor('https://api.eureka.codes/dou-d1/')).toBe('https://api.eureka.codes/arc-d1');
        expect(archiveEndpointFor('https://api.eureka.codes/dou-v1//')).toBe('https://api.eureka.codes/arc-v1');
    });

    it('only swaps the trailing path segment, never the host', () => {
        expect(archiveEndpointFor('https://dou-api.example.com/dou-v1')).toBe('https://dou-api.example.com/arc-v1');
    });

    it('falls back to the relay as it is when it has no stage segment', () => {
        expect(archiveEndpointFor('http://localhost:8000')).toBe('http://localhost:8000');
        expect(archiveEndpointFor('http://localhost:8000/')).toBe('http://localhost:8000');
        expect(archiveEndpointFor('')).toBe('');
    });
});

describe('createReportHttpGateway', () => {
    it('reportIssue — POST {archive}/hello/report, relay-signed, logged like any other call', async () => {
        const gateway = createReportHttpGateway(exec);

        await gateway.reportIssue({ title: 't', message: 'm', save: true, stereo: 'issue' });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/arc-d1/hello/report',
            body: { title: 't', message: 'm', save: true, stereo: 'issue' },
        });
    });

    it('uploadLogBatch — POST {archive}/hello/report-bulk with the envelope-less { list }', async () => {
        const gateway = createReportHttpGateway(exec);

        await gateway.uploadLogBatch({ list: [{ id: 'a' }, { id: 'b' }] });

        const req = executeSignedRelayRequest.mock.calls.at(-1)?.[0] as {
            method: string;
            baseURL: string;
            body: unknown;
        };
        expect(req.method).toBe('POST');
        expect(req.baseURL).toBe('https://relay.test/arc-d1/hello/report-bulk');
        expect(req.body).toEqual({ list: [{ id: 'a' }, { id: 'b' }] });
    });

    // A deep link (`?_backend=`) can point the session at another relay after the gateway is built.
    // Its logs have to follow it to that relay's archive stage, so the relay is read per call.
    it('reads the relay on every call, so a deep-linked relay sends to its own archive stage', async () => {
        const gateway = createReportHttpGateway(exec);

        await gateway.uploadLogBatch({ list: [] });
        resolveEndpoint.mockReturnValue('https://relay.test/dou-v1');
        await gateway.uploadLogBatch({ list: [] });
        await gateway.reportIssue({ title: 't' });

        expect(executeSignedRelayRequest.mock.calls.map(([req]) => req.baseURL)).toEqual([
            'https://relay.test/arc-d1/hello/report-bulk',
            'https://relay.test/arc-v1/hello/report-bulk',
            'https://relay.test/arc-v1/hello/report',
        ]);
        expect(resolveEndpoint).toHaveBeenCalledWith('relay');
    });

    it('sends to the relay as it is when the relay has no stage segment', async () => {
        resolveEndpoint.mockReturnValue('http://localhost:8000');
        const gateway = createReportHttpGateway(exec);

        await gateway.uploadLogBatch({ list: [] });
        await gateway.reportIssue({ title: 't' });

        expect(executeSignedRelayRequest.mock.calls.map(([req]) => req.baseURL)).toEqual([
            'http://localhost:8000/hello/report-bulk',
            'http://localhost:8000/hello/report',
        ]);
    });

    // If this ever regresses, an upload failure becomes a log entry that pushes the next flush,
    // which fails again — the feedback loop the batching design exists to avoid.
    it('uploadLogBatch — bypasses networkLog; nothing else in the repo does', async () => {
        const gateway = createReportHttpGateway(exec);

        await gateway.uploadLogBatch({ list: [] });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith(expect.objectContaining({ bypass: ['networkLog'] }));
    });

    it('uploadLogBatch — allowRecordError, so a body reporting dropped entries is not a throw', async () => {
        executeSignedRelayRequest.mockResolvedValue({ total: 2, dropped: 1, list: [], error: 'entry 1 rejected' });
        const gateway = createReportHttpGateway(exec);

        await expect(gateway.uploadLogBatch({ list: [{ id: 'a' }] })).resolves.toBeDefined();
        expect(executeSignedRelayRequest).toHaveBeenCalledWith(expect.objectContaining({ allowRecordError: true }));
    });

    it('reportIssue — does NOT bypass logging (only the batch route may)', async () => {
        const gateway = createReportHttpGateway(exec);

        await gateway.reportIssue({ title: 't', message: 'm' });

        expect(executeSignedRelayRequest.mock.calls.at(-1)?.[0]).not.toHaveProperty('bypass');
    });
});
