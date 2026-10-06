import { NativeModules } from 'react-native';
import type {
    ListPhotoAlbumsPayload,
    ListPhotosPayload,
    OnKeepLibraryVideoPayload,
    OnListPhotoAlbumsPayload,
    OnListPhotosPayload,
    OnReadPhotoPayload,
    PhotoLibraryAccess,
} from '@chatic/app-messages';

/**
 * PhotoLibrary — the device photo library, read for the web's in-app picker (Swift `PhotoLibrary`
 * over PhotoKit, Kotlin `PhotoLibraryModule` over MediaStore).
 *
 * A build whose native side lacks the module — JS run over an older native build — has `isAvailable`
 * false, and the router then leaves the photo-library messages unregistered: the web gets
 * `NOT_FOUND`, which it already reads as "use the page's own file input". Answering every call with
 * an error instead would take that fallback away.
 *
 * Videos came later than the module, so they are judged by method (`keepLibraryVideo`), not by module:
 * a native build with the module but without the method lists photos only, takes `listAlbums` with no
 * argument, and leaves `KeepLibraryVideo` unregistered. `listAlbums` and `listPhotos` forward
 * `mediaTypes` only to a build that has the method — the same build that reads them.
 */
const { PhotoLibrary } = NativeModules;

const hasMethod = (name: string): boolean => typeof PhotoLibrary?.[name] === 'function';

export interface IPhotoLibraryBridge {
    /** Whether this build has the native module. */
    readonly isAvailable: boolean;
    /** Whether this build lists videos and can keep one (`keepLibraryVideo`). */
    readonly canKeepVideo: boolean;
    /** Albums, "all photos" first. Raises the permission prompt the first time. */
    listAlbums(request: ListPhotoAlbumsPayload): Promise<OnListPhotoAlbumsPayload>;
    /**
     * One page, newest first. Raises the permission prompt the first time — and on Android, the first
     * time videos are asked for by someone who granted photos only, the video prompt.
     */
    listPhotos(request: ListPhotosPayload): Promise<OnListPhotosPayload>;
    /**
     * Copies a library video into the shell's `attach-pick` folder and judges it there. Rejects with
     * `UNSUPPORTED`, `TOO_LARGE`, `PHOTO_MISSING`, `READ_FAILED` or `INVALID`.
     */
    keepVideo(id: string): Promise<OnKeepLibraryVideoPayload>;
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

/** The request without `mediaTypes` for a build that would not read it. */
const withoutMediaTypes = <T extends { mediaTypes?: unknown }>({ mediaTypes: _, ...rest }: T): Omit<T, 'mediaTypes'> =>
    rest;

export const PhotoLibraryBridge: IPhotoLibraryBridge = {
    isAvailable: !!PhotoLibrary,
    canKeepVideo: hasMethod('keepLibraryVideo'),
    // An older build's `listAlbums` takes no argument, and the bridge rejects a call with one.
    listAlbums: request =>
        !PhotoLibrary
            ? unavailable()
            : hasMethod('keepLibraryVideo')
              ? PhotoLibrary.listAlbums(request)
              : PhotoLibrary.listAlbums(),
    listPhotos: request =>
        PhotoLibrary
            ? PhotoLibrary.listPhotos(hasMethod('keepLibraryVideo') ? request : withoutMediaTypes(request))
            : unavailable(),
    keepVideo: id => (hasMethod('keepLibraryVideo') ? PhotoLibrary.keepLibraryVideo(id) : unavailable()),
    readPhoto: id => (PhotoLibrary ? PhotoLibrary.readPhoto(id) : unavailable()),
    manageSelection: () => (PhotoLibrary ? PhotoLibrary.manageSelection() : unavailable()),
};
