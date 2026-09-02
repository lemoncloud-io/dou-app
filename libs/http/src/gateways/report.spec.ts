import { createReportHttpGateway } from './report';

import type { HttpGatewayExecutor } from './types';

const executeSignedRelayRequest = jest.fn();

const exec: HttpGatewayExecutor = {
    executeRelayRequest: jest.fn(),
    executeSignedRelayRequest,
    executeCloudRequest: jest.fn(),
    resolveEndpoint: () => 'https://relay.test',
};

beforeEach(() => {
    jest.clearAllMocks();
    executeSignedRelayRequest.mockResolvedValue({});
});

describe('createReportHttpGateway', () => {
    it('reportIssue — POST {relay}/hello/report, signed, logged like any other call', async () => {
        const gateway = createReportHttpGateway(exec);

        await gateway.reportIssue({ title: 't', message: 'm', save: true, stereo: 'issue' } as never);

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/hello/report',
            body: { title: 't', message: 'm', save: true, stereo: 'issue' },
        });
    });

    it('uploadLogBatch — POST {relay}/hello/report-bulk with the envelope-less { list }', async () => {
        const gateway = createReportHttpGateway(exec);

        await gateway.uploadLogBatch({ list: [{ id: 'a' }, { id: 'b' }] });

        const req = executeSignedRelayRequest.mock.calls.at(-1)?.[0] as {
            method: string;
            baseURL: string;
            body: unknown;
        };
        expect(req.method).toBe('POST');
        expect(req.baseURL).toBe('https://relay.test/hello/report-bulk');
        expect(req.body).toEqual({ list: [{ id: 'a' }, { id: 'b' }] });
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

        await gateway.reportIssue({ title: 't', message: 'm' } as never);

        expect(executeSignedRelayRequest.mock.calls.at(-1)?.[0]).not.toHaveProperty('bypass');
    });
});
