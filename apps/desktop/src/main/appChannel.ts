import { join } from 'node:path';

import { app } from 'electron';
import type { FcmConfig } from '@chatic/push-desktop';

export const IS_DEV_CHANNEL = !app.isPackaged || import.meta.env.MAIN_VITE_CHANNEL === 'dev';

export const PROTOCOL_SCHEME = IS_DEV_CHANNEL ? 'chatic-dev' : 'chatic';

export const DESKTOP_WEB_URL = import.meta.env.MAIN_VITE_DESKTOP_WEB_URL ?? 'http://localhost:5005';

export const applyDevChannelIdentity = (): void => {
    if (IS_DEV_CHANNEL) {
        app.setName('DoU Dev');
        app.setPath('userData', join(app.getPath('appData'), 'chatic-desktop-dev'));
    }
};

export const readFcmConfig = (): FcmConfig => ({
    apiKey: import.meta.env.MAIN_VITE_FCM_API_KEY ?? '',
    projectId: import.meta.env.MAIN_VITE_FCM_PROJECT_ID ?? '',
    senderId: import.meta.env.MAIN_VITE_FCM_SENDER_ID ?? '',
    appId: import.meta.env.MAIN_VITE_FCM_APP_ID ?? '',
    packageName: import.meta.env.MAIN_VITE_FCM_PACKAGE ?? '',
});
