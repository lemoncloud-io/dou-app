import type { DomainChat } from './models';

export const canModifyMessage = (chat: DomainChat, isMine: boolean): boolean =>
    isMine && !!chat.id && !chat.isPending && !chat.isFailed && chat.stereo !== 'system' && !chat.hidden;

export const isMessageEdited = (chat: DomainChat): boolean => {
    if (chat.hidden || chat.isPending) return false;
    if ((chat.editedAt ?? 0) > 0) return true;
    const createdAt = chat.createdAt ?? 0;
    const updatedAt = chat.updatedAt ?? 0;
    return createdAt > 0 && updatedAt > createdAt;
};
