import { useMemo } from 'react';

import type { DomainChannel } from '@chatic/runtime-react';

import { dmLineageOf } from '../lib';
import { pickDmPeerId } from '../utils/dmPeer';
import { useChannelProfiles } from './useChannelProfiles';
import type { DmPeer } from './useDmPeer';
import { usePeerCloudNames, type CloudDmPeerRef } from './usePeerCloudNames';

export const LIST_PROFILE_SYNC_INTERVAL_MS = 60_000;

export const useDmPeers = (
    sid: string | null,
    channels: DomainChannel[],
    userId: string | null | undefined
): Map<string, DmPeer> => {
    const peerIdByChannel = useMemo(() => {
        const map = new Map<string, string>();
        for (const channel of channels) {
            if (channel.stereo !== 'dm') continue;
            const peerId = pickDmPeerId(channel.memberIds ?? [], userId);
            if (peerId) map.set(channel.id, peerId);
        }
        return map;
    }, [channels, userId]);

    const peerIds = useMemo(() => [...new Set(peerIdByChannel.values())].sort(), [peerIdByChannel]);

    const { profileMap } = useChannelProfiles(sid, peerIds, LIST_PROFILE_SYNC_INTERVAL_MS);

    const cloudRows = useMemo<CloudDmPeerRef[]>(() => {
        const rows: CloudDmPeerRef[] = [];
        for (const channel of channels) {
            const peerId = peerIdByChannel.get(channel.id);
            if (!peerId || dmLineageOf(channel) !== 'cloud') continue;
            rows.push({ channelId: channel.id, cid: channel.cid, peerId, profileNick: profileMap.get(peerId)?.nick });
        }
        return rows;
    }, [channels, peerIdByChannel, profileMap]);
    const cloudNames = usePeerCloudNames(cloudRows);

    return useMemo(() => {
        const map = new Map<string, DmPeer>();
        for (const [channelId, peerId] of peerIdByChannel) {
            const profile = profileMap.get(peerId);
            map.set(channelId, {
                id: peerId,
                profileNick: profile?.nick,
                cloudName: cloudNames.get(peerId),
                thumbnail: profile?.thumbnail,
            });
        }
        return map;
    }, [peerIdByChannel, profileMap, cloudNames]);
};
