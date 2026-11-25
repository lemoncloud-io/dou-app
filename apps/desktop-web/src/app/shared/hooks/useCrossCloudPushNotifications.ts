import { useEffect } from 'react';

import { runtime, pushCloudIdOf, RELAY_CLOUD_ID } from '@chatic/runtime';
import { toast } from '@chatic/ui-kit';

import {
    buildOpenDeeplink,
    findPushChannel,
    isDndActive,
    isMentioned,
    isOwnChat,
    messagePlainText,
    pushBody,
    pushLandingPlace,
    readCacheRecords,
    resolveMyMentionNames,
    resolvePushCloudIdFrom,
    type PushChannelData,
} from '../utils';
import {
    channelNotifyMode,
    isNotifyDm,
    useNotificationPrefsStore,
    usePendingOpenStore,
    useSelectedChannelStore,
} from '../stores';

const buildCrossCloudDeeplink = (
    cloudId: string | null,
    data: Record<string, string>,
    placeId: string
): string | undefined => {
    if (cloudId && data.channelId) {
        return buildOpenDeeplink({ cloudId, placeId, channelId: data.channelId });
    }
    return data.link || (data.channelId ? `channel?channelId=${data.channelId}` : undefined);
};

const headline = (channelName: string | undefined, fallback: string): string =>
    channelName ? `#${channelName}` : fallback;

const presentPush = async (
    notification: { title?: string; body?: string; data?: Record<string, string> } | undefined
): Promise<void> => {
    const title = notification?.title;
    if (!title && !notification?.body) return;
    const data = notification?.data ?? {};
    const body = pushBody(data, notification?.body) ?? notification?.body;
    const prefs = useNotificationPrefsStore.getState();
    if (isDndActive(prefs)) return;

    const myUid = runtime.session.getGlobalSessionContext().identity.userId;
    const viewer = { uid: myUid, name: '', cloudUid: data.uid ?? null };
    if (data.ownerId && isOwnChat({ ownerId: String(data.ownerId), stereo: data.stereo }, viewer)) return;
    const records = data.channelId || data.uid ? await readCacheRecords<PushChannelData>() : [];
    const sourceCloudId =
        pushCloudIdOf(data.cid) ||
        resolvePushCloudIdFrom(records, {
            channelId: data.channelId,
            sid: data.sid,
            channelName: data.channelName,
            uid: data.uid,
        });

    let landingPlaceId = data.sid ?? '';
    if (data.channelId) {
        const cachedChannel = findPushChannel(records, {
            channelId: String(data.channelId),
            cloudId: sourceCloudId,
            uid: data.uid,
        });
        landingPlaceId = pushLandingPlace(
            { channelId: String(data.channelId), sid: data.sid },
            cachedChannel,
            sourceCloudId
        );
        const joinNotify = cachedChannel?.$join?.notify as 'all' | 'mention' | 'none' | undefined;
        const mode = channelNotifyMode(prefs, String(data.channelId), joinNotify, isNotifyDm(cachedChannel));
        if (mode === 'none') return;
        if (mode === 'mention' && joinNotify !== 'mention') {
            const text = messagePlainText(String(data.content ?? body ?? ''));
            if (!isMentioned(text, resolveMyMentionNames())) return;
        }
    }

    const activeServer = runtime.session.getGlobalSessionContext().activeServer;
    const activeCloudId = activeServer.kind === 'cloud' ? activeServer.cloudId : null;
    const isFromOpenRelay = activeServer.kind === 'relay' && pushCloudIdOf(data.cid) === RELAY_CLOUD_ID;
    const openPlaceId = sourceCloudId === RELAY_CLOUD_ID ? '' : landingPlaceId;

    const focused = typeof document !== 'undefined' && document.hasFocus();
    if (!focused) {
        if (!prefs.desktopEnabled) return;
        if (sourceCloudId && activeCloudId && String(sourceCloudId) === String(activeCloudId)) return;
        if (isFromOpenRelay) return;
        runtime.push.localBanner?.present({
            title: headline(data.channelName, 'DoU'),
            body: body ?? '',
            channelId: data.channelId,
            deeplink: buildCrossCloudDeeplink(sourceCloudId, data, openPlaceId),
        });
        return;
    }

    const activeChannelId = useSelectedChannelStore.getState().selectedChannelId;
    if (data.channelId && String(data.channelId) === String(activeChannelId)) return;

    const channelId = data.channelId;
    toast({
        variant: 'info',
        title: headline(data.channelName, 'DoU'),
        description: body ?? '',
        className: channelId ? 'cursor-pointer' : undefined,
        onClick: channelId
            ? () =>
                  usePendingOpenStore.getState().request({
                      cloudId: sourceCloudId ?? undefined,
                      placeId: openPlaceId,
                      channelId: String(channelId),
                  })
            : undefined,
    });
};

export const useCrossCloudPushNotifications = (): void => {
    useEffect(() => {
        return runtime.push.notifications?.onReceive(payload => {
            void presentPush(payload.notification);
        });
    }, []);
};
