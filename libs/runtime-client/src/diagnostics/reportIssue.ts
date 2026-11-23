import { config } from '@chatic/config';

import { runtimeData } from '../data/dataCommands';
import { getActiveSessionUser, getGlobalSessionContext } from '../session/sessionReads';
import { sanitizeReportUrl } from './reportUrl';
import { logger } from '@chatic/logger';

import type { IssueReportWireBody } from '@chatic/http';
import type { AppType, IssueReportExtras, IssueReportOrigin } from './types';

const REPORT_STEREO_ISSUE = 'issue';

const resolveAppType = (origin: IssueReportOrigin): AppType => {
    if (origin.hasShellBridge()) return 'mobile';
    return (config.get<string>('env.project') ?? '').includes('admin') ? 'admin' : 'web';
};

export const submitIssueReport = async (
    origin: IssueReportOrigin,
    title: string,
    message: string,
    extras: IssueReportExtras
): Promise<void> => {
    try {
        const app: AppType = resolveAppType(origin);
        const hasImages = !!extras.images?.length;

        const state = getGlobalSessionContext();
        const sessionUser = getActiveSessionUser() as { userRole?: string; name?: string } | null;
        const userRole = sessionUser?.userRole;

        const cloudState = state.cloud;
        const hasCloud = cloudState.isActive;

        const payload = {
            title,
            message,
            app,
            env: (config.get<string>('env.stage') ?? '').toLowerCase(),
            url: sanitizeReportUrl(origin.pageUrl()),
            timestamp: new Date().toISOString(),
            user: {
                uid: state.identity.userId ?? undefined,
                name: sessionUser?.name,
                role: userRole,
                isAuthenticated: state.identity.isAuthenticated,
            },
            cloud: {
                connected: hasCloud,
                cloudId: hasCloud ? (cloudState.cloudId ?? undefined) : undefined,
                name: hasCloud ? (sessionUser?.name ?? undefined) : undefined,
                placeId: cloudState.siteId ?? undefined,
            },
            ...extras,
        };

        const serialized = JSON.stringify(payload, null, 2);

        const body: IssueReportWireBody = {
            title: `[${app}] issue: ${title}`,
            message: serialized,
            silent: hasImages,
            save: true,
            stereo: REPORT_STEREO_ISSUE,
        };

        if (hasImages) {
            logger.info('ISSUE_REPORT', '[reportIssue] sending attachments', {
                images: extras.images?.length,
                payloadKb: Math.round(serialized.length / 1024),
                silent: true,
            });
        }

        await runtimeData().repositories().report.submitIssue(body);
    } catch (reportingError) {
        logger.error('ERROR_REPORT', 'Failed to report issue', { error: reportingError });
        throw reportingError;
    }
};
