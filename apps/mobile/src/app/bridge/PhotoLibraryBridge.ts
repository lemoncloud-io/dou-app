import { NativeModules } from 'react-native';
import type {
    ListPhotoAlbumsPayload,
    ListPhotosPayload,
    OnKeepLibraryVideoPayload,
    OnListPhotoAlbumsPayload,
    OnListPhotosPayload,
    OnReadPhotoPayload,
    PhotoLibraryAccess,
} from '@chatic/bridge-messages';

const { PhotoLibrary } = NativeModules;

const hasMethod = (name: string): boolean => typeof PhotoLibrary?.[name] === 'function';

export interface IPhotoLibraryBridge {
    readonly isAvailable: boolean;
    readonly canKeepVideo: boolean;
    listAlbums(request: ListPhotoAlbumsPayload): Promise<OnListPhotoAlbumsPayload>;
    listPhotos(request: ListPhotosPayload): Promise<OnListPhotosPayload>;
    keepVideo(id: string): Promise<OnKeepLibraryVideoPayload>;
    readPhoto(id: string): Promise<OnReadPhotoPayload>;
    manageSelection(): Promise<PhotoLibraryAccess>;
}

const unavailable = (): Promise<never> =>
    Promise.reject(Object.assign(new Error('PhotoLibrary native module is not available'), { code: 'INTERNAL' }));

const withoutMediaTypes = <T extends { mediaTypes?: unknown }>({ mediaTypes: _, ...rest }: T): Omit<T, 'mediaTypes'> =>
    rest;

export const PhotoLibraryBridge: IPhotoLibraryBridge = {
    isAvailable: !!PhotoLibrary,
    canKeepVideo: hasMethod('keepLibraryVideo'),
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
