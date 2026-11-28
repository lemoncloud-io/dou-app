import type { OnNotificationPayload } from '@chatic/bridge-messages';

import type { DesktopShellBridge } from './bridge';

export const desktopShellNotificationFeed =
    (bridge: Pick<DesktopShellBridge, 'onEvent'>) =>
    (listener: (payload: OnNotificationPayload) => void): (() => void) =>
        bridge.onEvent('OnReceiveNotification', message => {
            const payload = (message as typeof message | undefined)?.data;
            if (!payload) return;
            listener(payload);
        });
