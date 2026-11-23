import { notifyLevelOf } from '../../channels/utils/notifyLevel';

import type { NotificationKind } from '../../../utils/notifications';

export type ThreadRelation = 'rootMine' | 'participated' | 'none';

export interface MessageFacts {
    isThreadReply: boolean;
    mentionsMe: boolean;
    isDm: boolean;
    thread: ThreadRelation;
    mentionsOnly: boolean;
}

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

export const keepsMentionsOnly = (notify: string | null | undefined, isDm: boolean): boolean =>
    notifyLevelOf(notify, isDm) !== 'all';
