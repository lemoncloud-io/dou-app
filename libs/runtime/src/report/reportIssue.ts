import { hostProfile } from '@chatic/bridges';
import { submitIssueReport } from '@chatic/runtime-client';
import type { IssueReportExtras, IssueReportOrigin } from '@chatic/runtime-client';

/**
 * The page as a report describes it. Whether a shell bridge was found at boot decides the `mobile`
 * app type — the desktop shell included, as it always has. This library is also rendered by apps that
 * declare no host ports (admin), so it reads the host profile rather than `runtime.<port>`.
 */
const pageOrigin: IssueReportOrigin = {
    hasShellBridge: () => hostProfile().bridge !== null,
    pageUrl: () => window.location.href,
};

/**
 * The function through which a user directly reports an issue — runtime-client's `submitIssueReport`
 * for this page. What the report carries and how it is sent is described there.
 */
export const reportIssue = (title: string, message: string, extras: IssueReportExtras): Promise<void> =>
    submitIssueReport(pageOrigin, title, message, extras);
