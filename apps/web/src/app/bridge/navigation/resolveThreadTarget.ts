import { channelIdOfChatId, type DomainChat } from '@chatic/runtime-react';

import { ROUTES } from '../../routes/paths';

export const resolveThreadTarget = (
    chat: Pick<DomainChat, 'parentId' | 'channelId'> | null | undefined,
    chatId: string
): string | null => {
    const parentId = chat?.parentId;
    if (!parentId) return null;

    const channelId = chat?.channelId || channelIdOfChatId(chatId);
    if (!channelId) return null;

    const rootNo = parentId.includes(':') ? parentId.split(':').pop() : parentId;
    if (!rootNo) return null;

    return ROUTES.channels.thread(channelId, rootNo);
};
