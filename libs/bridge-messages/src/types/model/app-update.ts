/**
 * Mobile app update check message payloads.
 * The web calls CheckAppUpdate on demand (mount / foreground); native resolves
 * the live store version (iOS only for now) and returns it via
 * OnCheckAppUpdate. OpenStore navigates to the platform store listing.
 */

/** [request] Check for an app update against the live store version (web -> app). */
export type CheckAppUpdatePayload = {
    // Reserved for future filters; empty for now.
};

/** [response] Live update check result (app -> web). */
export type OnCheckAppUpdatePayload = {
    platform: 'ios' | 'android';
    currentVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
    storeUrl: string;
    /** Reserved for a future forced-update flow; unused today. */
    forceUpdate?: boolean;
};

/** [request] Open the platform app store listing (web -> app). */
export type OpenStorePayload = {
    // Reserved for future filters; empty for now.
};

/** [response] Store navigation acknowledgement (app -> web). */
export type OnOpenStorePayload = {
    // Reserved for future fields; empty for now.
};
