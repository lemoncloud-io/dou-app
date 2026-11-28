import { join } from 'node:path';

import type { PushHost } from '@chatic/push-desktop';
import { app, powerMonitor, powerSaveBlocker } from 'electron';

export const electronPushHost = (): PushHost => ({
    credentialsPath: join(app.getPath('userData'), 'chatic-fcm.json'),
    onWake: reconnect => {
        powerMonitor.on('resume', reconnect);
        powerMonitor.on('unlock-screen', reconnect);
    },
    onFocus: reconnect => {
        app.on('browser-window-focus', reconnect);
    },
    keepAwake: () => {
        powerSaveBlocker.start('prevent-app-suspension');
    },
});
