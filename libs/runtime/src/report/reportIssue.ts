import { hostProfile } from '@chatic/bridges';
import { submitIssueReport } from '@chatic/runtime-client';
import type { IssueReportExtras, IssueReportOrigin } from '@chatic/runtime-client';

const pageOrigin: IssueReportOrigin = {
    hasShellBridge: () => hostProfile().bridge !== null,
    pageUrl: () => window.location.href,
};

export const reportIssue = (title: string, message: string, extras: IssueReportExtras): Promise<void> =>
    submitIssueReport(pageOrigin, title, message, extras);
