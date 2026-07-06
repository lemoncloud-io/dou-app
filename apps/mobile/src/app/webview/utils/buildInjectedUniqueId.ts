/** Separator joining the device id and the Firebase installation id in the injected uniqueId. */
export const UNIQUE_ID_SEPARATOR = ':';

/**
 * Builds the `uniqueId` string injected into the WebView (surfaced as `window.CHATIC_APP_DEVICE_ID`).
 *
 * Push testing needs both halves: the device id identifies the physical install, while the
 * Firebase installation id is what the FCM console / back-office targets. Joining them as
 * `deviceId:firebaseInstallId` lets the web report a single identifier that carries both.
 *
 * The Firebase id is fetched asynchronously and can be absent (still resolving, or the lookup
 * failed). Rather than emit a dangling `deviceId:` we join only the non-empty parts, so the web
 * always receives a stable, well-formed identifier and simply gets the bare device id until the
 * Firebase id lands.
 */
export const buildInjectedUniqueId = (deviceId: string, firebaseInstallId?: string | null): string => {
    return [deviceId, firebaseInstallId]
        .map(part => (typeof part === 'string' ? part.trim() : ''))
        .filter(part => part.length > 0)
        .join(UNIQUE_ID_SEPARATOR);
};
