import type { DomainPlaceMember } from '@chatic/data';

/**
 * The member screen's order: the owner first, then me, then everyone else in the order the server
 * listed them. The sort is stable, so the server's order survives inside each group.
 */
export const orderPlaceMembers = (members: DomainPlaceMember[], isMe: (id: string) => boolean): DomainPlaceMember[] => {
    const rank = (member: DomainPlaceMember) => (member.isOwner ? 0 : isMe(member.id) ? 1 : 2);
    return [...members].sort((a, b) => rank(a) - rank(b));
};
