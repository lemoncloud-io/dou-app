import { isNative, webClient } from '@chatic/bridges';
import type { AttachmentPickSource, PickedShellAttachment, RefusedAttachment } from '@chatic/app-messages';
import type { runtime } from '@chatic/app-runtime';
import {
    CHAT_ATTACHMENT_MAX_BYTES,
    chatAttachmentFormat,
    isShellFileRef,
    type ChatAttachmentSource,
    type ShellFileRef,
} from '@chatic/data';

import { base64ToFile } from './photoLibrary';

/**
 * The app's own picker for chat videos and documents, and its video conversion — or `null` from
 * `pick` in every shell that has neither, which the attach panel takes as "use the page's own input".
 *
 * Videos and documents stay in the shell: it copies what was picked into its own folder and answers
 * with addresses, which the upload then sends from there. Photos are kept there too, already prepared,
 * and their bytes are read one photo at a time (`ReadAttachment`), because the page prepares every
 * photo itself and ten photos in one answer would be hundreds of megabytes of base64. A photo that
 * cannot be read is refused alone, as `unreadable`; the pick resolves once every photo is read, so the
 * pending row appears with all of them, as it does for the photo grid.
 *
 * The documents picker offers every format the server takes, photos and MP4 included, and both shells
 * report all it returns as `file`, under the type the OS gave it. Its pick does not go out at once: it
 * waits above the composer for the send button, for as long as a caption takes. So a photo among it is
 * handed back as the shell's address, like a document, and costs the page no memory while it waits —
 * the hold judges it by its format and size all the same, so a photo over the photo limit is refused
 * before any of its bytes cross the bridge. `readPhotos` reads it at the send, the same way and under
 * the same rule as a photo from the album, so it is resized and given a thumbnail like any photo
 * instead of going up raw; both shells' `ReadAttachment` reads any picked file named as one of the four
 * photo formats. An MP4 needs nothing here: the send tells a video by its format, not by `kind`.
 *
 * The web ships ahead of the app, so this runs inside app builds that have no such picker. Such a shell
 * answers `NOT_FOUND`, and one such answer settles it for the page: there is one installed app. Only
 * `NOT_FOUND` is learned from — a timeout or a transport error is transient. It is asked at the tap, not
 * when the menu opens, because the message itself opens the picker.
 */
export interface AttachmentPicker {
    /** What was picked, in pick order, or `null` when this shell has no picker. A cancel is an empty pick. */
    pick(input: { source: AttachmentPickSource; selectionLimit: number }): Promise<AttachmentPick | null>;
    /**
     * Reads the photos among `items` that are still in the shell, one at a time, into page files, in
     * place; everything else — a page file, a video, a document — comes back as it was. A photo that
     * cannot be read is left out and refused, as `unreadable`.
     */
    readPhotos(items: ChatAttachmentSource[]): Promise<AttachmentPick>;
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

/**
 * The type a read photo is handed to the page under. A shell names it by its file's extension, and
 * Android answers `application/octet-stream` for one it cannot place — a document picked as `scan`,
 * with no extension, that the OS knows is a PNG. The pick's own type is then the better word.
 */
const photoType = (pickedType: string, readType: string): string =>
    readType === 'application/octet-stream' ? pickedType : readType;

/**
 * Whether a file the shell reported as a `file` is one of the server's photo formats, by its name or
 * type — what the documents picker returns a photo as.
 */
const isPhotoFormat = (name: string, type: string): boolean => chatAttachmentFormat({ name, type })?.kind === 'image';

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
            // In pick order, and one at a time: at most one photo is ever on the bridge. The album's pick
            // goes out at once, so its photos are read now; the documents pick waits above the composer,
            // so its photos stay in the shell, as addresses, until the send reads them (`readPhotos`).
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
        } catch (error) {
            if (isNotFound(error)) {
                this.unsupported = true;
                return null;
            }
            throw error;
        }
    }

    async readPhotos(items: ChatAttachmentSource[]): Promise<AttachmentPick> {
        const read: ChatAttachmentSource[] = [];
        const refused: RefusedAttachment[] = [];
        // In order, and one at a time: at most one photo is ever on the bridge.
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

    /** One picked photo's prepared bytes as a page file, or `null` when the shell cannot read it. */
    private async readPhoto(uri: string, pickedType: string): Promise<File | null> {
        try {
            const { data: photo } = await webClient.request(
                { type: 'ReadAttachment', data: { uri } },
                { timeoutMs: READ_ATTACHMENT_TIMEOUT_MS }
            );
            return base64ToFile(photo.base64, photo.fileName, photoType(pickedType, photo.mimeType));
        } catch {
            return null;
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
