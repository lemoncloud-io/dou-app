import type {
    ListPhotoAlbumsPayload,
    ListPhotosPayload,
    OnKeepLibraryVideoPayload,
    OnListPhotoAlbumsPayload,
    OnListPhotosPayload,
    OnManagePhotoSelectionPayload,
    OnPickAttachmentsPayload,
    OnPrepareVideoPayload,
    OnReadAttachmentPayload,
    OnReadPhotoPayload,
    PermissionStatus,
    PickAttachmentsPayload,
} from '@chatic/bridge-messages';

import type { ShellOrBrowser } from './ports';

export interface MediaPort {
    readonly kind: MediaMethod;
    readonly picker: AppAttachmentPicker | null;
    readonly photoLibrary: DevicePhotoLibrary | null;
    readonly videoConverter: VideoConverter | null;
    readonly cameraPermission: CameraPermission | null;
}

export type MediaMethod = ShellOrBrowser;

export interface AppAttachmentPicker {
    pick(input: PickAttachmentsPayload): Promise<OnPickAttachmentsPayload>;
    read(uri: string): Promise<OnReadAttachmentPayload>;
}

export interface DevicePhotoLibrary {
    albums(input: ListPhotoAlbumsPayload): Promise<OnListPhotoAlbumsPayload>;
    photos(input: ListPhotosPayload): Promise<OnListPhotosPayload>;
    read(id: string): Promise<OnReadPhotoPayload>;
    keepVideo(id: string): Promise<OnKeepLibraryVideoPayload>;
    manageSelection(): Promise<OnManagePhotoSelectionPayload>;
}

export interface VideoConverter {
    prepare(uri: string): Promise<OnPrepareVideoPayload>;
}

export interface CameraPermission {
    request(): Promise<PermissionStatus | null>;
}
