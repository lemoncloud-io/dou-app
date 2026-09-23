import type { ImageFit, UploadableType } from './types';

/**
 * What one compression pass does. Every field is required — there is no "just don't compress"
 * profile, so skipping compression has to be written out as an explicit, reviewable profile rather
 * than reached by leaving an option off.
 */
export interface CompressProfile {
    fit: ImageFit;
    /** Longest edge, or the square's edge under `'cover'`. */
    maxEdge: number;
    /** 0–1. Ignored for PNG, which has no lossy mode. */
    quality: number;
    type: UploadableType;
}

/**
 * A square avatar in a record field.
 *
 * `'cover'` upscales a smaller source on purpose: the caller asked for exactly 150×150, and a
 * letterboxed avatar is worse than a slightly soft one.
 */
export const AVATAR_PROFILE: CompressProfile = { fit: 'cover', maxEdge: 150, quality: 0.8, type: 'image/jpeg' };

/**
 * A photo carried inline as base64.
 *
 * The budget is the encoded size, not the pixel count: base64 costs about four bytes per three, so
 * how many fit in one payload is what bounds this. Callers with a tighter payload — the feedback
 * reporter runs at 1024/0.6 — pass their own.
 */
export const INLINE_PROFILE: CompressProfile = { fit: 'contain', maxEdge: 1024, quality: 0.8, type: 'image/jpeg' };

/**
 * The small copy that keeps a list from downloading full-size originals.
 *
 * 512 at 0.7 lands far under the 200KB the storage side budgets for that slot while staying legible
 * in a chat bubble. It is a starting point rather than a measured optimum — the right number
 * depends on whether this backs only list rows or the bubble preview too.
 */
export const THUMBNAIL_PROFILE: CompressProfile = { fit: 'contain', maxEdge: 512, quality: 0.7, type: 'image/jpeg' };

/**
 * A screenshot in a feedback report.
 *
 * Encoding budget, not a taste call. Images travel inline as base64, which costs ~4 bytes per 3, so
 * these two numbers are what bound the request: 1024px at q0.6 lands around 60–100 KB each, i.e.
 * well under a megabyte for a full set of five.
 */
export const REPORT_PROFILE: CompressProfile = { fit: 'contain', maxEdge: 1024, quality: 0.6, type: 'image/jpeg' };

/**
 * Re-encode at the source's own size — the profile for a format conversion that must not resize.
 *
 * HEIC has to become JPEG or the endpoint answers 415, and that is correctness rather than a size
 * budget, so the pixels are left alone.
 */
export const sameSizeProfile = (
    width: number,
    height: number,
    type: UploadableType,
    quality = 0.8
): CompressProfile => ({
    fit: 'contain',
    maxEdge: Math.max(width, height),
    quality,
    type,
});
