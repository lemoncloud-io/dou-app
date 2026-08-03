import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/data';
import { useSessionIdentity } from '@chatic/web-core';

import { useMyProfile } from '../../../hooks';
import { resolveChannelTitle } from '../lib';

interface UseChannelTitleInput {
    /** My nick in this channel, read from the join CACHE (`useMyJoin`) — never `channel.$join`,
     *  which is a projection that lags a rename. */
    joinNick?: string | null;
    /** The DM peer's place-profile nick (`useDmPeer`); ignored for non-DM channels. */
    peerNick?: string | null;
}

/**
 * The room header / settings title for a channel — the same chain the home list uses, so a channel
 * reads identically wherever it appears. The screens differ only in how they source the join nick
 * and the DM peer, which is why those two come in as arguments while the identity, my profile nick
 * and the labels are resolved here.
 *
 * Prefer {@link resolveChannelTitle} directly in list rows: this hook calls `useMyProfile`, which
 * triggers a profile fetch, so it is not meant to run per row.
 */
export const useChannelTitle = (
    channel: DomainChannel | null | undefined,
    { joinNick, peerNick }: UseChannelTitleInput = {}
): string => {
    const { t } = useTranslation();
    const { profile } = useMyProfile();
    const { userId } = useSessionIdentity();

    const unnamedLabel = t('channelList.unnamedChannel');
    if (!channel) return unnamedLabel;

    return resolveChannelTitle({
        channel,
        uid: userId ?? undefined,
        joinNick: joinNick ?? undefined,
        myNick: profile?.nick,
        peerNick: peerNick ?? undefined,
        selfLabel: t('channelList.selfChannel'),
        unnamedLabel,
        dmUnnamedLabel: t('chat.dm.unnamedPeer'),
    });
};
