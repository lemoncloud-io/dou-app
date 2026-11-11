import { isNative } from '@chatic/bridges';
import type {
    OnListPhotoAlbumsPayload,
    OnListPhotosPayload,
    PhotoLibraryAccess,
    PhotoLibraryItem,
    PhotoLibraryMediaType,
} from '@chatic/bridge-messages';
import type { ShellFileRef } from '@chatic/data';

import { appBridge } from './appBridge';

/**
 * The device photo library, as the in-app picker reads it — or `null` in a browser, which the picker
 * takes as "use the page's own file input".
 *
 * Every phone app this page runs in answers these messages, lists videos beside photos when asked
 * (`mediaTypes`), keeps a picked video, and pages by `offset`, echoing it. `thumbSize` sizes the
 * previews.
 */
export interface PhotoLibrary {
    /** Albums, or null in a browser. `thumbSize` sizes the covers. */
    albums(input?: { thumbSize?: number }): Promise<OnListPhotoAlbumsPayload | null>;
    /** One page, or null in a browser. */
    photos(input: PhotoPageRequest): Promise<OnListPhotosPayload | null>;
    /** A picked photo as a `File`, ready for the send. */
    read(item: Pick<PhotoLibraryItem, 'id'>): Promise<File>;
    /** A picked video, kept by the shell and ready for the send as a shell file. Rejects with the shell's code (`KeepLibraryVideoErrorCode`). */
    keepVideo(item: Pick<PhotoLibraryItem, 'id'>): Promise<ShellFileRef>;
    /** Opens the iOS "choose more photos" sheet; resolves with the access afterwards. */
    manageSelection(): Promise<PhotoLibraryAccess | null>;
    /** Whether there is no picker here — a browser. */
    isUnsupported(): boolean;
}

/** What a page is asked for by: a cursor (`after`) or a position (`offset`), and the preview size. */
export interface PhotoPageRequest {
    albumId?: string;
    after?: string;
    offset?: number;
    limit: number;
    thumbSize?: number;
}

/** Decodes base64 into a File. `atob` is fine at photo sizes; the send prepares one file at a time. */
export const base64ToFile = (base64: string, fileName: string, mimeType: string): File => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], fileName, { type: mimeType });
};

/** A preview the picker can put straight into an `<img src>`. */
export const photoPreviewSrc = (thumbBase64: string): string => `data:image/jpeg;base64,${thumbBase64}`;

/** The request without its unset fields, so the message carries only what was asked. */
const withoutUndefined = <T extends object>(input: T): T =>
    Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;

const MEDIA_TYPES: PhotoLibraryMediaType[] = ['image', 'video'];

class ShellPhotoLibrary implements PhotoLibrary {
    isUnsupported(): boolean {
        return !isNative();
    }

    /** Runs a request in the app; `null` in a browser. Failures surface to the caller. */
    private async ask<T>(request: () => Promise<{ data: T }>): Promise<T | null> {
        if (this.isUnsupported()) return null;
        const response = await request();
        return response.data;
    }

    albums(input: { thumbSize?: number } = {}): Promise<OnListPhotoAlbumsPayload | null> {
        return this.ask(() => appBridge.listPhotoAlbums({ ...withoutUndefined(input), mediaTypes: MEDIA_TYPES }));
    }

    photos(input: PhotoPageRequest): Promise<OnListPhotosPayload | null> {
        return this.ask(() => appBridge.listPhotos({ ...withoutUndefined(input), mediaTypes: MEDIA_TYPES }));
    }

    async read(item: Pick<PhotoLibraryItem, 'id'>): Promise<File> {
        const photo = await this.ask(() => appBridge.readPhoto(item.id));
        if (!photo) throw new Error('photo library unavailable');
        return base64ToFile(photo.base64, photo.fileName, photo.mimeType);
    }

    async keepVideo(item: Pick<PhotoLibraryItem, 'id'>): Promise<ShellFileRef> {
        if (this.isUnsupported()) throw new Error('photo library unavailable');
        const { data } = await appBridge.keepLibraryVideo(item.id);
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
        const result = await this.ask(() => appBridge.managePhotoSelection());
        return result?.access ?? null;
    }
}

/** One per page. */
export const photoLibrary: PhotoLibrary = new ShellPhotoLibrary();
