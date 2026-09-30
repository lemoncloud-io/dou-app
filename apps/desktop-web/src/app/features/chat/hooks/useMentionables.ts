import { useMemo } from 'react';

import { displayName, resolveDisplay, useSiteProfileMap } from '../../../shared';
import type { ChannelMember } from '../../channels';
import type { Mentionable } from '../components/MentionAutocomplete';
import { isViewerId, type MessageViewer } from '../utils';

/**
 * Roster resolved for @-autocomplete the same way names render elsewhere
 * (Place Profile nick/thumbnail over the global identity). Shared by the chat
 * pane and thread panel composers.
 *
 * Sorted by name with me last. The first row is the one Enter picks, and a name
 * that sorted me to the top made mentioning myself the default. I stay in the
 * list, so a self-mention is still one arrow key away.
 */
export const useMentionables = (members: ChannelMember[], viewer: MessageViewer): Mentionable[] => {
    const placeProfiles = useSiteProfileMap();
    return useMemo(
        () =>
            members
                .map(member => {
                    const display = resolveDisplay(
                        member.id ? placeProfiles[member.id] : undefined,
                        displayName(member),
                        member.thumbnail
                    );
                    return { id: member.id ?? '', name: display.name, thumbnail: display.thumbnail };
                })
                .filter(m => m.id && m.name)
                .sort(
                    (a, b) =>
                        Number(isViewerId(a.id, viewer)) - Number(isViewerId(b.id, viewer)) ||
                        a.name.localeCompare(b.name)
                ),
        [members, placeProfiles, viewer]
    );
};
