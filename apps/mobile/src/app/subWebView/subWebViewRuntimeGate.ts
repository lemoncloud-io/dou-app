import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';
import type { SubWebViewTrust } from '@chatic/shared';

import type { SessionOwner } from '../services/runtime/sessionOwner';

/** The Home cloud's id in the session: the relay's, which a page never reads. */
const HOME_CLOUD_ID = 'default';

/** The cloud a session snapshot is on, or `null` for none and for Home. */
export const cloudOfSession = (snapshot: { context: { cloud: { cloudId: string | null } } }): string | null => {
    const cloudId = snapshot.context.cloud.cloudId;
    return cloudId && cloudId !== HOME_CLOUD_ID ? cloudId : null;
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
 * - Only when a cloud other than Home was selected as the view opened: the page reads that cloud.
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
