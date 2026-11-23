import { useEffect, useRef } from 'react';

import i18next from 'i18next';

import type { DomainChannel, DomainJoin } from '@chatic/runtime';
import { runtime } from '@chatic/runtime';

import { usePlaces } from './usePlaces';
import { useChannelChatFeeds, type ChannelChatFeed } from './useChannelChatFeeds';
import {
    buildOpenDeeplink,
    isNamedByRecord,
    isNotifiableChat,
    isOwnChat,
    isSnoozed,
    isWithinQuietHours,
    mentionKind,
    resolveMyMentionNames,
    messagePlainText,
    messagePreview,
    chatSenderName,
    type MentionKind,
} from '../utils';
import {
    channelNotifyMode,
    isNotifyDm,
    useNotificationPrefsStore,
    useReadCursorStore,
    useSelectedChannelStore,
} from '../stores';

const notificationTitle = (channel: DomainChannel, sender: string, kind: MentionKind | null): string => {
    const target = channel.name ? `#${channel.name}` : sender || 'New message';
    if (isNotifyDm(channel)) return target;
    if (kind === 'direct') return i18next.t('notification.mentionTitle', { target });
    if (kind === 'everyone') {
        return i18next.t('notification.everyoneTitle', {
            word: i18next.t('chat.mention.everyoneWord'),
            target,
        });
    }
    return target;
};

const isViewing = (channelId: string): boolean =>
    typeof document !== 'undefined' &&
    document.hasFocus() &&
    document.visibilityState === 'visible' &&
    useSelectedChannelStore.getState().selectedChannelId === channelId;

export const useDesktopNotifications = (): void => {
    const { channel: channelRepository, join: joinRepository } = runtime.data.useRuntimeRepositories();
    const { places } = usePlaces();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const { userId: myUid } = runtime.session.useSessionIdentity();

    const myUidRef = useRef(myUid);
    myUidRef.current = myUid;

    useChannelChatFeeds(({ placeId, channel, chat }: ChannelChatFeed) => {
        const localBanner = runtime.push.localBanner;
        if (!localBanner) return;

        const top = chat.chatNo ?? 0;
        if (!isNotifiableChat(chat)) return;
        const prefs = useNotificationPrefsStore.getState();
        const isDm = isNotifyDm(channel);
        const viewer = { uid: myUidRef.current, name: '', cloudUid: channel.$join?.userId ?? null };
        const viewerIds = [viewer.uid, viewer.cloudUid];
        const now = Date.now();
        if (isSnoozed(prefs.snoozeUntil, now)) return;
        if (prefs.quietHours && isWithinQuietHours(prefs.quietHours, new Date(now))) {
            if (!prefs.mentionBreaksQuietHours || isDm || !isNamedByRecord(chat, viewerIds)) return;
        }
        const notifyMode = channelNotifyMode(prefs, channel.id, channel.$join?.notify, isDm);
        if (!prefs.desktopEnabled || notifyMode === 'none') return;
        if (isViewing(channel.id)) return;
        const cursor = useReadCursorStore.getState().cursors[channel.id] ?? 0;
        if (top <= cursor) return;

        if (isOwnChat(chat, viewer)) return;

        const message = messagePlainText(chat.content);
        const names = resolveMyMentionNames();
        const kind = mentionKind(chat, viewerIds, message, names);
        if (notifyMode === 'mention' && kind === null) return;

        const sender = chatSenderName(chat, placeId);
        const body = messagePreview(chat);
        localBanner.present({
            title: notificationTitle(channel, sender, kind),
            body: channel.name && sender ? `${sender}: ${body}` : body,
            channelId: channel.id,
            deeplink: buildOpenDeeplink({ placeId, channelId: channel.id, rootId: chat.parentId }),
        });
    });

    const placeIds = places.map(p => p.id).join(',');

    useEffect(() => {
        if (!isVerified || places.length === 0) return;
        let active = true;

        const subs = new Map<string, () => void>();
        const byPlace = new Map<string, Set<string>>();

        const cloudUids = new Map<string, string>();

        const mirrorJoinNotify = (channelId: string, list: DomainJoin[]) => {
            const myId = cloudUids.get(channelId) ?? myUidRef.current;
            const mine = myId ? list.find(j => j.userId === myId) : undefined;
            const notify = mine?.notify;
            if (!mine?.channelId || (notify !== 'all' && notify !== 'mention' && notify !== 'none')) return;
            const prefs = useNotificationPrefsStore.getState();
            if (prefs.channelNotify[mine.channelId] !== notify) prefs.setChannelNotify(mine.channelId, notify);
        };

        const ensureJoinSub = (channel: DomainChannel) => {
            if (!channel.id || subs.has(channel.id)) return;
            const channelId = channel.id;
            const unsubJoin = joinRepository.observeList({ channelId }, result =>
                mirrorJoinNotify(channelId, result?.list ?? [])
            );
            subs.set(channelId, unsubJoin);
        };

        const channelObservers = places.map(place =>
            channelRepository.observeList({ sid: place.id }, result => {
                if (!active) return;
                const list = ((result?.list ?? []) as DomainChannel[]).filter(c => c.sid === place.id);
                const nextIds = new Set(list.map(c => c.id).filter((id): id is string => !!id));
                const prevIds = byPlace.get(place.id) ?? new Set<string>();
                for (const id of prevIds) {
                    if (!nextIds.has(id)) {
                        subs.get(id)?.();
                        subs.delete(id);
                    }
                }
                for (const channel of list) {
                    const cloudUid = channel.$join?.userId;
                    if (channel.id && cloudUid) cloudUids.set(channel.id, cloudUid);
                }
                list.forEach(ensureJoinSub);
                byPlace.set(place.id, nextIds);
            })
        );

        return () => {
            active = false;
            channelObservers.forEach(unsub => unsub());
            subs.forEach(fn => fn());
            subs.clear();
            byPlace.clear();
        };
    }, [channelRepository, joinRepository, isVerified, placeIds]);
};
