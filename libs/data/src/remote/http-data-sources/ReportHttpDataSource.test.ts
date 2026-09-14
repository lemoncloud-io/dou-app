import { ReportHttpDataSource } from './ReportHttpDataSource';
import type { ReportHttpDomainGateway } from '../gateways';

describe('ReportHttpDataSource', () => {
    let gateway: jest.Mocked<ReportHttpDomainGateway>;
    let dataSource: ReportHttpDataSource;

    beforeEach(() => {
        gateway = {
            reportIssue: jest.fn(),
            uploadLogBatch: jest.fn(),
        };
        dataSource = new ReportHttpDataSource(gateway);
    });

    it('submitIssue — forwards the wire body and the raw result, unmapped', async () => {
        gateway.reportIssue.mockResolvedValue({ id: 'r1' } as never);

        await expect(dataSource.submitIssue({ title: 't', message: 'm' } as never)).resolves.toEqual({ id: 'r1' });
        expect(gateway.reportIssue).toHaveBeenCalledWith({ title: 't', message: 'm' });
    });

    it('uploadLogBatch — forwards the batch and swallows the accept body (the queue only needs "it landed")', async () => {
        gateway.uploadLogBatch.mockResolvedValue({ total: 2, dropped: 1 });

        await expect(dataSource.uploadLogBatch({ list: [{ id: 'a' }, { id: 'b' }] })).resolves.toBeUndefined();
        expect(gateway.uploadLogBatch).toHaveBeenCalledWith({ list: [{ id: 'a' }, { id: 'b' }] });
    });

    // The uploader classifies a failed batch by HTTP status; an error re-wrapped here would lose it
    // and every failure would read as "retry forever".
    it('re-throws the gateway error untouched — the status the uploader classifies must survive', async () => {
        const error = Object.assign(new Error('HTTP 400'), { response: { status: 400 } });
        gateway.uploadLogBatch.mockRejectedValue(error);

        await expect(dataSource.uploadLogBatch({ list: [] })).rejects.toBe(error);
    });
});
