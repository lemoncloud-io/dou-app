import type { IssueReportWireBody, LogBatchWireBody } from '@chatic/http';
import type { SlackReportResult } from '@lemoncloud/chatic-backend-api';
import type { ReportHttpDomainGateway } from '../gateways';

export interface IReportHttpDataSource {
    submitIssue(body: IssueReportWireBody): Promise<SlackReportResult>;
    uploadLogBatch(body: LogBatchWireBody): Promise<void>;
}

/**
 * Issue reports and log batches — the diagnostics lane of the HTTP path.
 *
 * **Nothing is mapped and nothing is cached, deliberately.** Every other data source in this folder
 * exists to turn a `View` into a domain entity; a report has no domain entity, no cache slot and no
 * reader in the app (admin reads the stored records through its own list endpoint). What this class
 * contributes is the layer itself: the report calls now come through `gateway → data source →
 * repository` like every other data call instead of building their own signed request
 * (ADR-0036 · ADR-0070 결정 5 원칙 6).
 *
 * **Errors pass through untouched.** The log uploader classifies a failure into
 * retry/discard/ok by HTTP status and must see the original error — wrapping it here would erase
 * the status the classification reads. This class also never logs: the batch call is the one
 * request whose own failure must not become a log entry (see the gateway's `bypass: ['networkLog']`).
 */
export class ReportHttpDataSource implements IReportHttpDataSource {
    constructor(private readonly gateway: ReportHttpDomainGateway) {}

    submitIssue(body: IssueReportWireBody): Promise<SlackReportResult> {
        return this.gateway.reportIssue(body);
    }

    async uploadLogBatch(body: LogBatchWireBody): Promise<void> {
        await this.gateway.uploadLogBatch(body);
    }
}
