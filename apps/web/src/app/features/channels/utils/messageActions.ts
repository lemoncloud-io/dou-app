import { chatMediaItems, type ChatFileSlot } from '@chatic/runtime-react';

import type { ClientChatView } from '../types';

type ActionTarget = Pick<ClientChatView, 'content' | 'upload$$' | 'chatNo' | 'hidden'>;

export const hasMessageText = (message: ActionTarget): boolean => !!message.content?.trim();

export const canOpenMessageActions = (message: ActionTarget): boolean => {
    if (message.hidden) return false;
    if (hasMessageText(message)) return true;
    return (message.upload$$?.length ?? 0) > 0 && !!message.chatNo;
};

export const shareableFile = (
    message: Pick<ClientChatView, 'cid' | 'upload$$' | 'chatNo' | 'hidden'>
): ChatFileSlot | undefined => {
    if (message.hidden || !message.chatNo) return undefined;
    return chatMediaItems(message.cid, message.upload$$).files.find(
        file => file.state === 'ready' && !!file.url && !file.audio
    );
};

export const audioFileOf = (
    message: Pick<ClientChatView, 'cid' | 'upload$$' | 'chatNo' | 'hidden'>
): ChatFileSlot | undefined => {
    if (message.hidden || !message.chatNo) return undefined;
    return chatMediaItems(message.cid, message.upload$$).files.find(
        file => file.audio && file.state === 'ready' && !!file.url
    );
};
