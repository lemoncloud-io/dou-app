import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime, RELAY_CLOUD_ID, type DomainChannel } from '@chatic/runtime';

import { useActiveCloudData, useHomeChannels, useMyProfile } from '../../../hooks';
import { useCloudSelfChannels, useDmPeers } from '../../channels/hooks';
import { channelKindOf, isInCloudSelfSection, resolveChannelAvatar, resolveChannelTitle } from '../../channels/lib';
import { isSomeoneElsesSelfChat } from '../../channels/utils/membership';

export interface ShareDestination {
    id: string;
    cid: string;
    kind: 'self' | 'dm' | 'group';
    title: string;
    avatarSrc?: string;
    channel: DomainChannel;
}

const KIND_ORDER: Record<ShareDestination['kind'], number> = { self: 0, dm: 1, group: 2 };

export const useShareDestinations = (): { destinations: ShareDestination[]; isLoading: boolean } => {
    const { t } = useTranslation();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const uid = runtime.session.useSessionIdentity().userId;
    const { channels: placeChannels, isLoading } = useHomeChannels(selectedSiteId);
    const { channels: selfChannels } = useCloudSelfChannels();
    const { myJoins } = useActiveCloudData();
    const { profile: myProfile } = useMyProfile();

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
        return rows.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    }, [rooms, peers, myJoins, myProfile, selectedCloudId, uid, t]);

    return { destinations, isLoading };
};

export const matchDestinations = (destinations: ShareDestination[], query: string): ShareDestination[] => {
    const needle = query.trim().toLowerCase();
    return needle ? destinations.filter(destination => destination.title.toLowerCase().includes(needle)) : destinations;
};
