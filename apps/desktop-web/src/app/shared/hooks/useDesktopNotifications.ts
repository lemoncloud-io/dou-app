import { useEffect, useRef } from 'react';

import i18next from 'i18next';

import type { DomainChannel, DomainJoin } from '@chatic/data';
import { isNative, webClient } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';

import { usePlaces } from './usePlaces';
import { useChannelChatFeeds, type ChannelChatFeed, type ChannelLastChat } from './useChannelChatFeeds';
import {
    buildOpenDeeplink,
    isNamedByRecord,
    isNotifiableChat,
    isOwnChat,
    isWithinQuietHours,
    mentionKind,
    resolveMyMentionNames,
    messagePlainText,
    messagePreview,
    type MentionKind,
} from '../utils';
import {
    channelNotifyMode,
    isNotifyDm,
    useNotificationPrefsStore,
    useReadCursorStore,
    useSelectedChannelStore,
} from '../stores';

// DMs have no channel name — title with the sender instead. Named channels read as
// `#name`, matching the cross-cloud push banner. A group-channel mention reads with
// its kind first (`Mention · #name`, `@all · #name`); DMs and non-mentions keep the
// old title. Translated at notify time via i18next, not a render-captured `t` —
// the feed callback outlives the render that registered it.
const notificationTitle = (
    channel: DomainChannel,
    latest: ChannelLastChat,
    kind: MentionKind | null
): string => {
    const target = channel.name ? `#${channel.name}` : (latest.owner$?.name ?? 'New message');
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

/** Suppress only when you're actively looking at that channel in a focused window. */
const isViewing = (channelId: string): boolean =>
    typeof document !== 'undefined' &&
    document.hasFocus() &&
    document.visibilityState === 'visible' &&
    useSelectedChannelStore.getState().selectedChannelId === channelId;

/**
 * Desktop-only OS notifications. The shared chat-feed engine (useChannelChatFeeds) streams every
 * registered channel's genuinely-new messages here; when a newer message from someone else
 * arrives while the window is hidden, ask the shell to show an OS notification. Covers channels
 * across every place the user belongs to. The banners are a no-op outside the Desktop Shell
 * (isNative() false) and swallow NATIVE_NOT_SUPPORTED so plain-browser / older-shell runs degrade
 * gracefully (ADR-0001).
 *
 * The per-channel notify mode is reverse-synced separately (`join.observeList`): another device
 * changing join.notify lands here as a join cache update — mirrored into the local prefs (which
 * win at notify time) so devices don't drift.
 */
export const useDesktopNotifications = (): void => {
    const { channel: channelRepository, join: joinRepository } = runtime.data.useRuntimeRepositories();
    const { places } = usePlaces();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const { userId: myUid } = runtime.session.useSessionIdentity();

    // Read identity at notify/mirror time via a ref so a changing profile doesn't re-run the
    // join effect (which would drop every live join subscription).
    const myUidRef = useRef(myUid);
    myUidRef.current = myUid;

    // OS-notification policy on each channel's genuinely-new messages. The shared hook already
    // dropped optimistic own sentinels and skipped the cache warm-up baseline, so `chats` are
    // persisted messages strictly above the previous high-water mark.
    useChannelChatFeeds(({ placeId, channel, chat }: ChannelChatFeed) => {
        // No-op outside the Desktop Shell — the renderer must never raise an OS banner in a
        // plain browser (webClient would NATIVE_NOT_SUPPORTED anyway; skip the round-trip).
        if (!isNative()) return;

        // The channel watermark gives us the latest message (chat content streams only for the
        // focused room in v2, so background notifications ride the channel record instead).
        const top = chat.chatNo ?? 0;
        // Join/leave (and, later, reactions) arrive here as ordinary feed rows with no
        // readable body — banner them and the reader gets an empty notification.
        if (!isNotifiableChat(chat)) return;
        // Respect the user's notification preferences (global off / channel mode).
        const prefs = useNotificationPrefsStore.getState();
        // Snooze silences every banner, breakthrough or not. Quiet hours break
        // only for a message whose record names me directly — never for an
        // everyone call, a text guess, or a 1:1. Everything after this point
        // (global switch, channel level, viewing, cursor, own message) still applies.
        const now = Date.now();
        if (prefs.snoozeUntil != null && prefs.snoozeUntil > now) return;
        if (isWithinQuietHours(prefs.quietHours, new Date(now))) {
            const viewerIds = [myUidRef.current, channel.$join?.userId ?? null];
            if (!prefs.mentionBreaksQuietHours || isNotifyDm(channel) || !isNamedByRecord(chat, viewerIds)) {
                return;
            }
        }
        const notifyMode = channelNotifyMode(prefs, channel.id, channel.$join?.notify, isNotifyDm(channel));
        if (!prefs.desktopEnabled || notifyMode === 'none') return;
        // Don't notify for a channel you're actively viewing (you can see it).
        if (isViewing(channel.id)) return;
        // Don't re-notify a message already marked read (e.g. resync redelivery).
        const cursor = useReadCursorStore.getState().cursors[channel.id] ?? 0;
        if (top <= cursor) return;

        // Don't notify my own message. Optimistic copies carry my account id as the owner, but a
        // persisted message outside the relay is owned by my per-channel cloud user id, so "mine"
        // is either id — the same rule the message list and the mentions inbox use.
        const viewer = { uid: myUidRef.current, name: '', cloudUid: channel.$join?.userId ?? null };
        if (isOwnChat(chat, viewer)) return;

        // Mentions-only channels: drop anything that doesn't mention me — by the message's
        // mention record when it has one, else by its text (global profile name + this
        // place's nick, plus @channel/@here).
        // Flattened first: a mention lives in the block text, not in the JSON that
        // carries it, and the raw payload would also match on field names.
        // One evaluation serves both the filter and the title below (`mentionsMe`
        // is this same answer as a boolean).
        const message = messagePlainText(chat.content);
        const names = resolveMyMentionNames();
        const kind = mentionKind(chat, [viewer.uid, viewer.cloudUid], message, names);
        if (notifyMode === 'mention' && kind === null) return;

        // Named channel → prefix the sender so it's visible ("sender: message"); a DM's
        // title already is the sender, so don't repeat it. Matches the cross-cloud banner.
        const sender = chat.owner$?.name;
        const body = messagePreview(chat);
        void webClient
            .request({
                type: 'ShowNotification',
                data: {
                    title: notificationTitle(channel, chat, isNotifyDm(channel) ? null : kind),
                    body: channel.name && sender ? `${sender}: ${body}` : body,
                    channelId: channel.id,
                    // Clicking the notification routes here (place + channel, + thread root).
                    // `parentId` on a persisted record is already the root's chatNo string —
                    // the key the open-thread store and ThreadPanel take (see `threadRootId`).
                    deeplink: buildOpenDeeplink({ placeId, channelId: channel.id, rootId: chat.parentId }),
                },
            })
            // Degrade gracefully on older shells (NATIVE_NOT_SUPPORTED) or transient bridge
            // errors — a dropped OS banner must never break the renderer.
            .catch(() => undefined);
    });

    // Join the place ids into a stable dependency so the effect re-runs only when the set changes.
    const placeIds = places.map(p => p.id).join(',');

    // Reverse-sync the per-channel notify mode: another device changing join.notify lands as a
    // join cache update — mirror it into the local prefs (which win at notify time). Not gated on
    // the shell like the banners above: the level is the app's own state, and the channel list
    // reads it in a plain browser too. Guarded on change: read receipts remap to join updates
    // constantly. The shared chat-feed hook already registers each channel's sync target (which
    // streams these join updates into the cache), so this only needs to observe the join cache.
    useEffect(() => {
        if (!isVerified || places.length === 0) return;
        let active = true;

        // channelId → join observe teardown.
        const subs = new Map<string, () => void>();
        const byPlace = new Map<string, Set<string>>();

        // channelId → my user id in that channel's cloud. Outside the relay my join is under that
        // id, not my account id; the account id is what there is to go by until it is known.
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
