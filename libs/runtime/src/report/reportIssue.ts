import { submitIssueReport } from '@chatic/runtime-client';
import type { IssueReportExtras } from '@chatic/runtime-client';

import { handedInPlatform } from '../platform';

export const reportIssue = (title: string, message: string, extras: IssueReportExtras): Promise<void> => {
    const platform = handedInPlatform();
    if (!platform) {
        return Promise.reject(
            new Error(
                '[runtime] report.reportIssue before the platform was handed in — start the runtime with startRuntime from @chatic/runtime-web'
            )
        );
    }
    return submitIssueReport(platform.issueOrigin, title, message, extras);
};
