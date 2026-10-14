import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/data';

import { displayName, resolveDisplay, useSiteProfileMap } from '../../../shared';
import type { ChannelMember } from '../../channels';
import { EVERYONE_MENTION_ID, type Mentionable } from '../components/MentionAutocomplete';
import { isDmBucket, isViewerId, type MessageViewer } from '../utils';

/**
 * Roster resolved for @-autocomplete the same way names render elsewhere
 * (Place Profile nick/thumbnail over the global identity). Shared by the chat
 * pane and thread panel composers.
 *
 * Sorted by name with me last. The first row is the one Enter picks, and a name
 * that sorted me to the top made mentioning myself the default. I stay in the
 * list, so a self-mention is still one arrow key away.
 *
 * In a channel of many the list opens with the everyone row, as the phone's does. Its name is the
 * word written into the message — the UI language's, which `GROUP_MENTIONS` reads back on every
 * client. A 1:1 and the Self Channel have no one else to call, and a caller that does not say
 * which channel this is gets no such row.
 */
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
