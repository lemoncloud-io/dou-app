import { useTranslation } from 'react-i18next';

import { runtime, type DomainChannel } from '@chatic/runtime-react';

import { useMyProfile } from '../../../hooks';
import { resolveChannelTitle } from '../lib';

interface UseChannelTitleInput {
    joinNick?: string | null;
    peerNick?: string | null;
    peerCloudName?: string | null;
}

export const useChannelTitle = (
    channel: DomainChannel | null | undefined,
    { joinNick, peerNick, peerCloudName }: UseChannelTitleInput = {}
): string => {
    const { t } = useTranslation();
    const { profile } = useMyProfile();
    const { userId } = runtime.session.useSessionIdentity();

    const unnamedLabel = t('channelList.unnamedChannel');
    if (!channel) return unnamedLabel;

    return resolveChannelTitle({
        channel,
        uid: userId ?? undefined,
        joinNick: joinNick ?? undefined,
        myNick: profile?.nick,
        peerNick: peerNick ?? undefined,
        peerCloudName: peerCloudName ?? undefined,
        selfLabel: t('channelList.selfChannel'),
        unnamedLabel,
        dmUnnamedLabel: t('chat.dm.unnamedPeer'),
    });
};
