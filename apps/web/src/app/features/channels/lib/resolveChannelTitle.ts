import type { DomainChannel } from '@chatic/runtime-react';

import { resolveDmTitle } from '../utils/dmTitle';
import { resolveSelfChatTitle } from '../utils/selfChatTitle';
import { dmLineageOf, resolveDmPeerName } from './channelStereoPolicy';

export interface ResolveChannelTitleInput {
    channel: DomainChannel;
    uid?: string;
    joinNick?: string;
    myNick?: string;
    peerNick?: string;
    peerCloudName?: string;
    selfLabel: string;
    unnamedLabel: string;
    dmUnnamedLabel: string;
}

export const resolveChannelTitle = ({
    channel,
    uid,
    joinNick,
    myNick,
    peerNick,
    peerCloudName,
    selfLabel,
    unnamedLabel,
    dmUnnamedLabel,
}: ResolveChannelTitleInput): string => {
    if (channel.stereo === 'self') {
        return resolveSelfChatTitle(joinNick ?? channel.$join?.nick, myNick, selfLabel, uid);
    }
    if (channel.stereo === 'dm') {
        const isCloud = dmLineageOf(channel) === 'cloud';
        return resolveDmTitle({
            joinNick: isCloud ? undefined : (joinNick ?? channel.$join?.nick),
            peerNick: resolveDmPeerName(channel, { profileNick: peerNick, cloudName: peerCloudName }),
            channelName: channel.name,
            unnamedLabel: dmUnnamedLabel,
            selfUserId: uid,
        });
    }
    return channel.name?.trim() || unnamedLabel;
};
