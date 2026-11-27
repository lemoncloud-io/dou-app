import { isPendingUploadSlot } from './uploads';

import { uploadSlotKind } from './chatAttachments';
import type { DomainChat } from './models';

type UploadSlot = NonNullable<DomainChat['upload$$']>[number];

export type ChatUploadState = 'ready' | 'sending' | 'failed' | 'broken';

export interface MediaItem {
    readonly key: string;
    readonly kind: 'image' | 'video';
    readonly src?: string;
    readonly preview?: string;
    readonly name?: string;
    readonly size?: number;
    readonly state: ChatUploadState;
}

export interface ChatFileSlot {
    readonly key: string;
    readonly uploadId?: string;
    readonly name?: string;
    readonly size?: number;
    readonly contentType?: string;
    readonly url?: string;
    readonly state: ChatUploadState;
    readonly audio?: true;
}

export interface ChatMediaSplit {
    media: MediaItem[];
    files: ChatFileSlot[];
    mediaSlots: number[];
    fileSlots: number[];
}

const keyOf = (cid: string, slot: UploadSlot, index: number): string => {
    if (isPendingUploadSlot(slot)) return `local-${index}`;
    return slot.id ? `${cid}/${slot.id}` : `${cid}/upload-${index}`;
};

export const chatMediaItems = (cid: string, slots: readonly UploadSlot[] | null | undefined): ChatMediaSplit => {
    const split: ChatMediaSplit = { media: [], files: [], mediaSlots: [], fileSlots: [] };
    (slots ?? []).forEach((slot, index) => {
        const slotKind = uploadSlotKind(slot);
        const kind = slotKind === 'audio' ? 'file' : slotKind;
        const audio = slotKind === 'audio' ? { audio: true as const } : {};
        const key = keyOf(cid, slot, index);
        if (isPendingUploadSlot(slot)) {
            const local = slot.localThumbUrl || undefined;
            const details = {
                ...(slot.localName ? { name: slot.localName } : {}),
                ...(slot.localSize !== undefined ? { size: slot.localSize } : {}),
            };
            if (kind === 'file') {
                split.files.push({
                    key,
                    ...details,
                    ...(slot.localContentType ? { contentType: slot.localContentType } : {}),
                    state: slot.localStatus,
                    ...audio,
                });
                split.fileSlots.push(index);
                return;
            }
            split.media.push({
                key,
                kind,
                ...(kind === 'image' && local ? { src: local } : {}),
                ...(local ? { preview: local } : {}),
                ...details,
                state: slot.localStatus,
            });
            split.mediaSlots.push(index);
            return;
        }
        const broken = slot.status === 'failed' || !!slot.error;
        const details = {
            ...(slot.name ? { name: slot.name } : {}),
            ...(slot.contentSize !== undefined ? { size: slot.contentSize } : {}),
        };
        if (kind === 'file') {
            split.files.push({
                key,
                ...(slot.id ? { uploadId: slot.id } : {}),
                ...details,
                ...(slot.contentType ? { contentType: slot.contentType } : {}),
                ...(slot.orgUrl ? { url: slot.orgUrl } : {}),
                state: broken || !slot.orgUrl ? 'broken' : 'ready',
                ...audio,
            });
            split.fileSlots.push(index);
            return;
        }
        const src = slot.orgUrl ?? (kind === 'image' ? slot.thumbUrl : undefined);
        const preview = slot.thumbUrl ?? (kind === 'image' ? slot.orgUrl : undefined);
        split.media.push({
            key,
            kind,
            ...(src ? { src } : {}),
            ...(preview ? { preview } : {}),
            ...details,
            state: broken || !src ? 'broken' : 'ready',
        });
        split.mediaSlots.push(index);
    });
    return split;
};
