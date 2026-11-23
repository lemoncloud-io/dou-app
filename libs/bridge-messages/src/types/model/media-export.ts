export type MediaExportErrorCode =
    | 'PERMISSION_DENIED'
    | 'UNSUPPORTED_TYPE'
    | 'SOURCE'
    | 'INVALID'
    | 'INTERNAL'
    | 'NO_HANDLER';

export type MediaExportPermissionDetails = {
    canAskAgain: boolean;
};

export type MediaExportImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

export type MediaExportMediaType = MediaExportImageType | 'video/mp4';

export type SaveToPhotoLibraryPayload = {
    uri: string;
};

export type OnSaveToPhotoLibraryPayload = {
    mimeType: MediaExportMediaType;
};

export type ShareFilePayload = {
    uri: string;
    title?: string;
};

export type OnShareFilePayload = {
    completed: boolean | null;
    activityType?: string;
};

export type OpenFilePayload = {
    uri: string;
};

export type OnOpenFilePayload = Record<string, never>;

export type SaveFilePayload = {
    uri: string;
    name: string;
};

export type OnSaveFilePayload =
    | {
          saved: true;
          location: string;
      }
    | { saved: false };
