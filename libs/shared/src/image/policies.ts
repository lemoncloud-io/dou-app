import { AVATAR_PROFILE, INLINE_PROFILE, REPORT_PROFILE, THUMBNAIL_PROFILE } from './profiles';
import type { ImageRequest } from './types';

/**
 * Named policies — what each kind of picked image is prepared into.
 *
 * A policy is a whole request: which outputs a use case needs, each with its form and its budget,
 * stated once. Before these existed the avatar spec was spelled out at seven call sites, so
 * changing that budget meant changing seven files and hoping none was missed.
 *
 * They are plain objects rather than a builder on purpose. There are three, not thirty, and a
 * constant is greppable: the answer to "where is the avatar budget" is one hit, with the reasoning
 * beside it. A one-off variation spreads and overrides.
 */

/**
 * A profile picture: channel, place, or the user's own.
 *
 * Square because the frame it renders into is square, and cropping rather than letterboxing because
 * an avatar with bars looks broken. That crop discards the edges, which is right here and wrong for
 * anything meant to be read — see `REPORT_PHOTO`. Goes into a record field as base64.
 */
export const AVATAR_IMAGE = { avatar: { as: 'dataUrl', profile: AVATAR_PROFILE } } as const satisfies ImageRequest;

/**
 * A screenshot attached to a feedback report.
 *
 * The whole frame survives — a crop would throw away the part the reporter meant to show.
 */
export const REPORT_PHOTO = { photo: { as: 'dataUrl', profile: REPORT_PROFILE } } as const satisfies ImageRequest;

/**
 * A photo sent in a chat: the sender's own bytes, plus a small copy.
 *
 * `original` has no profile, and that absence is the decision — object storage carries it, and
 * re-encoding would spend quality the sender chose. `thumbnail` is what keeps a list from
 * downloading originals, and it is what the composer shows while the message is being written, so
 * the preview costs no second decode.
 */
export const CHAT_ATTACHMENT = {
    original: { as: 'file' },
    thumbnail: { as: 'file', profile: THUMBNAIL_PROFILE, suffix: '-thumb' },
} as const satisfies ImageRequest;

/** The default inline budget, for a caller that needs a data URL but has no policy of its own. */
export const INLINE_IMAGE = { image: { as: 'dataUrl', profile: INLINE_PROFILE } } as const satisfies ImageRequest;
