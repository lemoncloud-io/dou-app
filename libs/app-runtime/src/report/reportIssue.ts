import { config } from '@chatic/config';

import { getRepositories } from '../data/runtime';
import { getActiveSessionUser, getGlobalSessionContext } from '../session';
import { sanitizeReportUrl } from './reportUrl';
import { isNative, logger } from '@chatic/bridges';

import type { IssueReportWireBody } from '@chatic/http';
import type { AppType, IssueReportExtras } from './types';

/**
 * `stereo` is the kind of the stored report record, and the server-side filter admin queries on
 * (`MockListParam.type`).
 *
 * Now that automatic error reporting is retired (`reportError` deleted), this endpoint has only one
 * caller left — user-submitted reports — but the value stays: the store still holds `stereo: 'log'`
 * error reports accumulated before the retirement, alongside the log entries the batch uploader keeps
 * shipping, and admin uses this value to separate user reports from those.
 *
 * The wire shape (including the `stereo` union type) belongs to `@chatic/http`'s `ReportHttpGateway` —
 * that's where `IssueReportWireBody` lives; this file only assembles the body.
 */
const REPORT_STEREO_ISSUE = 'issue';

/**
 * The app that sent the report. It's the app in the title `[app] issue: ...`, and the App filter
 * criterion in the admin list.
 *
 * Derived from `env.project` (= `VITE_PROJECT`) rather than a separate setting — admin is already
 * deployed as `CHATIC_ADMIN`, so it's distinguishable without the caller declaring its own identity.
 * `env.project` is already lowercase (`createWebEnvAdapter` lowercases it the same way `web-config`
 * did) — this just carries `WEB_PROJECT.toLowerCase()` forward unchanged.
 */
const resolveAppType = (): AppType => {
    if (isNative()) return 'mobile';
    return (config.get<string>('env.project') ?? '').includes('admin') ? 'admin' : 'web';
};

/**
 * The function through which a user directly reports an issue.
 *
 * `extras` is the context the issue report screen attaches (recent logs, a device/version
 * snapshot, etc.). Every field in it is optional, but the argument is not: both report screens pass
 * one.
 *
 * **When there's an attachment (`extras.images`), it's sent with `silent: true`.** The payload rides
 * as a JSON string inside `body.message`, which becomes the Slack message text verbatim — a single
 * base64 image alone blows well past Slack's text cap (~40k characters). Sending it separately via
 * `SlackReportBody.meta` was tried, but measurement confirmed (2026-08-11) that the backend doesn't
 * persist the client's `meta` — `message` is the only field that gets stored. So only reports with
 * attachments turn off the Slack send and save-only — trading the notification for the photo.
 */
export const reportIssue = async (title: string, message: string, extras: IssueReportExtras): Promise<void> => {
    try {
        const app: AppType = resolveAppType();
        const hasImages = !!extras.images?.length;

        const state = getGlobalSessionContext();
        // Issue reporting is synchronous (not a hook), so it can't observe the profile cache.
        // Read the role/name straight off the active session token payload; the app UI uses the
        // reactive useProfileFacts hook instead.
        const sessionUser = getActiveSessionUser() as { userRole?: string; name?: string } | null;
        const userRole = sessionUser?.userRole;

        const cloudState = state.cloud;
        const cloudToken = cloudState.cloudToken;
        const backend = cloudState.backend;
        const hasCloud = !!cloudToken && !!backend;

        const payload = {
            title,
            message,
            app,
            // `.toLowerCase()` preserves the exact wire value `WEB_ENV` always sent ('local' ·
            // 'dev' · 'prod') — `env.stage` itself is uppercase now, but this
            // payload is stored and may already be filtered on by the admin console, so the
            // OUTGOING contract stays byte-identical rather than following the internal casing.
            env: (config.get<string>('env.stage') ?? '').toLowerCase(),
            // Query values are redacted before being carried here — this is exactly where OAuth
            // callback / verification link tokens can end up, and this payload is both stored and,
            // for an issue report with no attachment, also sent out to Slack. Only the invite `code`
            // is exempted, for tracking purposes. @see ./reportUrl
            url: sanitizeReportUrl(window.location.href),
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
                name: hasCloud ? (cloudToken?.name ?? undefined) : undefined,
                placeId: cloudState.siteId ?? undefined,
            },
            // User-facing screen context (recent logs, device/version snapshot, attachments, ...).
            ...extras,
        };

        const serialized = JSON.stringify(payload, null, 2);

        const body: IssueReportWireBody = {
            title: `[${app}] issue: ${title}`,
            message: serialized,
            // Attachments make the payload far larger than Slack will take as message text, and
            // `message` is the only field the backend persists, so a report carrying photos is
            // saved without notifying. Reports without photos keep their Slack ping.
            silent: hasImages,
            save: true,
            stereo: REPORT_STEREO_ISSUE,
        };

        if (hasImages) {
            // How large an item the report store accepts is still unknown. Log what we actually
            // sent so a failure has a number next to it instead of a guess.
            logger.info('ISSUE_REPORT', '[reportIssue] sending attachments', {
                images: extras.images?.length,
                payloadKb: Math.round(serialized.length / 1024),
                silent: true,
            });
        }

        // repository → data source → gateway, like every other data call. Resolved per
        // call, not captured at module load: this file must stay importable before the data runtime
        // is configured — same rule `session/auth` follows.
        await getRepositories().report.submitIssue(body);
    } catch (reportingError) {
        logger.error('ERROR_REPORT', 'Failed to report issue', { error: reportingError });
        throw reportingError;
    }
};
