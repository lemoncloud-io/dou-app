import { displayName } from '../../../shared';
import type { ChannelMember } from '../../channels';

export const buildMemberNames = (
    members: ChannelMember[],
    cachedNames: ReadonlyMap<string, string>
): Map<string, string> => {
    const map = new Map<string, string>();
    for (const member of members) {
        const name = displayName(member);
        if (name && name !== member.id) map.set(member.id, name);
    }
    for (const [id, name] of cachedNames) map.set(id, name);
    return map;
};
