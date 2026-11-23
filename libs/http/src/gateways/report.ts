import type { SlackReportBody, SlackReportResult } from '@lemoncloud/chatic-archive-api';
import type { HttpGatewayExecutor } from './types';

export type IssueReportWireBody = SlackReportBody;

export const archiveEndpointFor = (relay: string): string =>
    relay
        .trim()
        .replace(/\/+$/, '')
        .replace(/\/dou-([^/]+)$/, '/arc-$1');

export interface LogBatchWireBody {
    list: unknown[];
}

export interface ReportHttpGateway {
    reportIssue(body: IssueReportWireBody): Promise<SlackReportResult>;
    uploadLogBatch(body: LogBatchWireBody): Promise<unknown>;
}

export interface ReportHttpGatewayOptions {
    archiveEndpoint?: () => string;
}

export const createReportHttpGateway = (
    exec: HttpGatewayExecutor,
    options: ReportHttpGatewayOptions = {}
): ReportHttpGateway => {
    const archive = () =>
        (options.archiveEndpoint?.() ?? '').trim().replace(/\/+$/, '') ||
        archiveEndpointFor(exec.resolveEndpoint('relay'));

    return {
        reportIssue: body =>
            exec.executeSignedRelayRequest<SlackReportResult, IssueReportWireBody>({
                method: 'POST',
                baseURL: `${archive()}/hello/report`,
                body,
            }),

        uploadLogBatch: body =>
            exec.executeSignedRelayRequest<unknown, LogBatchWireBody>({
                method: 'POST',
                baseURL: `${archive()}/hello/report-bulk`,
                body,
                bypass: ['networkLog'],
                allowRecordError: true,
            }),
    };
};
