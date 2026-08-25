import type { DeviceInfo, VersionInfo } from '@chatic/app-messages';
import type { IssueReportExtras } from '@chatic/web-core';

// Direct paths, not the `app/utils` barrel: the barrel pulls in web-vitals / place-profile helpers
// that reach web-core, whose `import.meta` the CommonJS test transform cannot parse
// (architecture/directory-structure.md §6).
import { getRouteTrail } from '../../../utils/routeTrail';
import { getViewportSize } from '../../../utils/viewport';

interface BuildReportContextArgs {
    deviceInfo: DeviceInfo | null;
    versionInfo: VersionInfo | null;
}

/**
 * Diagnostic-only projection of the device snapshot. Deliberately excludes
 * `deviceToken` (an FCM/APNS push *credential*) and the deprecated
 * `deviceId`/`installId`/`firebaseInstallationId` duplicates — a bug report
 * lands in a shared channel, so it must not carry a capability token. Keeps the
 * fields useful for diagnosis plus `uniqueDeviceId` for support correlation.
 */
const pickDeviceFields = (deviceInfo: DeviceInfo) => ({
    platform: deviceInfo.platform,
    application: deviceInfo.application,
    stage: deviceInfo.stage,
    deviceModel: deviceInfo.deviceModel,
    lang: deviceInfo.lang,
    uniqueDeviceId: deviceInfo.uniqueDeviceId,
});

/**
 * Compose the auto-attached context for an issue report: a
 * device/version/network/viewport snapshot. Side-effect free (only reads
 * globals), so it is unit-testable without React.
 *
 * Logs are deliberately NOT attached. They reach the server on their own as
 * individual entries through the batch uploader, keyed by `runId`/`uid`, so a
 * copy pasted into the report body would only duplicate what the collector
 * already has — and duplicate it in the one place that is also relayed to a
 * shared Slack channel.
 *
 * `reportIssue` already attaches user/cloud/env/url, so this deliberately does
 * not duplicate those.
 *
 * `path` is always the feedback screen itself (it is reached from a MyPage menu),
 * so `routeTrail` carries the diagnostic weight: its second-to-last entry is the
 * screen the user was actually on.
 */
export const buildReportContext = ({ deviceInfo, versionInfo }: BuildReportContextArgs): IssueReportExtras => {
    const viewport = getViewportSize();
    const routeTrail = getRouteTrail();

    return {
        device: deviceInfo ? pickDeviceFields(deviceInfo) : undefined,
        version: versionInfo ?? undefined,
        online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
        viewport: viewport.width && viewport.height ? viewport : undefined,
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        // Omit rather than send `[]`, matching the other optional fields above.
        routeTrail: routeTrail.length ? routeTrail : undefined,
    };
};
