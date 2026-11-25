import type { ShellOrBrowser } from './ports';

export type PermissionStatus = 'GRANTED' | 'DENIED' | 'BLOCKED' | 'UNAVAILABLE';

export type AttachmentPickSource = 'media' | 'document';

export type AttachmentMaxBytes = {
    image: number;
    video: number;
    file: number;
};

export type AttachmentPickRequest = {
    source: AttachmentPickSource;
    selectionLimit: number;
    maxBytes: AttachmentMaxBytes;
};

export type PickedImageAttachment = {
    kind: 'image';
    uri: string;
    name: string;
    contentType: string;
    size: number;
    width: number;
    height: number;
};

export type PickedShellAttachment = {
    kind: 'video' | 'file';
    uri: string;
    name: string;
    contentType: string;
    size: number;
    needsExport?: boolean;
};

export type PickedAttachment = PickedImageAttachment | PickedShellAttachment;

export type AttachmentRefusalReason = 'too-large' | 'unsupported' | 'unreadable';

export type RefusedAttachment = {
    name: string;
    kind: 'image' | 'video' | 'file';
    reason: AttachmentRefusalReason;
};

export type PickedAttachments = {
    items: PickedAttachment[];
    refused: RefusedAttachment[];
};

export type AttachmentContent = {
    base64: string;
    mimeType: string;
    fileName: string;
    width: number;
    height: number;
};

export type PreparedVideo = {
    file: {
        uri: string;
        name: string;
        contentType: 'video/mp4';
        size: number;
        width: number;
        height: number;
    };
    poster: {
        uri: string;
        base64: string;
        contentType: 'image/jpeg';
        size: number;
        width: number;
        height: number;
    } | null;
};

export type PhotoLibraryAccess = 'granted' | 'limited' | 'denied';

export type PhotoLibraryMediaType = 'image' | 'video';

export type PhotoLibraryAlbum = {
    id: string;
    title: string;
    count: number;
    coverBase64?: string;
};

export type PhotoLibraryItem = {
    id: string;
    thumbBase64: string;
    width?: number;
    height?: number;
    mimeType?: string;
    mediaType?: PhotoLibraryMediaType;
    durationMs?: number;
};

export type PhotoAlbumsRequest = {
    mediaTypes?: PhotoLibraryMediaType[];
    thumbSize?: number;
};

export type PhotoAlbums = {
    access: PhotoLibraryAccess;
    albums: PhotoLibraryAlbum[];
};

export type PhotosRequest = {
    albumId?: string;
    after?: string;
    limit: number;
    mediaTypes?: PhotoLibraryMediaType[];
    thumbSize?: number;
    offset?: number;
};

export type PhotoPage = {
    access: PhotoLibraryAccess;
    items: PhotoLibraryItem[];
    next?: string;
    offset?: number;
    total?: number;
};

export type PhotoContent = {
    base64: string;
    mimeType: string;
    fileName: string;
    width?: number;
    height?: number;
};

export type PhotoSelection = {
    access: PhotoLibraryAccess;
};

export type KeptLibraryVideo = PickedShellAttachment;

export interface MediaPort {
    readonly kind: MediaMethod;
    readonly picker: AppAttachmentPicker | null;
    readonly photoLibrary: DevicePhotoLibrary | null;
    readonly videoConverter: VideoConverter | null;
    readonly cameraPermission: CameraPermission | null;
}

export type MediaMethod = ShellOrBrowser;

export interface AppAttachmentPicker {
    pick(input: AttachmentPickRequest): Promise<PickedAttachments>;
    read(uri: string): Promise<AttachmentContent>;
}

export interface DevicePhotoLibrary {
    albums(input: PhotoAlbumsRequest): Promise<PhotoAlbums>;
    photos(input: PhotosRequest): Promise<PhotoPage>;
    read(id: string): Promise<PhotoContent>;
    keepVideo(id: string): Promise<KeptLibraryVideo>;
    manageSelection(): Promise<PhotoSelection>;
}

export interface VideoConverter {
    prepare(uri: string): Promise<PreparedVideo>;
}

export interface CameraPermission {
    request(): Promise<PermissionStatus | null>;
}
