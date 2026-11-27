import { AVATAR_PROFILE, REPORT_PROFILE, THUMBNAIL_PROFILE } from './profiles';
import type { ImageRequest } from './types';

export const AVATAR_IMAGE = { avatar: { as: 'dataUrl', profile: AVATAR_PROFILE } } as const satisfies ImageRequest;

export const REPORT_PHOTO = { photo: { as: 'dataUrl', profile: REPORT_PROFILE } } as const satisfies ImageRequest;

export const CHAT_ATTACHMENT = {
    original: { as: 'file' },
    thumbnail: { as: 'file', profile: THUMBNAIL_PROFILE, suffix: '-thumb' },
} as const satisfies ImageRequest;
