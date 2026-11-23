import { useState } from 'react';

import { liveShellGlobals } from '@chatic/bridges';
import { lazySessionDeviceId } from '@chatic/runtime-client';

export const useDynamicDeviceId = () => {
    const [sessionDeviceId] = useState(lazySessionDeviceId);
    return { ...resolveDeviceIds(sessionDeviceId), isReady: true };
};

export const resolveDeviceIds = (sessionDeviceId: () => string) => {
    const shell = liveShellGlobals();
    const [compositeBareId, compositeFirebaseId] = (shell.CHATIC_APP_DEVICE_ID ?? '').split(':');
    const deviceId = shell.CHATIC_APP_UNIQUE_DEVICE_ID || compositeBareId || sessionDeviceId();
    const firebaseInstallationId = shell.CHATIC_APP_FIREBASE_INSTALLATION_ID || compositeFirebaseId || undefined;
    return { deviceId, firebaseInstallationId };
};
