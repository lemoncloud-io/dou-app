import type { DomainChat } from '@chatic/data';

import { compareByChatNo, isNotifiableChat } from '../../../shared/utils';
import { isFeedVisible } from './feedVisibility';

/**
 * Whether a chat can stand as a channel's one-line preview in the sidebar.
 *
 * The feed's rule plus one. `isFeedVisible` already drops thread replies — they live in
 * the panel — and reaction events, which are chips on a message rather than rows of
 * their own; the preview additionally drops system rows, because join and leave carry
 * no body, so previewing one leaves the sidebar showing a blank line where a message
 * should be.
 *
 * Composed from the two predicates the app already has rather than restated. A third
 * copy of "which chats are real messages" would drift the first time either rule grew a
 * case — which is how the thread panel came to render messages with no reactions.
 *
 * A soft-deleted row still previews: it is genuinely the channel's latest message, and
 * the feed keeps it in place as a tombstone. The sidebar says the same thing in one line.
 */
export const isPreviewableChat = (chat: DomainChat): boolean => isFeedVisible(chat) && isNotifiableChat(chat);

/**
 * The newest previewable chat in an observed window, or undefined when it holds none
 * (a channel whose recent traffic is all replies and reactions shows no preview).
 *
 * Newest is `compareByChatNo`'s order, not the raw number. A message you just sent is
 * still pending and carries the sentinel `chatNo: 0`, which loses every numeric
 * comparison against persisted rows — rank by that and your own message stays out of
 * the sidebar until the server answers.
 */
export const pickPreviewChat = (chats: DomainChat[]): DomainChat | undefined =>
    chats.reduce<DomainChat | undefined>(
        (best, chat) => (isPreviewableChat(chat) && (!best || compareByChatNo(best, chat) <= 0) ? chat : best),
        undefined
    );
