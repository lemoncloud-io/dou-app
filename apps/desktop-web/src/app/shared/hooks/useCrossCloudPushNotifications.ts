import { useEffect } from 'react';

import { webClient } from '@chatic/bridges';
import { getGlobalSessionContext } from '@chatic/web-core';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { isDndActive } from '../utils';
import { useNotificationPrefsStore, useSelectedChannelStore } from '../stores';

interface PushNotification {
    title?: string;
    body?: string;
    data?: Record<string, string>;
}

/**
 * Cross-cloud push presenter — in-app toast when focused, OS banner when not.
 *
 * The shell raises no banner for FCM pushes itself; it forwards every push as
 * `OnReceiveNotification` and this hook owns the whole decision (DND, global
 * switch, own-message, focus), exactly as useDesktopNotifications owns it for
 * same-cloud live-WS messages. Keeping the policy here means DND lives in one
 * place and ships with the web (no shell reinstall), and focus is judged from
 * a single source (document.hasFocus()) instead of main and renderer each
 * guessing at it.
 *
 * Focused → toast (macOS drops focused-app OS banners, so a banner would be
 * invisible there anyway). Unfocused → OS banner through the same
 * ShowNotification bridge the same-cloud path uses.
 *
 * No-op in a plain browser (the shell never emits the event).
 */
export const useCrossCloudPushNotifications = (): void => {
    useEffect(() => {
        return webClient.onEvent('OnReceiveNotification', message => {
            const notification = (message?.data as { notification?: PushNotification })?.notification;
            const title = notification?.title;
            const body = notification?.body;
            // Silent/data-only pushes and click-routing events (pushDeeplink) carry no
            // content — badges consume them elsewhere; never surface a banner or toast.
            if (!title && !body) return;
            // Global do-not-disturb (snooze / quiet hours) silences banner and toast alike.
            const prefs = useNotificationPrefsStore.getState();
            if (isDndActive(prefs)) return;

            const data = notification?.data ?? {};
            const myUid = getGlobalSessionContext().identity.userId;
            if (myUid && String(data.ownerId) === String(myUid)) return; // my own message

            const focused = typeof document !== 'undefined' && document.hasFocus();
            if (!focused) {
                // The OS-notification master switch gates banners only; toasts are in-app.
                if (!prefs.desktopEnabled) return;
                void webClient
                    .request({
                        type: 'ShowNotification',
                        data: {
                            title: title ?? 'DoU',
                            body: body ?? '',
                            channelId: data.channelId,
                            // Server FCM links arrive as `channel?channelId=` — the click
                            // listener parses that alongside chatic-open: (parsePushDeeplink).
                            deeplink: data.link || (data.channelId ? `channel?channelId=${data.channelId}` : undefined),
                        },
                    })
                    // Degrade gracefully on older shells / transient bridge errors — a
                    // dropped OS banner must never break the renderer.
                    .catch(() => undefined);
                return;
            }

            const activeChannelId = useSelectedChannelStore.getState().selectedChannelId;
            if (data.channelId && String(data.channelId) === String(activeChannelId)) return; // already open

            toast({
                title: data.channelName ? `#${data.channelName}` : title,
                description: title && body ? `${title}: ${body}` : body || title,
            });
        });
    }, []);
};
