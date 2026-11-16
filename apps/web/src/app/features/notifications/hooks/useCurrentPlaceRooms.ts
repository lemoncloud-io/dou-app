import { useEffect, useMemo } from 'react';

import { runtime } from '@chatic/app-runtime';
import { ACCOUNT_CHANNEL_SID, RELAY_CLOUD_ID, isInPlaceList, isRelayDm, type DomainChannel } from '@chatic/data';

import { useActiveCloudData } from '../../../hooks/activeCloudDataContext';

export interface PlaceRoom {
    channel: DomainChannel;
    /** The place the room is filed under; absent for a room that belongs to no single place. */
    placeId?: string;
}

export interface CurrentPlaceRooms {
    cloudId: string;
    rooms: PlaceRoom[];
}

/**
 * Where a room is filed for the inbox. A relay 1:1 is one room per pair whatever place it carries,
 * and the account's own rooms carry a stand-in place, so neither names a place.
 */
export const placeOf = (channel: DomainChannel): string | undefined =>
    !channel.sid || channel.sid === ACCOUNT_CHANNEL_SID || isRelayDm(channel) ? undefined : channel.sid;

/**
 * The rooms the inbox reads: those of the CURRENT cloud's CURRENT place, from the app's one shared
 * channel observation. The reader's own notes room is left out, since nothing in it is anyone else's.
 *
 * Each room's channel sync is registered while it is in scope, so its record — the read cursor, the
 * notification level, the head the chat catch-up follows — stays live wherever the reader is in the
 * app. The registration is the same one home's rows make, and the sync engine merges the two.
 */
export const useCurrentPlaceRooms = (): CurrentPlaceRooms => {
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const cloudId = selectedCloudId || RELAY_CLOUD_ID;
    const isVerified = runtime.connection.useCloudVerified(cloudId);
    // A target only runs while the uid it was tagged with is still the account's uid in its cloud,
    // so an account change retires it — re-register on it.
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

    // Sorted so a reorder does not re-register.
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
