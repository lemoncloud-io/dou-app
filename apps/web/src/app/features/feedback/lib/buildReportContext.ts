import { collectBreadcrumbs, logBuffer, serializeLogs } from '@chatic/bridges';
import type { DeviceInfo, VersionInfo } from '@chatic/app-messages';
import type { IssueReportExtras } from '@chatic/web-core';

// Direct paths, not the `app/utils` barrel: the barrel pulls in web-vitals / place-profile helpers
// that reach web-core, whose `import.meta` the CommonJS test transform cannot parse
// (architecture/directory-structure.md §6).
import { getRouteTrail } from '../../../utils/routeTrail';
import { getViewportSize } from '../../../utils/viewport';

/** How many of the most recent log entries to attach. */
export const RECENT_LOG_COUNT = 50;

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
 * Compose the auto-attached context for an issue report: the most recent logs
 * plus a device/version/network/viewport snapshot. Side-effect free (only
 * reads globals + the active LogSource), so it is unit-testable without React.
 *
 * `reportIssue` already attaches user/cloud/env/url, so this deliberately does
 * not duplicate those.
 *
 * `path` is always the feedback screen itself (it is reached from a MyPage menu),
 * so `routeTrail` carries the diagnostic weight: its second-to-last entry is the
 * screen the user was actually on.
 */
export const buildReportContext = async ({
    deviceInfo,
    versionInfo,
}: BuildReportContextArgs): Promise<IssueReportExtras> => {
    // Breadcrumbs come from the active LogSource (ADR-0047): the native merged
    // buffer in hybrid runs, the local web buffer standalone. The click IS the
    // reference time, so no errorAt filter; the local tail is the fallback.
    const recent = await collectBreadcrumbs(RECENT_LOG_COUNT, logBuffer.peek());

    const viewport = getViewportSize();
    const routeTrail = getRouteTrail();

    return {
        logs: serializeLogs(recent),
        device: deviceInfo ? pickDeviceFields(deviceInfo) : undefined,
        version: versionInfo ?? undefined,
        online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
        viewport: viewport.width && viewport.height ? viewport : undefined,
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        // Omit rather than send `[]`, matching the other optional fields above.
        routeTrail: routeTrail.length ? routeTrail : undefined,
    };
};
