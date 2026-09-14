import { ReportRepositoryV2 } from './ReportRepositoryV2';
import { DataContextHolder } from './types';

import type { IReportHttpDataSource } from '../remote/http-data-sources';

const context = new DataContextHolder({ cid: 'c1', uid: 'u1' });

describe('ReportRepositoryV2', () => {
    let httpDataSource: jest.Mocked<IReportHttpDataSource>;
    let repository: ReportRepositoryV2;

    beforeEach(() => {
        httpDataSource = { submitIssue: jest.fn(), uploadLogBatch: jest.fn() };
        repository = new ReportRepositoryV2(context, httpDataSource);
    });

    it('submitIssue — hands the composed body to the HTTP source and returns its result', async () => {
        httpDataSource.submitIssue.mockResolvedValue({ id: 'r1' } as never);

        await expect(repository.submitIssue({ title: 't', message: 'm' } as never)).resolves.toEqual({ id: 'r1' });
        expect(httpDataSource.submitIssue).toHaveBeenCalledWith({ title: 't', message: 'm' });
    });

    it('uploadLogBatch — passes the batch through', async () => {
        httpDataSource.uploadLogBatch.mockResolvedValue(undefined);

        await repository.uploadLogBatch({ list: [{ id: 'a' }] });

        expect(httpDataSource.uploadLogBatch).toHaveBeenCalledWith({ list: [{ id: 'a' }] });
    });

    it('re-throws untouched — the uploader classifies by HTTP status', async () => {
        const error = Object.assign(new Error('HTTP 500'), { response: { status: 500 } });
        httpDataSource.uploadLogBatch.mockRejectedValue(error);

        await expect(repository.uploadLogBatch({ list: [] })).rejects.toBe(error);
    });

    it('says so plainly when the HTTP source was never injected', async () => {
        const unwired = new ReportRepositoryV2(context);

        await expect(unwired.submitIssue({} as never)).rejects.toThrow('IReportHttpDataSource is not injected');
        await expect(unwired.uploadLogBatch({ list: [] })).rejects.toThrow('IReportHttpDataSource is not injected');
    });
});
