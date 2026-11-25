import { useEffect, useMemo } from 'react';

import {
    runtime,
    ACCOUNT_CHANNEL_SID,
    isInPlaceList,
    isRelayDm,
    RELAY_CLOUD_ID,
    type DomainChannel,
} from '@chatic/runtime-react';

import { useActiveCloudData } from '../../../hooks/activeCloudDataContext';

export interface PlaceRoom {
    channel: DomainChannel;
    placeId?: string;
}

export interface CurrentPlaceRooms {
    cloudId: string;
    rooms: PlaceRoom[];
}

export const placeOf = (channel: DomainChannel): string | undefined =>
    !channel.sid || channel.sid === ACCOUNT_CHANNEL_SID || isRelayDm(channel) ? undefined : channel.sid;

export const useCurrentPlaceRooms = (): CurrentPlaceRooms => {
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const cloudId = selectedCloudId || RELAY_CLOUD_ID;
    const isVerified = runtime.connection.useCloudVerified(cloudId);
    const uid = runtime.session.useUidInCloud(cloudId);
    const { channels } = useActiveCloudData();

    const rooms = useMemo(
        () =>
            selectedSiteId
                ? channels
                      .filter(
                          channel =>
                              !!channel.id &&
                              channel.cid === cloudId &&
                              channel.stereo !== 'self' &&
                              isInPlaceList(channel, selectedSiteId)
                      )
                      .map(channel => ({ channel, placeId: placeOf(channel) }))
                : [],
        [channels, cloudId, selectedSiteId]
    );

    const channelKey = rooms
        .map(room => room.channel.id)
        .sort()
        .join(',');

    useEffect(() => {
        if (!isVerified || !channelKey) return;
        const disposers = channelKey
            .split(',')
            .map(id => runtime.sync.registerSyncTarget({ type: 'channel', id }, { cid: cloudId }));
        return () => disposers.forEach(dispose => dispose());
    }, [channelKey, cloudId, isVerified, uid]);

    return { cloudId, rooms };
};
