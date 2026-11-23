import {
    runtime,
    CHAT_ATTACHMENT_MAX_BYTES,
    chatAttachmentFormat,
    isShellFileRef,
    type ChatAttachmentSource,
    type ShellFileRef,
} from '@chatic/runtime';
import type { AttachmentPickSource, PickedShellAttachment, RefusedAttachment } from '@chatic/bridge-messages';

import { base64ToFile } from './photoLibrary';

export interface AttachmentPicker {
    pick(input: { source: AttachmentPickSource; selectionLimit: number }): Promise<AttachmentPick | null>;
    readPhotos(items: ChatAttachmentSource[]): Promise<AttachmentPick>;
    prepareVideo: runtime.data.PrepareVideoPort;
    isUnsupported(): boolean;
}

export interface AttachmentPick {
    items: ChatAttachmentSource[];
    refused: RefusedAttachment[];
}

export const toShellFile = (item: PickedShellAttachment): ShellFileRef => {
    const ref: ShellFileRef = {
        uri: item.uri,
        name: item.name,
        type: item.contentType,
        size: item.size,
        kind: item.kind,
        ...(item.needsExport ? { needsExport: true } : {}),
    };
    return ref;
};

const base64ToBlob = (base64: string, type: string): Blob => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
};

const photoType = (pickedType: string, readType: string): string =>
    readType === 'application/octet-stream' ? pickedType : readType;

const isPhotoFormat = (name: string, type: string): boolean => chatAttachmentFormat({ name, type })?.kind === 'image';

class ShellAttachmentPicker implements AttachmentPicker {
    isUnsupported(): boolean {
        return runtime.media.picker === null;
    }

    async pick({
        source,
        selectionLimit,
    }: {
        source: AttachmentPickSource;
        selectionLimit: number;
    }): Promise<AttachmentPick | null> {
        const picker = runtime.media.picker;
        if (!picker) return null;
        const data = await picker.pick({ source, selectionLimit, maxBytes: { ...CHAT_ATTACHMENT_MAX_BYTES } });
        const items: ChatAttachmentSource[] = [];
        const refused: RefusedAttachment[] = [...data.refused];
        for (const item of data.items) {
            if (item.kind !== 'image' && (source === 'document' || !isPhotoFormat(item.name, item.contentType))) {
                items.push(toShellFile(item));
                continue;
            }
            const photo = await this.readPhoto(item.uri, item.contentType);
            if (photo) items.push(photo);
            else refused.push({ name: item.name, kind: 'image', reason: 'unreadable' });
        }
        return { items, refused };
    }

    async readPhotos(items: ChatAttachmentSource[]): Promise<AttachmentPick> {
        const read: ChatAttachmentSource[] = [];
        const refused: RefusedAttachment[] = [];
        for (const item of items) {
            if (!isShellFileRef(item) || !isPhotoFormat(item.name, item.type)) {
                read.push(item);
                continue;
            }
            const photo = await this.readPhoto(item.uri, item.type);
            if (photo) read.push(photo);
            else refused.push({ name: item.name, kind: 'image', reason: 'unreadable' });
        }
        return { items: read, refused };
    }

    private async readPhoto(uri: string, pickedType: string): Promise<File | null> {
        const picker = runtime.media.picker;
        if (!picker) return null;
        try {
            const photo = await picker.read(uri);
            return base64ToFile(photo.base64, photo.fileName, photoType(pickedType, photo.mimeType));
        } catch {
            return null;
        }
    }

    prepareVideo: runtime.data.PrepareVideoPort = async video => {
        const converter = runtime.media.videoConverter;
        if (!converter) throw new Error('video conversion unavailable');
        const { file, poster } = await converter.prepare(video.uri);
        return {
            file: { uri: file.uri, name: file.name, type: file.contentType, size: file.size, kind: 'video' },
            width: file.width,
            height: file.height,
            poster: poster
                ? {
                      file: {
                          uri: poster.uri,
                          name: 'poster.jpg',
                          type: poster.contentType,
                          size: poster.size,
                          kind: 'video',
                      },
                      width: poster.width,
                      height: poster.height,
                      preview: base64ToBlob(poster.base64, poster.contentType),
                  }
                : null,
        };
    };
}

export const attachmentPicker: AttachmentPicker = new ShellAttachmentPicker();
