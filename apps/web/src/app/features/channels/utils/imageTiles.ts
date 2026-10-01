import { isPendingUploadSlot, type DomainChat } from '@chatic/data';

/** Whether the row is an image message still owned by this page's send — the one retry can reach. */
export const isPendingImageChat = (chat: Pick<DomainChat, 'upload$$'>): boolean =>
    !!chat.upload$$?.some(isPendingUploadSlot);
