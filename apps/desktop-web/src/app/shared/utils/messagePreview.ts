import i18next from 'i18next';

import {
    chatAttachmentStoredKind,
    chatAttachmentSummary,
    isPendingUploadSlot,
    uploadSlotKind,
    type ChatAttachmentKind,
    type DomainChat,
} from '@chatic/data';

import { messagePlainText } from './messagePlainText';

// One attachment reads as its noun; several read as a count. Voice is desktop's own: the shared kinds
// have no noun for audio, so without it a voice memo reads as an attachment.
const LABEL_KEYS: Record<ChatAttachmentKind | 'voice', { one: string; many: string }> = {
    image: { one: 'chat.attach.preview', many: 'chat.attach.previewCount' },
    video: { one: 'chat.attach.previewVideo', many: 'chat.attach.previewVideoCount' },
    file: { one: 'chat.attach.previewFile', many: 'chat.attach.previewFileCount' },
    mixed: { one: 'chat.attach.previewMixed', many: 'chat.attach.previewMixedCount' },
    voice: { one: 'chat.attach.previewVoice', many: 'chat.attach.previewVoiceCount' },
};

/**
 * What a message's attachments are, as one line: "Photo", "3 files", "2 attachments", and "Voice file"
 * when `voice` says every one is.
 */
export const attachmentLabel = ({
    kind,
    count,
    voice,
}: {
    kind: ChatAttachmentKind;
    count: number;
    voice?: boolean;
}): string => {
    const keys = LABEL_KEYS[voice ? 'voice' : kind];
    return count === 1 ? i18next.t(keys.one) : i18next.t(keys.many, { count });
};

type UploadSlot = NonNullable<DomainChat['upload$$']>[number];

/**
 * Whether a slot holds a voice file, the way the feed's voice card decides it: one on its way by the type
 * it kept, one sent by its type and name — under `audio`, or under `file` from a server that stored audio
 * as a document. A stored kind alone is not enough; the feed draws such an upload as a plain file.
 */
export const isVoiceSlot = (slot: UploadSlot): boolean => {
    if (isPendingUploadSlot(slot)) return uploadSlotKind(slot) === 'audio';
    if (slot.stereo !== 'audio' && slot.stereo !== 'file') return false;
    return chatAttachmentStoredKind({ name: slot.name ?? '', type: slot.contentType ?? '' }) === 'audio';
};

/**
 * A message as one line for surfaces that are not the feed: an OS notification's body, a
 * sidebar row's preview. Its text when it has any; otherwise what it carries, by kind. An
 * attachment-only message has no text, so it used to reach these as an empty line ("Raine:" in a
 * banner), and later as "Photo" whatever the file was.
 */
export const messagePreview = (chat: Pick<DomainChat, 'content' | 'upload$$' | 'uploadIds' | 'hidden'>): string => {
    // A deleted message reads as deleted wherever it is quoted. A server that records deletes empties
    // the body, which would leave a blank line here; an older one keeps it, which would quote words the
    // author took back.
    if (chat.hidden) return i18next.t('sidebar.deletedPreview');
    const text = messagePlainText(chat.content).trim();
    if (text) return text;
    const slots = chat.upload$$ ?? [];
    const attachments = chatAttachmentSummary(chat);
    if (!attachments) return '';
    return attachmentLabel({ ...attachments, voice: slots.length > 0 && slots.every(isVoiceSlot) });
};

/**
 * A reply as one line before the server has it — the composer's text and files, not a chat row. Its
 * text when it has any; otherwise what it carries, by the same kinds a sent message reads as.
 */
export const outgoingMessagePreview = (content: string, files: File[]): string => {
    const text = messagePlainText(content).trim();
    if (text || files.length === 0) return text;
    const kinds = new Set(files.map(file => chatAttachmentStoredKind(file) ?? 'file'));
    const [only] = kinds;
    const kind: ChatAttachmentKind = kinds.size === 1 && only !== 'audio' ? only : 'mixed';
    return attachmentLabel({ kind, count: files.length, voice: kinds.size === 1 && only === 'audio' });
};
