import i18next from 'i18next';

import {
    chatAttachmentStoredKind,
    chatAttachmentSummary,
    isPendingUploadSlot,
    uploadSlotKind,
    type ChatAttachmentKind,
    type DomainChat,
} from '@chatic/runtime-react';

import { messagePlainText } from './messagePlainText';

const LABEL_KEYS: Record<ChatAttachmentKind | 'voice', { one: string; many: string }> = {
    image: { one: 'chat.attach.preview', many: 'chat.attach.previewCount' },
    video: { one: 'chat.attach.previewVideo', many: 'chat.attach.previewVideoCount' },
    file: { one: 'chat.attach.previewFile', many: 'chat.attach.previewFileCount' },
    mixed: { one: 'chat.attach.previewMixed', many: 'chat.attach.previewMixedCount' },
    voice: { one: 'chat.attach.previewVoice', many: 'chat.attach.previewVoiceCount' },
};

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

export const isVoiceSlot = (slot: UploadSlot): boolean => {
    if (isPendingUploadSlot(slot)) return uploadSlotKind(slot) === 'audio';
    if (slot.stereo !== 'audio' && slot.stereo !== 'file') return false;
    return chatAttachmentStoredKind({ name: slot.name ?? '', type: slot.contentType ?? '' }) === 'audio';
};

export const messagePreview = (chat: Pick<DomainChat, 'content' | 'upload$$' | 'uploadIds' | 'hidden'>): string => {
    if (chat.hidden) return i18next.t('sidebar.deletedPreview');
    return messagePlainText(chat.content).trim() || attachmentPreview(chat);
};

export const attachmentPreview = (chat: Pick<DomainChat, 'upload$$' | 'uploadIds'>): string => {
    const slots = chat.upload$$ ?? [];
    const attachments = chatAttachmentSummary(chat);
    if (!attachments) return '';
    return attachmentLabel({ ...attachments, voice: slots.length > 0 && slots.every(isVoiceSlot) });
};

export const outgoingMessagePreview = (content: string, files: File[]): string => {
    const text = messagePlainText(content).trim();
    if (text || files.length === 0) return text;
    const kinds = new Set(files.map(file => chatAttachmentStoredKind(file) ?? 'file'));
    const [only] = kinds;
    const kind: ChatAttachmentKind = kinds.size === 1 && only !== 'audio' ? only : 'mixed';
    return attachmentLabel({ kind, count: files.length, voice: kinds.size === 1 && only === 'audio' });
};
