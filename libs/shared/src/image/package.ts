import type { UploadableType } from './types';

const EXTENSION_BY_TYPE: Record<UploadableType, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
};

export const encodeTypeFor = (sourceType: string): UploadableType =>
    sourceType === 'image/png' || sourceType === 'image/webp' ? sourceType : 'image/jpeg';

export const isUploadableType = (type: string): type is UploadableType => type in EXTENSION_BY_TYPE;

export const renameForType = (name: string, type: UploadableType, suffix = ''): string => {
    const base = name.replace(/\.[^./\\]+$/, '') || name;
    return `${base}${suffix}.${EXTENSION_BY_TYPE[type]}`;
};

export const toUploadFile = (blob: Blob, source: File, type: UploadableType, suffix = ''): File =>
    new File([blob], renameForType(source.name, type, suffix), { type, lastModified: source.lastModified });
