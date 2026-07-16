import { logBuffer } from '@chatic/bridges';
import type { DeviceInfo, VersionInfo } from '@chatic/app-messages';
import type { IssueReportExtras } from '@chatic/web-core';

import { getViewportSize } from '../hooks';
import { serializeLogs } from './serializeLogs';

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
 * plus a device/version/network/viewport snapshot. Pure and side-effect free
 * (only reads globals), so it is unit-testable without React.
 *
 * `reportIssue` already attaches user/cloud/env/url, so this deliberately does
 * not duplicate those.
 */
export const buildReportContext = ({ deviceInfo, versionInfo }: BuildReportContextArgs): IssueReportExtras => {
    // logBuffer.peek() is oldest-first (FIFO); take the tail for the *most
    // recent* entries — peek(50) would return the 50 OLDEST, not the newest.
    const recent = logBuffer.peek().slice(-RECENT_LOG_COUNT);

    const viewport = getViewportSize();

    return {
        logs: serializeLogs(recent),
        device: deviceInfo ? pickDeviceFields(deviceInfo) : undefined,
        version: versionInfo ?? undefined,
        online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
        viewport: viewport.width && viewport.height ? viewport : undefined,
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
    };
};
