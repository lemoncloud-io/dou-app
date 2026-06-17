import { useEffect, useRef } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { isNative, webClient } from '@chatic/bridges';
import { useWebCoreStore } from '@chatic/web-core';
import { useWebSocketV2Store } from '@chatic/socket';
import { useRuntimeRepositories } from '@chatic/app-runtime';

import { usePlaces } from './usePlaces';
import { isMentioned, stripMarkdown } from '../utils';
import {
    channelNotifyMode,
    useNotificationPrefsStore,
    useReadCursorStore,
    useSelectedChannelStore,
    useSiteProfilesStore,
} from '../stores';

const CHANNEL_LIMIT = 100;

const chatAuthorId = (chat: DomainChat): string | undefined => chat.owner$?.id ?? chat.ownerId;
const maxChatNo = (list: DomainChat[]): number => list.reduce((max, c) => Math.max(max, c.chatNo ?? 0), 0);
// The subscription list isn't guaranteed chronological, so the newest message is
// the one with the highest chatNo — not the last array element.
const newestChat = (list: DomainChat[]): DomainChat =>
    list.reduce((newest, c) => ((c.chatNo ?? 0) > (newest.chatNo ?? 0) ? c : newest));
// DMs have no channel name — title with the sender instead.
const notificationTitle = (channel: DomainChannel, latest: DomainChat): string =>
    channel.name ?? latest.owner$?.name ?? 'New message';
const channelPlaceId = (channel: DomainChannel): string => channel.placeId ?? channel.sid ?? '';

/** Suppress only when you're actively looking at that channel in a focused window. */
const isViewing = (channelId: string): boolean =>
    typeof document !== 'undefined' &&
    document.hasFocus() &&
    document.visibilityState === 'visible' &&
    useSelectedChannelStore.getState().selectedChannelId === channelId;

/**
 * Desktop-only OS notifications. The live WS streams every channel into the engine cache;
 * when a newer message from someone else arrives while the window is hidden, ask the shell
 * to show an OS notification. Covers channels across every place the user belongs to.
 * No-op outside the Desktop Shell (isNative() false) and swallows NATIVE_NOT_SUPPORTED so
 * plain-browser / older-shell runs degrade gracefully (ADR-0001).
 *
 * Subscriptions are added INCREMENTALLY (one chat stream per channel, deduped) and torn
 * down only when the place/cloud set changes — never per channel event. GlobalChatSync
 * refetches the channel list on every incoming message, so tearing down + re-subscribing
 * on channel events would drop the live stream after the first notification.
 */
export const useDesktopNotifications = (): void => {
    const { channel: channelRepository, chat: chatRepository, join: joinRepository } = useRuntimeRepositories();
    const { places } = usePlaces();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const myId = useWebCoreStore(s => s.profile?.id);
    const myUid = useWebCoreStore(s => s.profile?.uid);

    const seen = useRef<Map<string, number>>(new Map());
    // channelId → chat-stream unsub. Added incrementally; torn down only on real
    // teardown (place/cloud change), so each live stream keeps delivering messages.
    const chatSubs = useRef<Map<string, () => void>>(new Map());
    // Read identity at notify time via refs so a changing profile object doesn't
    // re-run the effect (which would drop every live subscription).
    const myIdRef = useRef(myId);
    myIdRef.current = myId;
    const myUidRef = useRef(myUid);
    myUidRef.current = myUid;

    // Join the place ids into a stable dependency so the effect re-runs only when the set changes.
    const placeIds = places.map(p => p.id).join(',');

    useEffect(() => {
        if (!isNative() || !isVerified || places.length === 0) return;
        let active = true;

        const notifyFromList = (placeId: string, channel: DomainChannel, list: DomainChat[]) => {
            if (list.length === 0) return;

            const top = maxChatNo(list);
            const prev = seen.current.get(channel.id);
            // Monotonic: a partial snapshot (resync, page-limited cache read) must not
            // regress the baseline, or the next full snapshot reads as "new" messages.
            if (prev === undefined || top > prev) seen.current.set(channel.id, top);

            // Skip the first snapshot (cache warm-up) — only notify on a real increase.
            if (prev === undefined || top <= prev) return;
            // Respect the user's notification preferences (global off / channel mode).
            const prefs = useNotificationPrefsStore.getState();
            const notifyMode = channelNotifyMode(prefs, channel.id);
            if (!prefs.desktopEnabled || notifyMode === 'none') return;
            // Don't notify for a channel you're actively viewing (you can see it).
            if (isViewing(channel.id)) return;
            // Don't re-notify a message already marked read (e.g. resync redelivery).
            if (top <= (useReadCursorStore.getState().cursors[channel.id] ?? 0)) return;

            const latest = newestChat(list);
            const authorId = chatAuthorId(latest);
            if (authorId && (authorId === myIdRef.current || authorId === myUidRef.current)) return;

            // Mentions-only channels: drop anything that doesn't @-mention me
            // (global profile name + this place's nick, plus @channel/@here).
            if (notifyMode === 'mention') {
                const placeProfiles = useSiteProfilesStore.getState().profiles;
                const myNames = [
                    useWebCoreStore.getState().profile?.$user?.name,
                    myUidRef.current ? placeProfiles[myUidRef.current]?.nick : undefined,
                    myIdRef.current ? placeProfiles[myIdRef.current]?.nick : undefined,
                ];
                if (!isMentioned(latest.content ?? '', myNames)) return;
            }

            void webClient
                .request('ShowNotification', {
                    title: notificationTitle(channel, latest),
                    body: stripMarkdown(latest.content ?? ''),
                    channelId: channel.id,
                    // Clicking the notification routes here (place + channel).
                    deeplink: `chatic-open:${encodeURIComponent(placeId)}|${encodeURIComponent(channel.id)}`,
                })
                .catch(() => undefined);
        };

        // Subscribe a channel's chat stream once. Deduped, so the per-message channel
        // refetch (GlobalChatSync) re-firing onChannelCreated can't thrash subscriptions.
        const ensureSub = (channel: DomainChannel) => {
            if (!channel.id || chatSubs.current.has(channel.id)) return;
            const placeId = channelPlaceId(channel) || places[0]?.id || '';
            const unsub = chatRepository.subscribeList(channel.id, result =>
                notifyFromList(placeId, channel, result?.list ?? [])
            );
            chatSubs.current.set(channel.id, unsub);
        };

        // Initial channel set across all places.
        void Promise.all(
            places.map(place =>
                channelRepository
                    .fetchChannel({ sid: place.id, limit: CHANNEL_LIMIT }, { cachePolicy: 'cache-first' })
                    .then(result => (result.list ?? []) as DomainChannel[])
                    .catch(() => [] as DomainChannel[])
            )
        ).then(lists => {
            if (active) lists.flat().forEach(ensureSub);
        });

        // Channels that appear later (e.g. after a cloud switch) get a stream added;
        // deleted channels release theirs. No teardown of the rest.
        const offCreated = channelRepository.onChannelCreated(channel => {
            if (active) ensureSub(channel);
        });
        const offDeleted = channelRepository.onChannelDeleted(channel => {
            const unsub = channel.id ? chatSubs.current.get(channel.id) : undefined;
            if (unsub) {
                unsub();
                chatSubs.current.delete(channel.id);
            }
        });

        // Reverse-sync the per-channel notify mode: another device changing
        // join.notify lands here as join:update — mirror it into the local
        // prefs (which win at notify time) so devices don't drift. Guarded on
        // change: read receipts also remap to join:update constantly.
        const offJoinUpdated = joinRepository.onJoinUpdated(join => {
            const notify = join.notify;
            if (!join.channelId || (notify !== 'all' && notify !== 'mention' && notify !== 'none')) return;
            const prefs = useNotificationPrefsStore.getState();
            if (prefs.channelNotify[join.channelId] !== notify) prefs.setChannelNotify(join.channelId, notify);
        });

        return () => {
            active = false;
            offCreated();
            offDeleted();
            offJoinUpdated();
            chatSubs.current.forEach(fn => fn());
            chatSubs.current.clear();
            // Channel ids are per-cloud sequential numbers and collide across clouds,
            // so a baseline kept across a cloud switch can be regressed by the other
            // cloud's same-id channel — resurfacing an already-read message as an OS
            // banner on the way back. Drop baselines with the subs; the first-snapshot
            // guard re-establishes them on the next run.
            seen.current.clear();
        };
    }, [channelRepository, chatRepository, joinRepository, isVerified, placeIds]);
};
