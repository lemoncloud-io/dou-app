import { useEffect } from 'react';

import { webClient } from '@chatic/bridges';
import { getGlobalSessionContext } from '@chatic/web-core';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { isDndActive, isMentioned, resolveMyMentionNames, resolvePushCloudId } from '../utils';
import { channelNotifyMode, useNotificationPrefsStore, usePendingOpenStore, useSelectedChannelStore } from '../stores';

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
/** Present one forwarded FCM push as a toast (focused) or an OS banner (unfocused). */
const presentPush = async (
    notification: { title?: string; body?: string; data?: Record<string, string> } | undefined
): Promise<void> => {
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
        if (mode === 'mention' && !isMentioned(String(data.content ?? body ?? ''), resolveMyMentionNames())) return;
    }

    // Resolve the source cloud from the CHANNEL cache — the reliable signal. A push's
    // `data.uid` is the account id (identical across your own clouds), so it can't
    // attribute a cloud; resolvePushCloudId returns the relay cloud id the session/rail
    // use (or trusts uid only when it maps to a single cloud, for invited clouds).
    const sourceCloudId = await resolvePushCloudId({
        channelId: data.channelId,
        sid: data.sid,
        channelName: data.channelName,
        uid: data.uid,
    });
    const activeServer = getGlobalSessionContext().activeServer;
    const activeCloudId = activeServer.kind === 'cloud' ? activeServer.cloudId : null;

    const focused = typeof document !== 'undefined' && document.hasFocus();
    if (!focused) {
        // The OS-notification master switch gates banners only; toasts are in-app.
        if (!prefs.desktopEnabled) return;
        // Same-cloud messages already banner via the live-WS path (useDesktopNotifications);
        // suppress the FCM duplicate ONLY when this push provably belongs to the active
        // cloud. Unresolved source (null) → show: a duplicate beats a missed cross-cloud one.
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

    // Clicking the toast opens the message like the OS-banner click: set the
    // pending-open target (NotificationOpenListener routes home, HomePage switches
    // cloud/place → channel). The resolved source cloud is a no-op when already active.
    const channelId = data.channelId;
    toast({
        title: data.channelName ? `#${data.channelName}` : title,
        description: title && body ? `${title}: ${body}` : body || title,
        className: channelId ? 'cursor-pointer' : undefined,
        onClick: channelId
            ? () =>
                  usePendingOpenStore.getState().request(data.sid ?? '', String(channelId), sourceCloudId ?? undefined)
            : undefined,
    });
};

export const useCrossCloudPushNotifications = (): void => {
    useEffect(() => {
        return webClient.onEvent('OnReceiveNotification', message => {
            void presentPush(message.data?.notification);
        });
    }, []);
};
