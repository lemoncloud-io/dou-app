import { runtime, type ShellFileRef } from '@chatic/runtime';
import type {
    OnListPhotoAlbumsPayload,
    OnListPhotosPayload,
    PhotoLibraryAccess,
    PhotoLibraryItem,
    PhotoLibraryMediaType,
} from '@chatic/bridge-messages';

export interface PhotoLibrary {
    albums(input?: { thumbSize?: number }): Promise<OnListPhotoAlbumsPayload | null>;
    photos(input: PhotoPageRequest): Promise<OnListPhotosPayload | null>;
    read(item: Pick<PhotoLibraryItem, 'id'>): Promise<File>;
    keepVideo(item: Pick<PhotoLibraryItem, 'id'>): Promise<ShellFileRef>;
    manageSelection(): Promise<PhotoLibraryAccess | null>;
    isUnsupported(): boolean;
}

export interface PhotoPageRequest {
    albumId?: string;
    after?: string;
    offset?: number;
    limit: number;
    thumbSize?: number;
}

export const base64ToFile = (base64: string, fileName: string, mimeType: string): File => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], fileName, { type: mimeType });
};

export const photoPreviewSrc = (thumbBase64: string): string => `data:image/jpeg;base64,${thumbBase64}`;

const withoutUndefined = <T extends object>(input: T): T =>
    Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;

const MEDIA_TYPES: PhotoLibraryMediaType[] = ['image', 'video'];

type HostPhotoLibrary = NonNullable<typeof runtime.media.photoLibrary>;

class ShellPhotoLibrary implements PhotoLibrary {
    isUnsupported(): boolean {
        return runtime.media.photoLibrary === null;
    }

    private async ask<T>(request: (library: HostPhotoLibrary) => Promise<T>): Promise<T | null> {
        const library = runtime.media.photoLibrary;
        if (!library) return null;
        return request(library);
    }

    albums(input: { thumbSize?: number } = {}): Promise<OnListPhotoAlbumsPayload | null> {
        return this.ask(library => library.albums({ ...withoutUndefined(input), mediaTypes: MEDIA_TYPES }));
    }

    photos(input: PhotoPageRequest): Promise<OnListPhotosPayload | null> {
        return this.ask(library => library.photos({ ...withoutUndefined(input), mediaTypes: MEDIA_TYPES }));
    }

    async read(item: Pick<PhotoLibraryItem, 'id'>): Promise<File> {
        const photo = await this.ask(library => library.read(item.id));
        if (!photo) throw new Error('photo library unavailable');
        return base64ToFile(photo.base64, photo.fileName, photo.mimeType);
    }

    async keepVideo(item: Pick<PhotoLibraryItem, 'id'>): Promise<ShellFileRef> {
        const data = await this.ask(library => library.keepVideo(item.id));
        if (!data) throw new Error('photo library unavailable');
        return {
            uri: data.uri,
            name: data.name,
            type: data.contentType,
            size: data.size,
            kind: 'video',
            ...(data.needsExport ? { needsExport: true } : {}),
        };
    }

    async manageSelection(): Promise<PhotoLibraryAccess | null> {
        const result = await this.ask(library => library.manageSelection());
        return result?.access ?? null;
    }
}

export const photoLibrary: PhotoLibrary = new ShellPhotoLibrary();
