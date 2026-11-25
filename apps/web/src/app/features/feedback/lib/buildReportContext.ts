import type { DeviceInfo, VersionInfo } from '@chatic/bridge-messages';
import type { runtime } from '@chatic/runtime-react';

import { getRouteTrail } from '../../../utils/routeTrail';
import { getViewportSize } from '../../../utils/viewport';

interface BuildReportContextArgs {
    deviceInfo: DeviceInfo | null;
    versionInfo: VersionInfo | null;
}

const pickDeviceFields = (deviceInfo: DeviceInfo) => ({
    platform: deviceInfo.platform,
    application: deviceInfo.application,
    stage: deviceInfo.stage,
    deviceModel: deviceInfo.deviceModel,
    lang: deviceInfo.lang,
    uniqueDeviceId: deviceInfo.uniqueDeviceId,
});

export const buildReportContext = ({
    deviceInfo,
    versionInfo,
}: BuildReportContextArgs): runtime.report.IssueReportExtras => {
    const viewport = getViewportSize();
    const routeTrail = getRouteTrail();

    return {
        device: deviceInfo ? pickDeviceFields(deviceInfo) : undefined,
        version: versionInfo ?? undefined,
        online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
        viewport: viewport.width && viewport.height ? viewport : undefined,
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        routeTrail: routeTrail.length ? routeTrail : undefined,
    };
};
