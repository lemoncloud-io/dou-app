import type { ImageFit, UploadableType } from './types';

export interface CompressProfile {
    fit: ImageFit;
    maxEdge: number;
    quality: number;
    type: UploadableType;
}

export const AVATAR_PROFILE: CompressProfile = { fit: 'cover', maxEdge: 150, quality: 0.8, type: 'image/jpeg' };

export const INLINE_PROFILE: CompressProfile = { fit: 'contain', maxEdge: 1024, quality: 0.8, type: 'image/jpeg' };

export const THUMBNAIL_PROFILE: CompressProfile = { fit: 'contain', maxEdge: 512, quality: 0.7, type: 'image/jpeg' };

export const REPORT_PROFILE: CompressProfile = { fit: 'contain', maxEdge: 1024, quality: 0.6, type: 'image/jpeg' };

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
