import type { DomainChannel, DomainChat, DomainJoin, DomainUser } from '@chatic/data';

// Re-export the domain models so feature code pulls view + model types from one place.
export type { DomainChannel, DomainChat, DomainJoin, DomainUser };

/**
 * A chat message enriched for rendering: owner identity, a parsed `Date`, and
 * derived ownership/system flags layered on top of the cached domain model.
 */
export interface ClientChatView extends DomainChat {
    isOwner: boolean;
    isSystem: boolean;
    ownerName: string;
    timestamp: Date;
}

/**
 * A channel enriched for the room/settings UI: ownership plus membership info
 * derived from the domain model (self-chat flag, member count).
 */
export interface ClientChannelView extends DomainChannel {
    isOwner: boolean;
    isSelfChat: boolean;
    memberCount: number;
}

/**
 * A channel member: a participant id, optionally decorated with whatever the caches know.
 *
 * Identity is `Partial`, not required, because membership and identity hydrate through different
 * paths with different guarantees. The roster (`channel.memberIds`) and the join cache both have
 * runtime sync plans; the USER cache has none — `syncChannelUsers` is its only writer. Requiring a
 * cached user row would therefore drop real members, which is exactly how a self-chat ended up with
 * an empty "방 친구": one participant, no user row, nothing rendered.
 */
export type ChannelMember = Partial<DomainUser> & {
    id: string;
    $join?: DomainJoin;
};
