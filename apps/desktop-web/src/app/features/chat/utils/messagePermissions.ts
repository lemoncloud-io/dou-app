import type { DomainChat } from '@chatic/runtime';

export const canModifyMessage = (chat: DomainChat, isMine: boolean): boolean =>
    isMine && !!chat.id && !chat.isPending && !chat.isFailed && chat.stereo !== 'system' && !chat.hidden;
