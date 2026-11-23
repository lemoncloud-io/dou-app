import { webClient } from '@chatic/bridges';
import type { OnNotificationPayload } from '@chatic/bridge-messages';

export const onDesktopNotification = (listener: (payload: OnNotificationPayload) => void): (() => void) =>
    webClient.onEvent('OnReceiveNotification', message => {
        const payload = (message as typeof message | undefined)?.data;
        if (!payload) return;
        listener(payload);
    });
