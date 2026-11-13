import { notifyLevelOf } from '../../channels/utils/notifyLevel';

import type { NotificationKind } from '../../../utils/notifications';

/** How the reader stands to the thread a reply is in. */
export type ThreadRelation = 'rootMine' | 'participated' | 'none';

export interface MessageFacts {
    /** The message is a thread reply (`parentId` set). */
    isThreadReply: boolean;
    /** The message's mention record names the reader, or everyone. */
    mentionsMe: boolean;
    /** The room is a 1:1. */
    isDm: boolean;
    /** For a thread reply: the reader's relation to its thread. Ignored for a top-level message. */
    thread: ThreadRelation;
    /** The reader turned the room's notifications off or down to mentions: only mentions get in. */
    mentionsOnly: boolean;
}

/**
 * The kind a message someone else wrote is filed under, or `null` when it does not belong in the
 * inbox. One message is one item, and the strongest reason wins:
 *
 * mention / threadMention > replyToMine > participatedThread > dmMessage.
 *
 * A 1:1 message comes last on purpose: a 1:1 message that calls me out is a mention, and a reply in
 * a thread of mine there is a reply to mine. The plain "new message" kind is what is left over.
 * Reactions are not messages and are filed on their own.
 */
export const classifyMessage = ({
    isThreadReply,
    mentionsMe,
    isDm,
    thread,
    mentionsOnly,
}: MessageFacts): NotificationKind | null => {
    if (mentionsMe) return isThreadReply ? 'threadMention' : 'mention';
    if (mentionsOnly) return null;
    if (isThreadReply && thread === 'rootMine') return 'replyToMine';
    if (isThreadReply && thread === 'participated') return 'participatedThread';
    return isDm ? 'dmMessage' : null;
};

/**
 * Whether a room keeps only mentions: my join row's `notify` is off, or mentions only. Read through
 * the rooms' own `notifyLevelOf`, so the inbox and the room settings cannot disagree about a level —
 * a 1:1 has no mentions-only level, and an unknown value means the server's default, everything.
 */
export const keepsMentionsOnly = (notify: string | null | undefined, isDm: boolean): boolean =>
    notifyLevelOf(notify, isDm) !== 'all';
