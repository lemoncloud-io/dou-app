import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';
import type { SubWebViewTrust } from '@chatic/shared';

import type { SessionOwner } from '../services/runtime/sessionOwner';

/** Home's id: the relay's own cloud, which the session reports as no cloud selected. */
export const HOME_CLOUD_ID = 'default';

/** What these reads need of a session snapshot. */
export interface SessionPlaceSource {
    context: {
        cloud: { cloudId: string | null };
        relay?: { isAuthenticated: boolean; siteId: string | null };
        activeServer?: { kind: 'relay' | 'cloud'; siteId: string | null };
    };
    committedSiteId?: string | null;
}

/**
 * Whether the session is on Home. The session keeps Home apart from the clouds: no cloud is selected,
 * the relay serves, and Home's place is the relay's selection — a cloud's `committedSiteId` is never
 * set there.
 */
const onHome = (snapshot: SessionPlaceSource): boolean =>
    !snapshot.context.cloud.cloudId &&
    snapshot.context.activeServer?.kind === 'relay' &&
    !!snapshot.context.relay?.isAuthenticated;

/**
 * The cloud a session snapshot is on, or `null` when none is. Home counts as a cloud like any other,
 * as `default`: a page opened there reads Home's places and rooms, bound to it as a page elsewhere is
 * bound to its cloud.
 */
export const cloudOfSession = (snapshot: SessionPlaceSource): string | null =>
    snapshot.context.cloud.cloudId || (onHome(snapshot) ? HOME_CLOUD_ID : null);

/**
 * The place a session snapshot is really on: a cloud's committed place, or on Home the relay's selected
 * place. `null` when there is none — a cloud still switching, or no session.
 */
export const placeOfSession = (snapshot: SessionPlaceSource): string | null => {
    if (snapshot.context.cloud.cloudId) return snapshot.committedSiteId ?? null;
    return onHome(snapshot) ? (snapshot.context.activeServer?.siteId ?? snapshot.context.relay?.siteId ?? null) : null;
};

export interface SubWebViewRuntimeGateInput {
    /** Who holds the session this launch, as the app answered the main web (`settledSessionOwner`). */
    owner: SessionOwner | undefined;
    trust: SubWebViewTrust;
    /** What the page's manifest declares. */
    permissions: ReadonlySet<SubWebViewRuntimePermission>;
    /** The session's cloud when the view opened (`cloudOfSession`). */
    openedCloudId: string | null;
    /** Whether the WebView reports a frame's message under the frame's own origin (`subWebViewReportsFrameOrigin`). */
    reportsFrameOrigin: boolean;
}

const NONE: ReadonlySet<SubWebViewRuntimePermission> = new Set();

/**
 * The runtime permissions a page's host is built with — the manifest's, or none at all. With none, the
 * four runtime requests are not registered: the handshake does not list them and they answer
 * `NOT_FOUND`, as in an app that predates them.
 *
 * - Only where the app's runtime holds the session: nothing else could answer. The main WebView under
 *   the view stops answering on Android, so there is no relaying through it.
 * - Only a `reviewed` page: an `external` site has no manifest to grant anything, and the hub needs
 *   none of this.
 * - Only when a cloud — Home included — was selected as the view opened: the page reads that cloud.
 * - Only where the WebView reports a frame's message under the frame's own origin. An older Android
 *   WebView reports every frame as the top-level page, so a frame of another site inside a reviewed
 *   page would pass the origin check and read the cloud, or send in the user's name. The base set and
 *   the manifest's four capabilities stay: they reach nothing beyond the page's own.
 *
 * Kept apart from the bridge itself, which loads the whole runtime, so a launch the page owns never
 * pays for it.
 */
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
