import { useEffect } from 'react';

import { webClient } from '@chatic/bridges';
import { useWebCoreStore } from '@chatic/web-core';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { useSelectedChannelStore } from '../stores';

interface PushNotification {
    title?: string;
    body?: string;
    data?: Record<string, string>;
}

/**
 * In-app toast for cross-cloud pushes that arrive while the window is focused.
 *
 * macOS suppresses OS notification banners from the *active* app, so a message in
 * another cloud that lands while you're using DoU would otherwise be invisible (the
 * live WS only covers the current cloud). The shell forwards every received FCM push
 * as an `OnReceiveNotification` event; we surface it as a toast — but only when
 * focused (the OS banner covers the background case), and never for your own message
 * or the channel you're already viewing.
 *
 * No-op in a plain browser (the shell never emits the event).
 */
export const useCrossCloudPushToast = (): void => {
    useEffect(() => {
        return webClient.onEvent('OnReceiveNotification', message => {
            const notification = (message?.data as { notification?: PushNotification })?.notification;
            const title = notification?.title;
            const body = notification?.body;
            // Click-routing events (pushDeeplink) carry only a deeplink, no content — ignore.
            if (!title && !body) return;
            // Background is already covered by the OS banner; avoid a duplicate.
            if (typeof document !== 'undefined' && !document.hasFocus()) return;

            const data = notification?.data ?? {};
            const myUid = useWebCoreStore.getState().profile?.uid;
            if (myUid && String(data.ownerId) === String(myUid)) return; // my own message
            const activeChannelId = useSelectedChannelStore.getState().selectedChannelId;
            if (data.channelId && String(data.channelId) === String(activeChannelId)) return; // already open

            toast({
                title: data.channelName ? `#${data.channelName}` : title,
                description: title && body ? `${title}: ${body}` : body || title,
            });
        });
    }, []);
};
