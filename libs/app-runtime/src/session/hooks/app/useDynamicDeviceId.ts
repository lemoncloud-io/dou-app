import { useState } from 'react';

import { liveShellGlobals } from '@chatic/bridges';
import { lazySessionDeviceId } from '@chatic/runtime-client';

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
    const [sessionDeviceId] = useState(lazySessionDeviceId);
    return { ...resolveDeviceIds(sessionDeviceId), isReady: true };
};

/**
 * The resolution `useDynamicDeviceId` describes, outside React — for the connection controller, which
 * reads it on every pass. The page's own id is runtime-client's (`lazySessionDeviceId`), read from the
 * session's store. The shell's injected ids win over the page's own; they are read live
 * (`liveShellGlobals()`, not the host profile's boot snapshot) on each call, as the hook reads them on
 * each render, because the phone's second boot pass can rewrite them. The page's own is asked for only
 * when there is no shell id.
 */
export const resolveDeviceIds = (sessionDeviceId: () => string) => {
    const shell = liveShellGlobals();
    const [compositeBareId, compositeFirebaseId] = (shell.CHATIC_APP_DEVICE_ID ?? '').split(':');
    const deviceId = shell.CHATIC_APP_UNIQUE_DEVICE_ID || compositeBareId || sessionDeviceId();
    const firebaseInstallationId = shell.CHATIC_APP_FIREBASE_INSTALLATION_ID || compositeFirebaseId || undefined;
    return { deviceId, firebaseInstallationId };
};
