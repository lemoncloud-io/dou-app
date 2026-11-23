import type { DomainChat } from './models';

export const isOwnSystemChat = (chat: Pick<DomainChat, 'stereo' | 'ownerId'>, uid: string): boolean =>
    chat.stereo === 'system' && !!uid && chat.ownerId === uid;

export const compareByChatNo = (a: DomainChat, b: DomainChat): number => {
    const an = a.chatNo || Number.MAX_SAFE_INTEGER;
    const bn = b.chatNo || Number.MAX_SAFE_INTEGER;
    if (an !== bn) return an - bn;
    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
};

export const isNotifiableChat = (chat: Pick<DomainChat, 'stereo'>): boolean => chat.stereo !== 'system';

export const isEventChat = (chat: Pick<DomainChat, 'subType'>): boolean =>
    chat.subType === 'reaction' || chat.subType === 'edit';

export const isFeedVisible = (chat: Pick<DomainChat, 'parentId' | 'subType'>): boolean =>
    !chat.parentId && !isEventChat(chat);

export const isPreviewableChat = (chat: DomainChat): boolean => !chat.parentId && isActivityChat(chat);

export const isActivityChat = (chat: DomainChat): boolean =>
    !isEventChat(chat) && isNotifiableChat(chat) && !chat.isFailed;

export const pickPreviewChat = (chats: DomainChat[]): DomainChat | undefined => pickNewest(chats, isPreviewableChat);

export const pickActivityChat = (chats: DomainChat[]): DomainChat | undefined => pickNewest(chats, isActivityChat);

const pickNewest = (chats: DomainChat[], accepts: (chat: DomainChat) => boolean): DomainChat | undefined =>
    chats.reduce<DomainChat | undefined>(
        (best, chat) => (accepts(chat) && (!best || compareByChatNo(best, chat) <= 0) ? chat : best),
        undefined
    );

export interface DomainLastChat {
    channelId: string;
    lastNo: number;
    chat: DomainChat | null;
    activity: DomainChat | null;
}
