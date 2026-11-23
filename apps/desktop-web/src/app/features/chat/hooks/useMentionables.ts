import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/runtime';

import { displayName, resolveDisplay, useSiteProfileMap } from '../../../shared';
import type { ChannelMember } from '../../channels';
import { EVERYONE_MENTION_ID, type Mentionable } from '../components/MentionAutocomplete';
import { isDmBucket, isViewerId, type MessageViewer } from '../utils';

export const useMentionables = (
    members: ChannelMember[],
    viewer: MessageViewer,
    channel?: DomainChannel
): Mentionable[] => {
    const { t } = useTranslation();
    const placeProfiles = useSiteProfileMap();
    const offersEveryone = !!channel && !isDmBucket(channel);
    return useMemo(() => {
        const people = members
            .map(member => {
                const global = displayName(member);
                const display = resolveDisplay(
                    member.id ? placeProfiles[member.id] : undefined,
                    global,
                    member.thumbnail
                );
                return {
                    id: member.id ?? '',
                    name: display.name,
                    thumbnail: display.thumbnail,
                    subName: display.name !== global ? global : undefined,
                };
            })
            .filter(m => m.id && m.name)
            .sort(
                (a, b) =>
                    Number(isViewerId(a.id, viewer)) - Number(isViewerId(b.id, viewer)) || a.name.localeCompare(b.name)
            );
        if (!offersEveryone) return people;
        const everyone: Mentionable = {
            id: EVERYONE_MENTION_ID,
            name: t('chat.mention.everyoneWord'),
            everyone: true,
            keywords: [t('chat.mention.everyone')],
        };
        return [everyone, ...people];
    }, [members, placeProfiles, viewer, offersEveryone, t]);
};
