import type { DomainChat } from '@chatic/data';

/**
 * True when a system message's subject is the current user (e.g. "you joined the channel").
 * Such rows carry no information for that user, so display layers (room list, home preview)
 * hide them. On a system row `ownerId` is the actor who joined/left — not the room owner.
 * The empty-uid guard keeps pre-auth renders from matching rows whose ownerId is also empty.
 */
export const isOwnSystemChat = (chat: Pick<DomainChat, 'stereo' | 'ownerId'>, uid: string): boolean =>
    chat.stereo === 'system' && !!uid && chat.ownerId === uid;
