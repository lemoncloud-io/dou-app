import { isPendingUploadSlot, type DomainChat } from '@chatic/runtime';

export const isPendingImageChat = (chat: Pick<DomainChat, 'upload$$'>): boolean =>
    !!chat.upload$$?.some(isPendingUploadSlot);
