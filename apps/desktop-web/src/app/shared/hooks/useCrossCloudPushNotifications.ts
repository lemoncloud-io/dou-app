import { useEffect } from 'react';

import { webClient } from '@chatic/bridges';
import { getGlobalSessionContext } from '@chatic/web-core';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { isDndActive, isMentioned, resolveMyMentionNames } from '../utils';
import { channelNotifyMode, useMyCloudUidStore, useNotificationPrefsStore, useSelectedChannelStore } from '../stores';

/**
 * Resolve which relay cloud a push came from: `data.uid` is MY uid in the source
 * cloud, reverse-mapped through the persisted per-cloud uid map (the same chain
 * useCrossCloudPushBadge uses); `data.cid` when a backend stamps it. Null when
 * unresolvable.
 */
const resolveSourceCloudId = (data: Record<string, string>): string | null => {
    if (data.uid) {
        const entry = Object.entries(useMyCloudUidStore.getState().byPlace).find(([, uid]) => uid === data.uid);
        if (entry) return entry[0].split(':')[0];
    }
    return data.cid || null;
};

/**
 * Deeplink for the OS banner click. When the source cloud resolves, encode
 * `chatic-open:<cloudId>|<sid>|<channelId>` so the click switches cloud → place →
 * channel (parsePushDeeplink + HomePage). Otherwise fall back to the server's own
 * `channel?channelId=` link — best-effort, opens in the current cloud only.
 */
const buildCrossCloudDeeplink = (cloudId: string | null, data: Record<string, string>): string | undefined => {
    if (cloudId && data.channelId) {
        const enc = encodeURIComponent;
        return `chatic-open:${enc(cloudId)}|${enc(data.sid ?? '')}|${enc(data.channelId)}`;
    }
    return data.link || (data.channelId ? `channel?channelId=${data.channelId}` : undefined);
};

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
            const notification = message.data?.notification;
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
            // Per-channel notify mode — same policy the same-cloud path honors: muted
            // channels stay silent, mention-only channels drop non-@me messages. Uses the
            // raw `data.content` (the localized `body` isn't the original text).
            if (data.channelId) {
                const mode = channelNotifyMode(prefs, String(data.channelId));
                if (mode === 'none') return;
                if (mode === 'mention' && !isMentioned(String(data.content ?? body ?? ''), resolveMyMentionNames()))
                    {return;}
            }

            const focused = typeof document !== 'undefined' && document.hasFocus();
            if (!focused) {
                // The OS-notification master switch gates banners only; toasts are in-app.
                if (!prefs.desktopEnabled) return;
                // The backend fans FCM out for the ACTIVE cloud too, but the live-WS path
                // (useDesktopNotifications) already banners those — showing this one as
                // well double-banners every same-cloud message. Unresolvable source →
                // banner anyway: a duplicate beats silence for a cross-cloud message.
                const sourceCloudId = resolveSourceCloudId(data);
                const activeServer = getGlobalSessionContext().activeServer;
                const activeCloudId = activeServer.kind === 'cloud' ? activeServer.cloudId : null;
                if (sourceCloudId && activeCloudId && String(sourceCloudId) === String(activeCloudId)) return;
                void webClient
                    .request({
                        type: 'ShowNotification',
                        data: {
                            title: title ?? 'DoU',
                            body: body ?? '',
                            channelId: data.channelId,
                            deeplink: buildCrossCloudDeeplink(sourceCloudId, data),
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
