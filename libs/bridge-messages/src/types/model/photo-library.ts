import type { PickedShellAttachment } from './attachment-picker';

export type PhotoLibraryAccess = 'granted' | 'limited' | 'denied';

export type PhotoLibraryAlbum = {
    id: string;
    title: string;
    count: number;
    coverBase64?: string;
};

export type PhotoLibraryMediaType = 'image' | 'video';

export type PhotoLibraryItem = {
    id: string;
    thumbBase64: string;
    width?: number;
    height?: number;
    mimeType?: string;
    mediaType?: PhotoLibraryMediaType;
    durationMs?: number;
};

export type ListPhotoAlbumsPayload = {
    mediaTypes?: PhotoLibraryMediaType[];
    thumbSize?: number;
};

export type OnListPhotoAlbumsPayload = {
    access: PhotoLibraryAccess;
    albums: PhotoLibraryAlbum[];
};

export type ListPhotosPayload = {
    albumId?: string;
    after?: string;
    limit: number;
    mediaTypes?: PhotoLibraryMediaType[];
    thumbSize?: number;
    offset?: number;
};

export type OnListPhotosPayload = {
    access: PhotoLibraryAccess;
    items: PhotoLibraryItem[];
    next?: string;
    offset?: number;
    total?: number;
};

export type ReadPhotoPayload = {
    id: string;
};

export type OnReadPhotoPayload = {
    base64: string;
    mimeType: string;
    fileName: string;
    width?: number;
    height?: number;
};

export type ManagePhotoSelectionPayload = {};

export type OnManagePhotoSelectionPayload = {
    access: PhotoLibraryAccess;
};

export type KeepLibraryVideoPayload = {
    id: string;
};

export type OnKeepLibraryVideoPayload = PickedShellAttachment;

export type KeepLibraryVideoErrorCode = 'UNSUPPORTED' | 'TOO_LARGE' | 'PHOTO_MISSING' | 'READ_FAILED' | 'INVALID';
