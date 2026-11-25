import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime, type DomainChannel } from '@chatic/runtime-react';

import { profilePlaceOf } from '../lib/channelStereoPolicy';
import { resolveChatOwnerName, type DisplayNameSources } from '../utils/displayName';
import { useChannelJoins } from './useChannelJoins';
import { useChannelMembers } from './useChannelMembers';
import { useChannelProfiles } from './useChannelProfiles';

export const useRoomSenderName = (channel: DomainChannel | null | undefined, uid: string | undefined) => {
    const { t } = useTranslation();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const channelId = channel?.id ?? null;
    const { joins, activeMemberIds } = useChannelJoins(channelId);
    const { members } = useChannelMembers({
        channelId: channelId ?? 'default',
        detail: true,
        memberIds: channel?.memberIds,
        joins,
        keepLeftMembers: true,
    });
    const { profileMap } = useChannelProfiles(profilePlaceOf(channel ?? null, selectedSiteId), activeMemberIds);
    const sources: DisplayNameSources = useMemo(() => {
        const memberById = new Map<string, (typeof members)[number]>();
        for (const member of members) if (member.id) memberById.set(member.id, member);
        return { profileMap, memberById, userId: uid, unknownLabel: t('chat.unknownUser'), meLabel: t('chat.me') };
    }, [members, profileMap, uid, t]);
    return useCallback(
        (chat: { ownerId?: string; owner$?: { name?: string } }) => resolveChatOwnerName(chat, sources),
        [sources]
    );
};
