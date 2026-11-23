import type { DomainChat } from '@chatic/runtime';

import { compareByChatNo, isNotifiableChat } from '../../../shared/utils';
import { isFeedVisible } from './feedVisibility';

export const isPreviewableChat = (chat: DomainChat): boolean =>
    isFeedVisible(chat) && isNotifiableChat(chat) && !chat.isFailed;

export const pickPreviewChat = (chats: DomainChat[]): DomainChat | undefined =>
    chats.reduce<DomainChat | undefined>(
        (best, chat) => (isPreviewableChat(chat) && (!best || compareByChatNo(best, chat) <= 0) ? chat : best),
        undefined
    );
