import type { DomainPlaceMember } from '@chatic/runtime-react';

export const orderPlaceMembers = (members: DomainPlaceMember[], isMe: (id: string) => boolean): DomainPlaceMember[] => {
    const rank = (member: DomainPlaceMember) => (member.isOwner ? 0 : isMe(member.id) ? 1 : 2);
    return [...members].sort((a, b) => rank(a) - rank(b));
};
