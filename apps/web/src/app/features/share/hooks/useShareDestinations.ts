import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { RELAY_CLOUD_ID, type DomainChannel } from '@chatic/data';

import { useActiveCloudData, useHomeChannels, useMyProfile } from '../../../hooks';
import { useCloudSelfChannels, useDmPeers } from '../../channels/hooks';
import { channelKindOf, isInCloudSelfSection, resolveChannelAvatar, resolveChannelTitle } from '../../channels/lib';
import { isSomeoneElsesSelfChat } from '../../channels/utils/membership';

/** A room a share can go to. */
export interface ShareDestination {
    /** The channel id. */
    id: string;
    cid: string;
    kind: 'self' | 'dm' | 'group';
    title: string;
    avatarSrc?: string;
    /**
     * The row the picker drew this destination from. Opening the room after a send hands it across,
     * as the home list does: with nothing on screen the room page waits for the cache's first answer,
     * and a refusal the sync layer records in that gap reads as "you are not in this conversation"
     * for the reader's own room.
     */
    channel: DomainChannel;
}

const KIND_ORDER: Record<ShareDestination['kind'], number> = { self: 0, dm: 1, group: 2 };

/**
 * The rooms a share can go to: the active place's rooms and the cloud's notes-to-self, named and
 * pictured as home names and pictures them — the same title and avatar rules over the same list —
 * so a room is recognised here by what it is called everywhere else. Notes-to-self first, then 1:1s,
 * then group rooms, each in the list's own order.
 */
export const useShareDestinations = (): { destinations: ShareDestination[]; isLoading: boolean } => {
    const { t } = useTranslation();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const uid = runtime.session.useSessionIdentity().userId;
    const { channels: placeChannels, isLoading } = useHomeChannels(selectedSiteId);
    const { channels: selfChannels } = useCloudSelfChannels();
    const { myJoins } = useActiveCloudData();
    const { profile: myProfile } = useMyProfile();

    // Home's two sections, joined: the cloud's notes-to-self belongs to the account, not the place.
    const rooms = useMemo(
        () =>
            [...selfChannels, ...placeChannels.filter(channel => !isInCloudSelfSection(channel))].filter(
                channel => !isSomeoneElsesSelfChat(channel, uid)
            ),
        [selfChannels, placeChannels, uid]
    );
    const peers = useDmPeers(selectedSiteId, rooms, uid);

    const destinations = useMemo(() => {
        const rows = rooms.map((channel): ShareDestination => {
            const peer = peers.get(channel.id);
            const kind = channelKindOf(channel.stereo);
            return {
                id: channel.id,
                cid: channel.cid || selectedCloudId || RELAY_CLOUD_ID,
                kind: kind === 'self' || kind === 'dm' ? kind : 'group',
                title: resolveChannelTitle({
                    channel,
                    uid: uid ?? undefined,
                    joinNick: myJoins.get(channel.id)?.nick,
                    myNick: myProfile?.nick,
                    peerNick: peer?.profileNick,
                    peerCloudName: peer?.cloudName,
                    selfLabel: t('channelList.selfChannel'),
                    unnamedLabel: t('channelList.unnamedChannel'),
                    dmUnnamedLabel: t('chat.dm.unnamedPeer'),
                }),
                avatarSrc: resolveChannelAvatar({
                    channel,
                    myThumbnail: myProfile?.thumbnail,
                    peerThumbnail: peer?.thumbnail,
                }).src,
                channel,
            };
        });
        // `sort` is stable, so each kind keeps the list's order.
        return rows.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    }, [rooms, peers, myJoins, myProfile, selectedCloudId, uid, t]);

    return { destinations, isLoading };
};

/** The destinations whose name holds the query, ignoring case; all of them for a blank query. */
export const matchDestinations = (destinations: ShareDestination[], query: string): ShareDestination[] => {
    const needle = query.trim().toLowerCase();
    return needle ? destinations.filter(destination => destination.title.toLowerCase().includes(needle)) : destinations;
};
