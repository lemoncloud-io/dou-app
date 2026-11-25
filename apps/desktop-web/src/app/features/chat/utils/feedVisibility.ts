import { isEventChat, type DomainChat } from '@chatic/runtime-react';

export const isFeedVisible = (chat: DomainChat): boolean => !chat.parentId && !isEventChat(chat);
