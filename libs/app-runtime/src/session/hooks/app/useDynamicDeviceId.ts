import { useState } from 'react';

import { v4 as uuidv4 } from 'uuid';

import { identityStore } from '@chatic/session';

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
    const [sessionDeviceId] = useState(readSessionDeviceId);
    return { ...resolveDeviceIds(sessionDeviceId), isReady: true };
};

/**
 * The page's own id, in the session's plain port. Read-or-made and stored in one step, so a second
 * caller gets the same id rather than making its own.
 */
export const readSessionDeviceId = (): string => identityStore.getOrMakeDeviceId(() => uuidv4());

/**
 * The resolution `useDynamicDeviceId` describes, outside React — for the connection controller, which
 * reads it on every pass. The shell's injected ids win over the page's own; they are read from
 * `window` each call, as the hook reads them on each render.
 */
export const resolveDeviceIds = (sessionDeviceId: string) => {
    const [compositeBareId, compositeFirebaseId] = (window.CHATIC_APP_DEVICE_ID ?? '').split(':');
    const deviceId = window.CHATIC_APP_UNIQUE_DEVICE_ID || compositeBareId || sessionDeviceId;
    const firebaseInstallationId = window.CHATIC_APP_FIREBASE_INSTALLATION_ID || compositeFirebaseId || undefined;
    return { deviceId, firebaseInstallationId };
};
