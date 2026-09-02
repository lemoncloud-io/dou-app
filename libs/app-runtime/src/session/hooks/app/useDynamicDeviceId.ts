import { useSessionDeviceId } from '@chatic/shared';

declare global {
    interface Window {
        /** @deprecated Composite `bareId:firebaseInstallId` from legacy app shells; kept as a parse source for both ids. */
        CHATIC_APP_DEVICE_ID?: string;
        /** Bare unique device id injected by app shells carrying the new device-id fields. */
        CHATIC_APP_UNIQUE_DEVICE_ID?: string;
        /** Firebase installation id injected by app shells carrying the new device-id fields. */
        CHATIC_APP_FIREBASE_INSTALLATION_ID?: string;
    }
}

/**
 * Resolves the device identity from native runtime injection or persisted session state.
 *
 * Socket identity and push registration must share the exact same ids, so this
 * hook is the single resolution point — never derive them elsewhere. Newer app
 * shells inject the ids directly (CHATIC_APP_UNIQUE_DEVICE_ID /
 * CHATIC_APP_FIREBASE_INSTALLATION_ID); legacy shells pack both into the
 * composite CHATIC_APP_DEVICE_ID (`bareId:firebaseInstallId`), so split
 * positions [0]/[1] recover them. Both parts are colon-free by construction
 * (hex/UUID/base64url charsets). CHATIC_APP_INSTALLATION_ID is deliberately NOT
 * a source: its payload flipped between the Firebase installation id (app
 * <= 0.15.x) and the bare device id (>= 0.16.0), so it cannot be trusted.
 */
export const useDynamicDeviceId = () => {
    const { deviceId: sessionDeviceId } = useSessionDeviceId('chatic-device-id');
    const [compositeBareId, compositeFirebaseId] = (window.CHATIC_APP_DEVICE_ID ?? '').split(':');
    const deviceId = window.CHATIC_APP_UNIQUE_DEVICE_ID || compositeBareId || sessionDeviceId;
    const firebaseInstallationId = window.CHATIC_APP_FIREBASE_INSTALLATION_ID || compositeFirebaseId || undefined;

    return { deviceId, firebaseInstallationId, isReady: true };
};
