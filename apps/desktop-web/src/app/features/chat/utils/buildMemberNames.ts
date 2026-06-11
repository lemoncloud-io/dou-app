import { displayName } from '../../../shared';
import type { ChannelMember } from '../../channels';

/**
 * Channel author-name map for message rendering: roster display names overlaid
 * with cached author names (cache wins). Shared by the chat pane and the thread
 * panel so both resolve authors identically.
 */
export const buildMemberNames = (
    members: ChannelMember[],
    cachedNames: ReadonlyMap<string, string>
): Map<string, string> => {
    const map = new Map<string, string>();
    for (const member of members) {
        const name = displayName(member);
        // displayName falls back to the id — skip so a raw id never shows as a name.
        if (name && name !== member.id) map.set(member.id, name);
    }
    for (const [id, name] of cachedNames) map.set(id, name);
    return map;
};
