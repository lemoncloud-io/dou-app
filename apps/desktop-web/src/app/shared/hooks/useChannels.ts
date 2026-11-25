import { useEffect, useMemo, useState } from 'react';

import { ACCOUNT_CHANNEL_SID, isCloudDm, RELAY_CLOUD_ID, type DomainChannel, runtime } from '@chatic/runtime-react';

import { computeChannelUnread, listingPlaces, placeMemberPeers, roomPlaces } from '../utils';
import { useMentionsStore, useReadCursorStore } from '../stores';
import { useChannelReadCursors } from './useChannelReadCursors';
import { usePlaces } from './usePlaces';

const channelLabel = (channel: DomainChannel): string => (channel.name ?? channel.id ?? '').toLowerCase();

const sortByName = (list: DomainChannel[]): DomainChannel[] =>
    [...list].sort((a, b) => channelLabel(a).localeCompare(channelLabel(b)));

type NoPlaceListing = 'nothing' | 'cloudDms' | 'relay';

const EMPTY_SETTLE_MS = 600;
const EMPTY_WEDGE_CEILING_MS = 4000;

export const useChannels = (
    placeId: string | undefined,
    { whenNoPlace = 'nothing' }: { whenNoPlace?: NoPlaceListing } = {}
) => {
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const { userId: myUid } = runtime.session.useSessionIdentity();
    const readCursors = useReadCursorStore(s => s.cursors);
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const { placeIds, isLoading: placesLoading } = usePlaces();
    const [cloudRows, setCloudRows] = useState<DomainChannel[]>([]);
    const [rawLoading, setRawLoading] = useState(true);

    const scopeKey = `${myUid ?? ''}:${placeId ?? ''}`;
    const [prevScopeKey, setPrevScopeKey] = useState(scopeKey);
    if (scopeKey !== prevScopeKey) {
        setPrevScopeKey(scopeKey);
        setCloudRows([]);
        setRawLoading(true);
    }

    useEffect(() => {
        if (!placeId && whenNoPlace === 'nothing') {
            setCloudRows([]);
            setRawLoading(false);
            return;
        }
        setRawLoading(true);
        let cancelled = false;
        const unsubscribe = channelRepository.observeList({ sid: '' }, result => {
            if (cancelled) return;
            setCloudRows(result?.list ?? []);
            setRawLoading(false);
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [channelRepository, placeId, myUid, whenNoPlace]);

    const filedPlaces = useMemo(() => roomPlaces(cloudRows, { placeIds }), [cloudRows, placeIds]);
    const memberPeers = useMemo(
        () => (placeId ? placeMemberPeers(cloudRows, { myUid: myUid ?? null, placeId }) : []),
        [cloudRows, myUid, placeId]
    );
    const rawChannels = useMemo(() => {
        const cloudPlaces = new Set(placeIds);
        const listed = cloudRows.filter(c => {
            if (placeId) return c.sid === ACCOUNT_CHANNEL_SID || listingPlaces(c, filedPlaces).includes(placeId);
            if (whenNoPlace === 'relay') return (c.cid || RELAY_CLOUD_ID) === RELAY_CLOUD_ID;
            return isCloudDm(c) && !cloudPlaces.has(c.sid);
        });
        return sortByName(listed);
    }, [cloudRows, filedPlaces, placeId, placeIds, whenNoPlace]);

    const serverCursors = useChannelReadCursors(rawChannels);
    const channels = useMemo(
        () =>
            rawChannels.map(c => ({
                ...c,
                unreadCount: computeChannelUnread(c, myUid ?? null, readCursors[c.id ?? ''], serverCursors[c.id ?? '']),
            })),
        [rawChannels, myUid, readCursors, serverCursors]
    );

    useEffect(() => {
        const { markChannelRead } = useMentionsStore.getState();
        for (const c of rawChannels) {
            const id = c.id;
            if (!id) continue;
            const boundary = Math.max(readCursors[id] ?? 0, serverCursors[id]?.chatNo ?? 0);
            if (boundary > 0) markChannelRead({ cloudId: c.cid || RELAY_CLOUD_ID, id, placeId: c.sid }, boundary);
        }
    }, [rawChannels, readCursors, serverCursors]);

    const [confidentEmpty, setConfidentEmpty] = useState(false);
    useEffect(() => {
        if (rawLoading || rawChannels.length > 0) {
            setConfidentEmpty(false);
            return;
        }
        const settle = isVerified ? EMPTY_SETTLE_MS : EMPTY_WEDGE_CEILING_MS;
        const timer = setTimeout(() => setConfidentEmpty(true), settle);
        return () => clearTimeout(timer);
    }, [rawLoading, isVerified, rawChannels.length]);

    const isLoading = rawLoading || (!!placeId && placesLoading) || (rawChannels.length === 0 && !confidentEmpty);

    return { channels, isLoading, filedPlaces, memberPeers };
};
