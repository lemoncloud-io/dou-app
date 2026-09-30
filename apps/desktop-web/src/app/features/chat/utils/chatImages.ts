import { CHAT_ATTACHMENT_MAX_BYTES, chatAttachmentFormat, isPendingUploadSlot, type DomainChat } from '@chatic/data';

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

/**
 * A message's images from its `upload$$`. The server keeps no file name (the tiles are a fixed size),
 * so each image is named by its place in the message.
 *
 * A pending slot shows its local preview, spinning while it is sent. A server upload shows its
 * thumbnail and opens its original; one the server marks failed or reports with an error has nothing
 * to load, and one with no address yet (the read-back has not landed) is still on its way. The
 * addresses are signed and short-lived: shown, never kept.
 */
export const toChatImages = (messageId: string, slots: DomainChat['upload$$']): ChatImage[] =>
    (slots ?? []).map((slot, index): ChatImage => {
        const name = `image-${index + 1}`;
        if (isPendingUploadSlot(slot)) {
            return {
                id: `${messageId}:${index}`,
                name,
                url: slot.localThumbUrl,
                isUploading: slot.localStatus === 'sending',
                isFailed: slot.localStatus === 'failed',
            };
        }
        const id = slot.id ?? `${messageId}:${index}`;
        if (slot.status === 'failed' || slot.error) return { id, name, url: '', isFailed: true };
        if (!slot.orgUrl) return { id, name, url: '', isUploading: true };
        if (!isSafeImageUrl(slot.orgUrl)) return { id, name, url: '', isFailed: true };
        const thumbUrl = slot.thumbUrl && isSafeImageUrl(slot.thumbUrl) ? slot.thumbUrl : undefined;
        return { id, name, url: slot.orgUrl, ...(thumbUrl ? { thumbUrl } : {}) };
    });

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
export type AttachmentRejection = 'limit' | 'duplicate' | 'unsupported' | 'too-large';

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
 * kind's size limit (the server would refuse it only after the whole transfer). A file
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
