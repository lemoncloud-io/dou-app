import { chatAttachmentSummary, type ChatAttachmentKind, type DomainChat } from '@chatic/runtime';

import { messagePreview } from './messagePlainText';

type Translate = (key: string, options?: { count?: number; name?: string; text?: string }) => string;

const ATTACHMENT_PREVIEW_KEYS: Record<ChatAttachmentKind, { one?: string; many: string }> = {
    image: { one: 'chat.attach.preview', many: 'chat.attach.previewCount' },
    video: { one: 'chat.attach.previewVideo', many: 'chat.attach.previewVideoCount' },
    file: { one: 'chat.attach.previewFile', many: 'chat.attach.previewFileCount' },
    mixed: { many: 'chat.attach.previewMixedCount' },
};

const attachmentPreviewKey = ({ kind, count }: { kind: ChatAttachmentKind; count: number }): string => {
    const keys = ATTACHMENT_PREVIEW_KEYS[kind];
    return count === 1 && keys.one ? keys.one : keys.many;
};

export const lastChatPreview = (
    chat: Pick<DomainChat, 'content' | 'hidden' | 'upload$$' | 'uploadIds' | 'parentId'> | null | undefined,
    t: Translate,
    sender?: string
): string => {
    const line = previewLine(chat, t);
    if (!chat || !line) return '';
    const name = sender?.trim();
    const withSender = name ? t('chat.preview.sender', { name, text: line }) : line;
    return chat.parentId ? t('chat.preview.thread', { text: withSender }) : withSender;
};

const previewLine = (
    chat: Pick<DomainChat, 'content' | 'hidden' | 'upload$$' | 'uploadIds'> | null | undefined,
    t: Translate
): string => {
    if (!chat) return '';
    if (chat.hidden) return t('chat.room.deletedMessage');
    const text = messagePreview(chat.content);
    if (text) return text;
    const attachments = chatAttachmentSummary(chat);
    return attachments ? t(attachmentPreviewKey(attachments), { count: attachments.count }) : '';
};
