import { NativeModules } from 'react-native';
import type {
    ListPhotosPayload,
    OnListPhotoAlbumsPayload,
    OnListPhotosPayload,
    OnReadPhotoPayload,
    PhotoLibraryAccess,
} from '@chatic/app-messages';

/**
 * PhotoLibrary — the device photo library, read for the web's in-app picker (Swift `PhotoLibrary`).
 *
 * iOS only for now. Android has no module yet, so `isAvailable` is false there and the router leaves
 * the photo-library messages unregistered: the web then gets `NOT_FOUND`, which it already reads as
 * "use the page's own file input". A module that answered with an error instead would take that
 * fallback away.
 */
const { PhotoLibrary } = NativeModules;

export interface IPhotoLibraryBridge {
    /** Whether this build has the native module. */
    readonly isAvailable: boolean;
    /** Albums, "all photos" first. Raises the permission prompt the first time. */
    listAlbums(): Promise<OnListPhotoAlbumsPayload>;
    /** One page, newest first. Raises the permission prompt the first time. */
    listPhotos(request: ListPhotosPayload): Promise<OnListPhotosPayload>;
    /**
     * A picked photo in a form the server takes, without its location. Rejects with `PHOTO_MISSING`,
     * `READ_FAILED`, `INVALID` or `INTERNAL`.
     */
    readPhoto(id: string): Promise<OnReadPhotoPayload>;
    /** iOS limited access: the "select more photos" sheet; resolves with the access after it closes. */
    manageSelection(): Promise<PhotoLibraryAccess>;
}

const unavailable = (): Promise<never> =>
    Promise.reject(Object.assign(new Error('PhotoLibrary native module is not available'), { code: 'INTERNAL' }));

export const PhotoLibraryBridge: IPhotoLibraryBridge = {
    isAvailable: !!PhotoLibrary,
    listAlbums: () => (PhotoLibrary ? PhotoLibrary.listAlbums() : unavailable()),
    listPhotos: request => (PhotoLibrary ? PhotoLibrary.listPhotos(request) : unavailable()),
    readPhoto: id => (PhotoLibrary ? PhotoLibrary.readPhoto(id) : unavailable()),
    manageSelection: () => (PhotoLibrary ? PhotoLibrary.manageSelection() : unavailable()),
};
