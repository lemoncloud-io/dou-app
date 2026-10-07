import {
    CHAT_ATTACHMENT_MAX_BYTES,
    chatAttachmentFormat,
    isChatAttachmentNameTooLong,
    isPendingUploadSlot,
    uploadSlotKind,
    type DomainChat,
} from '@chatic/data';

/**
 * One image on a message or in the composer tray.
 *
 * A message's images come from its `upload$$` (`toChatImages` below): the local previews while it is
 * being sent, the server's signed addresses once it is. A tray item is a local `File` behind an object
 * URL. `useChatImages` is the one reader of a message's images.
 */
export interface ChatImage {
    id: string;
    /** File name as the sender picked it — shown on a single image and in the viewer. */
    name: string;
    /** The full image: an object URL for a local file, the signed original for a sent one. Empty when there is none to load. */
    url: string;
    /** A smaller image for the feed tile, when the server made one. The viewer always opens `url`. */
    thumbUrl?: string;
    /** Still uploading — the tile blurs and spins instead of offering actions. */
    isUploading?: boolean;
    /** Will not load: the send failed, or the server reports the upload as failed or gone. */
    isFailed?: boolean;
}

/**
 * Where an image may be loaded from: a signed storage address (`https:`), or a page-local one
 * (`blob:`, `data:image/`). A message's addresses come from the server and other members, so an
 * `http:`, `file:` or `javascript:` one is treated as an image with nothing to load.
 */
export const isSafeImageUrl = (url: string): boolean =>
    url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:image/');

/** An unsent image message: its `upload$$` still holds local slots, sending or failed. */
export const isUnsentImageMessage = (message: Pick<DomainChat, 'upload$$'>): boolean =>
    !!message.upload$$?.some(isPendingUploadSlot);

/** An image message whose upload is still running — a long one is not stuck, however long it takes. */
export const isSendingImages = (message: Pick<DomainChat, 'upload$$'>): boolean =>
    !!message.upload$$?.some(slot => isPendingUploadSlot(slot) && slot.localStatus === 'sending');

/** A video or document on a message: played in place or saved, never drawn as a tile. */
export interface ChatFile {
    id: string;
    kind: 'video' | 'file';
    /** The name to show and to save under. Absent on an upload sent before the server kept names. */
    name?: string;
    size?: number;
    /** The content type it was sent as, when known. The viewer reads it to pick how to draw the file. */
    contentType?: string;
    /** The signed original. Empty while sending, when failed, or when the address is not one to load. */
    url: string;
    isUploading?: boolean;
    isFailed?: boolean;
}

type Slot = NonNullable<DomainChat['upload$$']>[number];

// `audio` is not sent from here; it is saved like a document.
const slotKind = (slot: Slot): 'image' | 'video' | 'file' => {
    const kind = uploadSlotKind(slot);
    return kind === 'audio' ? 'file' : kind;
};

/** Where a video or document may be loaded from: a signed storage address only. */
const isSafeFileUrl = (url: string): boolean => url.startsWith('https://');

/**
 * A message's videos and documents from its `upload$$`, in order. The addresses are signed and
 * short-lived: shown, never kept.
 */
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

/**
 * A message's images from its `upload$$` — its videos and documents are `toChatFiles`'. Each image is
 * named by the name the server kept for it; one sent before names were kept, or still being sent, by
 * its place in the message.
 *
 * A pending slot shows its local preview, spinning while it is sent. A server upload shows its
 * thumbnail and opens its original; one the server marks failed or reports with an error has nothing
 * to load, and one with no address yet (the read-back has not landed) is still on its way. The
 * addresses are signed and short-lived: shown, never kept.
 */
export const toChatImages = (messageId: string, slots: DomainChat['upload$$']): ChatImage[] => {
    const images: ChatImage[] = [];
    (slots ?? []).forEach((slot, index) => {
        if (slotKind(slot) === 'image') images.push(toChatImage(messageId, slot, index, images.length + 1));
    });
    return images;
};

/** `index` is the slot's place in `upload$$` (its id); `position` its place among the images (its fallback name). */
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

/** The most images one message can carry (Figma "#max 10 images"). */
export const MAX_ATTACHMENTS = 10;

/** Tiles a message draws before the last one turns into a "+n" counter. */
export const MAX_VISIBLE_TILES = 4;

/** A size as a person reads it: "820 B", "1.5 KB", "12.3 MB". */
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

/**
 * Identity for "the same file twice". Name + size + mtime is what the OS picker hands
 * back for a re-pick of the same file; content hashing would cost a full read per drop.
 */
export const attachmentKey = (file: Pick<File, 'name' | 'size' | 'lastModified'>): string =>
    `${file.name}:${file.size}:${file.lastModified}`;

/** Why a file in a drop or pick was refused. */
export type AttachmentRejection = 'limit' | 'duplicate' | 'unsupported' | 'too-large' | 'name-too-long';

/** How many files each reason refused; a reason that refused nothing is absent. */
export type AttachmentRejections = Partial<Record<AttachmentRejection, number>>;

export interface AttachmentValidation<T> {
    accepted: T[];
    /**
     * Every refusal, counted. Only the first used to be kept, so a drop of nine into a
     * tray of two said "up to 10" and never that one of the nine was left out.
     */
    rejected: AttachmentRejections;
}

/**
 * Splits an incoming batch into what fits the tray and why the rest did not.
 *
 * A format the server does not take is refused outright, and so is a file over its
 * kind's size limit (the server would refuse it only after the whole transfer), and so is a
 * name over the server's byte limit, measured as it will be sent. A file
 * already in the tray (or twice in this batch) is a duplicate, and whatever would push
 * the tray past `MAX_ATTACHMENTS` is over the limit. Accepted files keep their incoming order up to the limit, so a
 * drop of twelve keeps the first ten.
 */
export const validateAttachments = <T extends Pick<File, 'name' | 'size' | 'lastModified' | 'type'>>(
    existingKeys: readonly string[],
    incoming: readonly T[]
): AttachmentValidation<T> => {
    const seen = new Set(existingKeys);
    const accepted: T[] = [];
    const rejected: AttachmentRejections = {};
    const reject = (reason: AttachmentRejection) => {
        rejected[reason] = (rejected[reason] ?? 0) + 1;
    };
    for (const file of incoming) {
        const format = chatAttachmentFormat(file);
        if (!format) {
            reject('unsupported');
            continue;
        }
        if (file.size > CHAT_ATTACHMENT_MAX_BYTES[format.kind]) {
            reject('too-large');
            continue;
        }
        if (isChatAttachmentNameTooLong(format.name)) {
            reject('name-too-long');
            continue;
        }
        const key = attachmentKey(file);
        if (seen.has(key)) {
            reject('duplicate');
            continue;
        }
        if (seen.size >= MAX_ATTACHMENTS) {
            reject('limit');
            continue;
        }
        seen.add(key);
        accepted.push(file);
    }
    return { accepted, rejected };
};

export interface ImageGridLayout {
    /** The tiles to draw, at most `MAX_VISIBLE_TILES`. */
    tiles: ChatImage[];
    /** Images past the last drawn tile — the "+n" on it; 0 when all fit. */
    overflow: number;
}

/**
 * The feed's grid: every image when four or fewer, otherwise the first four with the
 * last one counting the rest ("show 4, then +n").
 */
export const layoutImageGrid = (images: readonly ChatImage[]): ImageGridLayout => {
    if (images.length <= MAX_VISIBLE_TILES) return { tiles: [...images], overflow: 0 };
    return { tiles: images.slice(0, MAX_VISIBLE_TILES), overflow: images.length - MAX_VISIBLE_TILES };
};
