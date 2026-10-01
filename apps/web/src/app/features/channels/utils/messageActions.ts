import { chatMediaItems, type ChatFileSlot } from '@chatic/data';

import type { ClientChatView } from '../types';

type ActionTarget = Pick<ClientChatView, 'content' | 'upload$$' | 'chatNo' | 'hidden'>;

/** Whether the message says something in text — what Copy and Edit act on. */
export const hasMessageText = (message: ActionTarget): boolean => !!message.content?.trim();

/**
 * Whether a long press on this message has anything to offer, so the room and the thread open the
 * action sheet on the same rule.
 *
 * Text always has Copy. An image-only message has no text, so everything it can be given —
 * a reaction, a thread, a delete — needs the persisted row, and one still on its way has nothing:
 * opening the sheet for it would show an empty panel.
 */
export const canOpenMessageActions = (message: ActionTarget): boolean => {
    if (message.hidden) return false;
    if (hasMessageText(message)) return true;
    return (message.upload$$?.length ?? 0) > 0 && !!message.chatNo;
};

/**
 * The document the action sheet's "Share file" hands on: the message's first document the server
 * stored. A message with several shares only that first one — one row, one file, rather than a list
 * to pick from inside the sheet. A message still on its way, or with no stored document, has none.
 */
export const shareableFile = (
    message: Pick<ClientChatView, 'cid' | 'upload$$' | 'chatNo' | 'hidden'>
): ChatFileSlot | undefined => {
    if (message.hidden || !message.chatNo) return undefined;
    return chatMediaItems(message.cid, message.upload$$).files.find(file => file.state === 'ready' && !!file.url);
};
