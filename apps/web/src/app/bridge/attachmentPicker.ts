import { isNative, webClient } from '@chatic/bridges';
import type { AttachmentPickSource, PickedShellAttachment, RefusedAttachment } from '@chatic/app-messages';
import type { runtime } from '@chatic/app-runtime';
import { CHAT_ATTACHMENT_MAX_BYTES, type ChatAttachmentSource, type ShellFileRef } from '@chatic/data';

import { base64ToFile } from './photoLibrary';

/**
 * The app's own picker for chat videos and documents, and its video conversion — or `null` from
 * `pick` in every shell that has neither, which the attach menu takes as "use the page's own input".
 *
 * Videos and documents stay in the shell: it copies what was picked into its own folder and answers
 * with addresses, which the upload then sends from there. Photos are kept there too, already prepared,
 * and their bytes are read one photo at a time (`ReadAttachment`), because the page prepares every
 * photo itself and ten photos in one answer would be hundreds of megabytes of base64. A photo that
 * cannot be read is refused alone, as `unreadable`; the pick resolves once every photo is read, so the
 * pending row appears with all of them, as it does for the photo grid.
 *
 * The web ships ahead of the app, so this runs inside app builds that have no such picker. Such a shell
 * answers `NOT_FOUND`, and one such answer settles it for the page: there is one installed app. Only
 * `NOT_FOUND` is learned from — a timeout or a transport error is transient. It is asked at the tap, not
 * when the menu opens, because the message itself opens the picker.
 */
export interface AttachmentPicker {
    /** What was picked, in pick order, or `null` when this shell has no picker. A cancel is an empty pick. */
    pick(input: { source: AttachmentPickSource; selectionLimit: number }): Promise<AttachmentPick | null>;
    /** The send's `prepareVideo` port: converts a picked video in the shell and makes its poster. */
    prepareVideo: runtime.data.PrepareVideoPort;
    /** Whether this shell is already known to have no picker. */
    isUnsupported(): boolean;
    /** Test seam — forgets the learned verdict. */
    reset(): void;
}

export interface AttachmentPick {
    items: ChatAttachmentSource[];
    /** What the shell would not copy, or could not hand over. Reported the way the page reports its own refusals. */
    refused: RefusedAttachment[];
}

/**
 * The picker stays open for as long as the person browses, and the answer waits for every copy: ten
 * videos are copied after the picker closes. The bound only has to outlast that, not to be tight.
 */
const PICK_TIMEOUT_MS = 30 * 60_000;

/** One prepared photo, the same bound as the grid's `ReadPhoto`. */
const READ_ATTACHMENT_TIMEOUT_MS = 2 * 60_000;

/** A 4K minute converts in tens of seconds on a phone; a few minutes of it in several. */
const PREPARE_VIDEO_TIMEOUT_MS = 10 * 60_000;

const isNotFound = (error: unknown): boolean => (error as { code?: string })?.code === 'NOT_FOUND';

const toShellFile = (item: PickedShellAttachment): ShellFileRef => {
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

class ShellAttachmentPicker implements AttachmentPicker {
    private unsupported = false;

    isUnsupported(): boolean {
        return this.unsupported || !isNative();
    }

    reset(): void {
        this.unsupported = false;
    }

    async pick({
        source,
        selectionLimit,
    }: {
        source: AttachmentPickSource;
        selectionLimit: number;
    }): Promise<AttachmentPick | null> {
        if (this.isUnsupported()) return null;
        try {
            const { data } = await webClient.request(
                {
                    type: 'PickAttachments',
                    data: { source, selectionLimit, maxBytes: { ...CHAT_ATTACHMENT_MAX_BYTES } },
                },
                { timeoutMs: PICK_TIMEOUT_MS }
            );
            const items: ChatAttachmentSource[] = [];
            const refused: RefusedAttachment[] = [...data.refused];
            // In pick order, and one at a time: at most one photo is ever on the bridge.
            for (const item of data.items) {
                if (item.kind !== 'image') {
                    items.push(toShellFile(item));
                    continue;
                }
                try {
                    const { data: photo } = await webClient.request(
                        { type: 'ReadAttachment', data: { uri: item.uri } },
                        { timeoutMs: READ_ATTACHMENT_TIMEOUT_MS }
                    );
                    items.push(base64ToFile(photo.base64, photo.fileName, photo.mimeType));
                } catch {
                    refused.push({ name: item.name, kind: 'image', reason: 'unreadable' });
                }
            }
            return { items, refused };
        } catch (error) {
            if (isNotFound(error)) {
                this.unsupported = true;
                return null;
            }
            throw error;
        }
    }

    prepareVideo: runtime.data.PrepareVideoPort = async video => {
        const { data } = await webClient.request(
            { type: 'PrepareVideo', data: { uri: video.uri } },
            { timeoutMs: PREPARE_VIDEO_TIMEOUT_MS }
        );
        const { file, poster } = data;
        return {
            file: { uri: file.uri, name: file.name, type: file.contentType, size: file.size, kind: 'video' },
            width: file.width,
            height: file.height,
            poster: poster
                ? {
                      // The poster is the video slot's thumbnail, so it carries the slot's kind.
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
