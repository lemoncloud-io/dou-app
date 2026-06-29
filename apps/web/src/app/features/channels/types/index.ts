import type { DomainChannel, DomainChat, DomainJoin, DomainUser } from '@chatic/data';

// Re-export the domain models so feature code pulls view + model types from one place.
export type { DomainChannel, DomainChat, DomainJoin, DomainUser };

/**
 * Window event fired when the native shell returns to foreground and the room
 * must re-run its read/sync side effects. Dormant until a dispatcher emits it.
 */
export const FOREGROUND_RESYNC_EVENT_NAME = 'chatic:foreground-resync';

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

/** A channel member: the cached user joined with their per-channel join row. */
export interface ChannelMember extends DomainUser {
    $join?: DomainJoin;
}
