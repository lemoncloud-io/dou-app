import type { SlackReportResult } from '@lemoncloud/chatic-archive-api';
import type { IssueReportWireBody, LogBatchWireBody } from '@chatic/http';
import type { IReportHttpDataSource } from '../remote/http-data-sources';
import type { DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface IReportRepository extends DisposableRepository {
    submitIssue(body: IssueReportWireBody): Promise<SlackReportResult>;
    uploadLogBatch(body: LogBatchWireBody): Promise<void>;
}

export class ReportRepository extends BaseRepository implements IReportRepository {
    constructor(
        contextProvider: DataContextProvider,
        private readonly reportHttpDataSource?: IReportHttpDataSource
    ) {
        super(contextProvider);
    }

    private requireHttp(): IReportHttpDataSource {
        if (!this.reportHttpDataSource) {
            throw new Error('[ReportRepository] IReportHttpDataSource is not injected — httpFactory not wired yet.');
        }
        return this.reportHttpDataSource;
    }

    public async submitIssue(body: IssueReportWireBody): Promise<SlackReportResult> {
        return this.requireHttp().submitIssue(body);
    }

    public async uploadLogBatch(body: LogBatchWireBody): Promise<void> {
        return this.requireHttp().uploadLogBatch(body);
    }
}
