import type { SlackReportResult } from '@lemoncloud/chatic-backend-api';
import type { IssueReportWireBody, LogBatchWireBody } from '@chatic/http';
import type { IReportHttpDataSource } from '../remote/http-data-sources';
import type { DataContextProvider } from './types';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

export interface IReportRepositoryV2 extends DisposableRepositoryV2 {
    submitIssue(body: IssueReportWireBody): Promise<SlackReportResult>;
    uploadLogBatch(body: LogBatchWireBody): Promise<void>;
}

/**
 * Diagnostics surface — user-written issue reports and log batches.
 *
 * Remote-only and HTTP-only, same shape as `SubscriptionRepositoryV2`: there is no cacheable entity
 * behind a report, so there is no local data source to compose and no socket lane either.
 *
 * **It composes the call, not the payload.** The report body is assembled in `app-runtime`, which
 * owns the session facts a report describes (uid, role, active cloud) — this repository is the
 * boundary the call crosses, so that the last two data calls in the repo that built their own signed
 * request stop being exceptions to ADR-0036.
 *
 * **Failures are re-thrown untouched, and nothing here logs.** The log uploader classifies a failed
 * batch by HTTP status (4xx discard, everything else retry), so an error that lost its status would
 * silently become "retry forever"; and the batch call is the one request whose own failure must not
 * become a log entry.
 *
 * `IReportHttpDataSource` injection is optional for the same reason as its siblings — every
 * `createRepositoriesV2` call site (tests included) constructs this repository, wired or not — and
 * every method throws a clear "not wired yet" error until it is injected.
 */
export class ReportRepositoryV2 extends BaseRepositoryV2 implements IReportRepositoryV2 {
    constructor(
        contextProvider: DataContextProvider,
        private readonly reportHttpDataSource?: IReportHttpDataSource
    ) {
        super(contextProvider);
    }

    private requireHttp(): IReportHttpDataSource {
        if (!this.reportHttpDataSource) {
            throw new Error('[ReportRepositoryV2] IReportHttpDataSource is not injected — httpFactory not wired yet.');
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
