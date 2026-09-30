import i18next from 'i18next';

import { chatAttachmentSummary, type ChatAttachmentKind, type DomainChat } from '@chatic/data';

import { messagePlainText } from './messagePlainText';

// One attachment reads as its noun; several read as a count.
const LABEL_KEYS: Record<ChatAttachmentKind, { one: string; many: string }> = {
    image: { one: 'chat.attach.preview', many: 'chat.attach.previewCount' },
    video: { one: 'chat.attach.previewVideo', many: 'chat.attach.previewVideoCount' },
    file: { one: 'chat.attach.previewFile', many: 'chat.attach.previewFileCount' },
    mixed: { one: 'chat.attach.previewMixed', many: 'chat.attach.previewMixedCount' },
};

/** What a message's attachments are, as one line: "Photo", "3 files", "2 attachments". */
export const attachmentLabel = ({ kind, count }: { kind: ChatAttachmentKind; count: number }): string => {
    const keys = LABEL_KEYS[kind];
    return count === 1 ? i18next.t(keys.one) : i18next.t(keys.many, { count });
};

/**
 * A message as one line for surfaces that are not the feed: an OS notification's body, a
 * sidebar row's preview. Its text when it has any; otherwise what it carries, by kind. An
 * attachment-only message has no text, so it used to reach these as an empty line ("Raine:" in a
 * banner), and later as "Photo" whatever the file was.
 */
export const messagePreview = (chat: Pick<DomainChat, 'content' | 'upload$$' | 'uploadIds'>): string => {
    const text = messagePlainText(chat.content).trim();
    if (text) return text;
    const attachments = chatAttachmentSummary(chat);
    return attachments ? attachmentLabel(attachments) : '';
};
