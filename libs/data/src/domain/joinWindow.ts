import type { DomainChat } from './models';

export const isInJoinWindow = (chat: Partial<Pick<DomainChat, 'chatNo'>>, joinedNo?: number): boolean =>
    !joinedNo || !chat.chatNo || chat.chatNo > joinedNo;
