/**
 * One image on a message or in the composer tray.
 *
 * The server has no image upload API yet, so nothing on the wire carries images: a
 * message's images come from `useChatImagesStore` (see there) and a tray item is a
 * local `File` behind an object URL. When the API lands, the reader in
 * `useChatImages` is the one place that has to learn the server field.
 */
export interface ChatImage {
    id: string;
    /** File name as the sender picked it — shown on a single image and in the viewer. */
    name: string;
    /** Displayable source: an object URL today, the uploaded file's URL later. */
    url: string;
    /** Still uploading — the tile blurs and spins instead of offering actions. */
    isUploading?: boolean;
}

/** The most images one message can carry (Figma "#max 10 images"). */
export const MAX_ATTACHMENTS = 10;

/** Tiles a message draws before the last one turns into a "+n" counter. */
export const MAX_VISIBLE_TILES = 4;

/** Raster types every Chromium build decodes. HEIC and friends are refused rather than shown broken. */
export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

export const isSupportedImage = (file: Pick<File, 'type'>): boolean =>
    (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type);

/**
 * Identity for "the same file twice". Name + size + mtime is what the OS picker hands
 * back for a re-pick of the same file; content hashing would cost a full read per drop.
 */
export const attachmentKey = (file: Pick<File, 'name' | 'size' | 'lastModified'>): string =>
    `${file.name}:${file.size}:${file.lastModified}`;

/** Why a file in a drop or pick was refused. */
export type AttachmentRejection = 'limit' | 'duplicate' | 'unsupported';

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
 * An unsupported type is refused outright, a file already in the tray (or twice in
 * this batch) is a duplicate, and whatever would push the tray past `MAX_ATTACHMENTS`
 * is over the limit. Accepted files keep their incoming order up to the limit, so a
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
        if (!isSupportedImage(file)) {
            reject('unsupported');
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
