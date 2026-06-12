import { useMemo } from 'react';

import { displayName, resolveDisplay, useSiteProfileMap } from '../../../shared';
import type { ChannelMember } from '../../channels';
import type { Mentionable } from '../components/MentionAutocomplete';

/**
 * Roster resolved for @-autocomplete the same way names render elsewhere
 * (Place Profile nick/thumbnail over the global identity). Shared by the chat
 * pane and thread panel composers.
 */
export const useMentionables = (members: ChannelMember[]): Mentionable[] => {
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
                .sort((a, b) => a.name.localeCompare(b.name)),
        [members, placeProfiles]
    );
};
