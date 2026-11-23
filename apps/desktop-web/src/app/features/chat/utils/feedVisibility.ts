import { isEventChat, type DomainChat } from '@chatic/runtime';

export const isFeedVisible = (chat: DomainChat): boolean => !chat.parentId && !isEventChat(chat);
