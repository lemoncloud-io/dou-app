import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DomainChannel, DomainChannelListPayload } from '@chatic/runtime';
import { runtime } from '@chatic/runtime';

import { channelsByPlace, placeUnreadCounts, roomPlaces } from '../utils';
import { useKnownChannelsStore, useMentionsStore, useNotificationPrefsStore, useReadCursorStore } from '../stores';
import { usePlaces } from './usePlaces';
import { chatFrameChannelIdOf } from './useRefreshOnPush';
import { isChannelReadLive } from './liveReadRegistry';

const REFETCH_DEBOUNCE_MS = 300;

const isWindowActive = (): boolean =>
    typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus());

export const usePlaceUnreadCounts = (): { byPlace: Record<string, number>; total: number } => {
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const session = runtime.session.useGlobalSession();
    const cloudId = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : null;
    const { userId: myUid } = runtime.session.useSessionIdentity();
    const readCursors = useReadCursorStore(s => s.cursors);
    const channelNotify = useNotificationPrefsStore(s => s.channelNotify);
    const mutedChannels = useNotificationPrefsStore(s => s.mutedChannels);
    const mentionItems = useMentionsStore(s => s.items);
    const { placeIds, isLoading: placesLoading } = usePlaces();

    const [fetched, setFetched] = useState<{ cloudId: string | null; list: DomainChannel[] }>({
        cloudId: null,
        list: [],
    });
    const channels = fetched.list;
    const seqRef = useRef(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchCounts = useCallback(async () => {
        if (!isVerified) return;
        const seq = ++seqRef.current;
        const result = await channelRepository
            .fetchList({ hasSite: false, limit: 500 } as DomainChannelListPayload)
            .catch(() => null);
        if (seqRef.current !== seq || !result) return;
        setFetched({ cloudId, list: (result.list ?? []) as DomainChannel[] });
    }, [channelRepository, isVerified, cloudId]);

    const schedule = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => void fetchCounts(), REFETCH_DEBOUNCE_MS);
    }, [fetchCounts]);

    useEffect(() => {
        setFetched({ cloudId, list: [] });
        ++seqRef.current;
    }, [cloudId]);

    useEffect(() => {
        if (isVerified) void fetchCounts();
    }, [isVerified, cloudId, fetchCounts]);

    useEffect(() => {
        const offPush = runtime.push.notifications?.onReceive(() => schedule());
        const offMessage = runtime.connection.onServerMessage(message => {
            const type = (message as { type?: string })?.type ?? '';
            if (!type.startsWith('chat')) return;
            const channelId = chatFrameChannelIdOf(message);
            if (channelId && isWindowActive() && isChannelReadLive(channelId)) return;
            schedule();
        });
        return () => {
            offPush?.();
            offMessage();
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [schedule]);

    const filedPlaces = useMemo(() => roomPlaces(channels, { placeIds }), [channels, placeIds]);
    useEffect(() => {
        const listCloudId = fetched.cloudId;
        if (!listCloudId || listCloudId !== cloudId) return;
        const { record } = useKnownChannelsStore.getState();
        channelsByPlace(fetched.list, filedPlaces).forEach((list, placeId) =>
            record(listCloudId, placeId, list, myUid)
        );
    }, [fetched, filedPlaces, cloudId, myUid]);

    return useMemo(
        () =>
            placeUnreadCounts(channels, {
                myUid: myUid ?? null,
                filedPlaces,
                readCursors,
                notifyPrefs: { channelNotify, mutedChannels },
                mentions: mentionItems,
                listsUnplacedDms: !placesLoading && placeIds.length === 0,
            }),
        [channels, myUid, filedPlaces, readCursors, channelNotify, mutedChannels, mentionItems, placesLoading, placeIds]
    );
};
