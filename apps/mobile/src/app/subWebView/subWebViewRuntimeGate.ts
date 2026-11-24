import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';
// eslint-disable-next-line @nx/enforce-module-boundaries -- shared is web-only; these link and store-URL helpers move to platform-free packages (mini-app protocol, host links)
import type { SubWebViewTrust } from '@chatic/shared';

import type { SessionOwner } from '../services/runtime/sessionOwner';

export const HOME_CLOUD_ID = 'default';

export interface SessionPlaceSource {
    context: {
        cloud: { cloudId: string | null };
        relay?: { isAuthenticated: boolean; siteId: string | null };
        activeServer?: { kind: 'relay' | 'cloud'; siteId: string | null };
    };
    committedSiteId?: string | null;
}

const onHome = (snapshot: SessionPlaceSource): boolean =>
    !snapshot.context.cloud.cloudId &&
    snapshot.context.activeServer?.kind === 'relay' &&
    !!snapshot.context.relay?.isAuthenticated;

export const cloudOfSession = (snapshot: SessionPlaceSource): string | null =>
    snapshot.context.cloud.cloudId || (onHome(snapshot) ? HOME_CLOUD_ID : null);

export const placeOfSession = (snapshot: SessionPlaceSource): string | null => {
    if (snapshot.context.cloud.cloudId) return snapshot.committedSiteId ?? null;
    return onHome(snapshot) ? (snapshot.context.activeServer?.siteId ?? snapshot.context.relay?.siteId ?? null) : null;
};

export interface SubWebViewRuntimeGateInput {
    owner: SessionOwner | undefined;
    trust: SubWebViewTrust;
    permissions: ReadonlySet<SubWebViewRuntimePermission>;
    openedCloudId: string | null;
    reportsFrameOrigin: boolean;
}

const NONE: ReadonlySet<SubWebViewRuntimePermission> = new Set();

export const grantedSubWebViewRuntime = ({
    owner,
    trust,
    permissions,
    openedCloudId,
    reportsFrameOrigin,
}: SubWebViewRuntimeGateInput): ReadonlySet<SubWebViewRuntimePermission> =>
    owner === 'native' && trust === 'reviewed' && openedCloudId !== null && reportsFrameOrigin && permissions.size > 0
        ? permissions
        : NONE;
