/**
 * What the composer accepts before anything is uploaded.
 *
 * These rules were written for the desktop tray (ADR-0082) and live here now because the mobile
 * composer needs the identical set: two copies would become two different maximum photo sizes, and
 * the one a user hits would depend on which app they opened.
 *
 * The size rule is the one addition. The server signs for far more than this, but its ceiling is an
 * abuse limit, not a comfortable size — the upload engine reads a file whole into memory to send
 * it, so the real constraint is the phone's heap, not the bucket.
 */

/** Raster types every supported browser decodes. HEIC and friends are refused rather than shown broken. */
export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

/** The most attachments one message can carry. */
export const MAX_ATTACHMENTS = 10;

/** Per-file ceiling. See the header: this is a memory budget, not the server's limit. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export type AttachmentCandidate = Pick<File, 'name' | 'size' | 'lastModified' | 'type'>;

export const isSupportedImage = (file: Pick<AttachmentCandidate, 'type'>): boolean =>
    (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type);

/**
 * Identity for "the same file twice". Name + size + mtime is what an OS picker hands back for a
 * re-pick of the same file; hashing the contents would cost a full read per drop.
 */
export const attachmentKey = (file: Pick<AttachmentCandidate, 'name' | 'size' | 'lastModified'>): string =>
    `${file.name}:${file.size}:${file.lastModified}`;

/** Why a pick was (partly) refused — each maps to one notice. */
export type AttachmentRejection = 'unsupported' | 'too-large' | 'duplicate' | 'limit';

export interface AttachmentValidation<T> {
    accepted: T[];
    /** The first refusal met, if any. One notice per pick — a stack of four reads as a crash. */
    rejection?: AttachmentRejection;
}

/**
 * Splits an incoming batch into what fits the tray and why the rest did not.
 *
 * Refusals are ordered by what they are about: the first two are properties of the file itself (its
 * type, its size), the last two are about the tray it is joining (already there, no room left). A
 * file that is both unsupported and huge reports `unsupported`, which is the more useful sentence.
 *
 * Accepted files keep their incoming order up to the limit, so a pick of twelve keeps the first ten.
 */
export const validateAttachments = <T extends AttachmentCandidate>(
    existingKeys: readonly string[],
    incoming: readonly T[]
): AttachmentValidation<T> => {
    const seen = new Set(existingKeys);
    const accepted: T[] = [];
    let rejection: AttachmentRejection | undefined;
    const reject = (reason: AttachmentRejection) => {
        rejection = rejection ?? reason;
    };

    for (const file of incoming) {
        if (!isSupportedImage(file)) {
            reject('unsupported');
            continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
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

    return { accepted, rejection };
};
