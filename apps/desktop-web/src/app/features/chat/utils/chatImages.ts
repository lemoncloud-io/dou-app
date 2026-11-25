import {
    CHAT_ATTACHMENT_MAX_BYTES,
    chatAttachmentFormat,
    chatAttachmentSummary,
    isChatAttachmentNameTooLong,
    isPendingUploadSlot,
    uploadSlotKind,
    type DomainChat,
} from '@chatic/runtime-react';

import type { SavedAttachment } from '../../../shared/stores/useSavedItemsStore';
import { isVoiceSlot } from '../../../shared/utils/messagePreview';

export interface ChatImage {
    id: string;
    name: string;
    url: string;
    thumbUrl?: string;
    isUploading?: boolean;
    isFailed?: boolean;
}

export const isSafeImageUrl = (url: string): boolean =>
    url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:image/');

export const isUnsentImageMessage = (message: Pick<DomainChat, 'upload$$'>): boolean =>
    !!message.upload$$?.some(isPendingUploadSlot);

export const isSendingImages = (message: Pick<DomainChat, 'upload$$'>): boolean =>
    !!message.upload$$?.some(slot => isPendingUploadSlot(slot) && slot.localStatus === 'sending');

export interface ChatFile {
    id: string;
    kind: 'video' | 'file';
    name?: string;
    size?: number;
    contentType?: string;
    url: string;
    slot?: number;
    isUploading?: boolean;
    isFailed?: boolean;
}

type Slot = NonNullable<DomainChat['upload$$']>[number];

const slotKind = (slot: Slot): 'image' | 'video' | 'file' => {
    const kind = uploadSlotKind(slot);
    return kind === 'audio' ? 'file' : kind;
};

const isSafeFileUrl = (url: string): boolean => url.startsWith('https://');

export const toChatFiles = (messageId: string, slots: DomainChat['upload$$']): ChatFile[] =>
    (slots ?? []).flatMap((slot, index): ChatFile[] => {
        const kind = slotKind(slot);
        if (kind === 'image') return [];
        if (isPendingUploadSlot(slot)) {
            return [
                {
                    id: `${messageId}:${index}`,
                    kind,
                    ...(slot.localName ? { name: slot.localName } : {}),
                    ...(slot.localSize !== undefined ? { size: slot.localSize } : {}),
                    ...(slot.localContentType ? { contentType: slot.localContentType } : {}),
                    url: '',
                    slot: index,
                    isUploading: slot.localStatus === 'sending',
                    isFailed: slot.localStatus === 'failed',
                },
            ];
        }
        const base = {
            id: slot.id ?? `${messageId}:${index}`,
            kind,
            ...(slot.name ? { name: slot.name } : {}),
            ...(slot.contentSize !== undefined ? { size: slot.contentSize } : {}),
            ...(slot.contentType ? { contentType: slot.contentType } : {}),
        };
        if (slot.status === 'failed' || slot.error) return [{ ...base, url: '', isFailed: true }];
        if (!slot.orgUrl) return [{ ...base, url: '', isUploading: true }];
        if (!isSafeFileUrl(slot.orgUrl)) return [{ ...base, url: '', isFailed: true }];
        return [{ ...base, url: slot.orgUrl }];
    });

export const toChatImages = (messageId: string, slots: DomainChat['upload$$']): ChatImage[] => {
    const images: ChatImage[] = [];
    (slots ?? []).forEach((slot, index) => {
        if (slotKind(slot) === 'image') images.push(toChatImage(messageId, slot, index, images.length + 1));
    });
    return images;
};

const toChatImage = (messageId: string, slot: Slot, index: number, position: number): ChatImage => {
    if (isPendingUploadSlot(slot)) {
        return {
            id: `${messageId}:${index}`,
            name: `image-${position}`,
            url: slot.localThumbUrl,
            isUploading: slot.localStatus === 'sending',
            isFailed: slot.localStatus === 'failed',
        };
    }
    const id = slot.id ?? `${messageId}:${index}`;
    const name = slot.name || `image-${position}`;
    if (slot.status === 'failed' || slot.error) return { id, name, url: '', isFailed: true };
    if (!slot.orgUrl) return { id, name, url: '', isUploading: true };
    if (!isSafeImageUrl(slot.orgUrl)) return { id, name, url: '', isFailed: true };
    const thumbUrl = slot.thumbUrl && isSafeImageUrl(slot.thumbUrl) ? slot.thumbUrl : undefined;
    return { id, name, url: slot.orgUrl, ...(thumbUrl ? { thumbUrl } : {}) };
};

export const MAX_ATTACHMENTS = 10;

export const MAX_VISIBLE_TILES = 4;

export const savedAttachmentOf = (message: Pick<DomainChat, 'upload$$' | 'uploadIds'>): SavedAttachment | undefined => {
    const summary = chatAttachmentSummary(message);
    if (!summary) return undefined;
    const first = message.upload$$?.[0];
    if (!first) return summary;
    const name = isPendingUploadSlot(first) ? first.localName : first.name;
    const size = isPendingUploadSlot(first) ? first.localSize : first.contentSize;
    const voice = message.upload$$?.every(isVoiceSlot);
    return {
        ...summary,
        ...(name ? { name } : {}),
        ...(size !== undefined ? { size } : {}),
        ...(voice ? { voice: true as const } : {}),
    };
};

export const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${Number(value.toFixed(1))} ${units[unit]}`;
};

export const attachmentKey = (file: Pick<File, 'name' | 'size' | 'lastModified'>): string =>
    `${file.name}:${file.size}:${file.lastModified}`;

export type AttachmentRejection =
    | 'folder'
    | 'empty'
    | 'unsupported'
    | 'too-large'
    | 'name-too-long'
    | 'duplicate'
    | 'limit';

export interface AttachmentValidation<T> {
    accepted: T[];
    refused: { file: T; reason: AttachmentRejection; max?: number }[];
}

export const validateAttachments = <T extends Pick<File, 'name' | 'size' | 'lastModified' | 'type'>>(
    existingKeys: readonly string[],
    incoming: readonly T[],
    isFolder: (file: T) => boolean = () => false
): AttachmentValidation<T> => {
    const seen = new Set(existingKeys);
    const accepted: T[] = [];
    const refused: AttachmentValidation<T>['refused'] = [];
    for (const file of incoming) {
        const refusal = refusalOf(file, seen, isFolder);
        if (refusal) {
            refused.push({ file, ...refusal });
            continue;
        }
        seen.add(attachmentKey(file));
        accepted.push(file);
    }
    return { accepted, refused };
};

const refusalOf = <T extends Pick<File, 'name' | 'size' | 'lastModified' | 'type'>>(
    file: T,
    seen: ReadonlySet<string>,
    isFolder: (file: T) => boolean
): { reason: AttachmentRejection; max?: number } | undefined => {
    if (isFolder(file)) return { reason: 'folder' };
    if (file.size === 0) return { reason: 'empty' };
    const format = chatAttachmentFormat(file);
    if (!format) return { reason: 'unsupported' };
    const maxBytes = CHAT_ATTACHMENT_MAX_BYTES[format.kind];
    if (file.size > maxBytes) return { reason: 'too-large', max: maxBytes };
    if (isChatAttachmentNameTooLong(format.name)) return { reason: 'name-too-long' };
    if (seen.has(attachmentKey(file))) return { reason: 'duplicate' };
    if (seen.size >= MAX_ATTACHMENTS) return { reason: 'limit', max: MAX_ATTACHMENTS };
    return undefined;
};

export interface ImageGridLayout {
    tiles: ChatImage[];
    overflow: number;
}

export const layoutImageGrid = (images: readonly ChatImage[]): ImageGridLayout => {
    if (images.length <= MAX_VISIBLE_TILES) return { tiles: [...images], overflow: 0 };
    return { tiles: images.slice(0, MAX_VISIBLE_TILES), overflow: images.length - MAX_VISIBLE_TILES };
};
