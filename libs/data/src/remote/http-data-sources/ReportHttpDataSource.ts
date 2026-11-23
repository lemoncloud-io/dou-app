import type { IssueReportWireBody, LogBatchWireBody } from '@chatic/http';
import type { SlackReportResult } from '@lemoncloud/chatic-archive-api';
import type { ReportHttpDomainGateway } from '../gateways';

export interface IReportHttpDataSource {
    submitIssue(body: IssueReportWireBody): Promise<SlackReportResult>;
    uploadLogBatch(body: LogBatchWireBody): Promise<void>;
}

export class ReportHttpDataSource implements IReportHttpDataSource {
    constructor(private readonly gateway: ReportHttpDomainGateway) {}

    submitIssue(body: IssueReportWireBody): Promise<SlackReportResult> {
        return this.gateway.reportIssue(body);
    }

    async uploadLogBatch(body: LogBatchWireBody): Promise<void> {
        await this.gateway.uploadLogBatch(body);
    }
}
