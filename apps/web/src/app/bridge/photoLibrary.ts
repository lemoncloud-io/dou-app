import { isNative } from '@chatic/bridges';
import type {
    KeepLibraryVideoErrorCode,
    OnListPhotoAlbumsPayload,
    OnListPhotosPayload,
    PhotoLibraryAccess,
    PhotoLibraryItem,
    PhotoLibraryMediaType,
} from '@chatic/app-messages';
import type { ShellFileRef } from '@chatic/data';

import { appBridge } from './appBridge';

/**
 * The device photo library, as the in-app picker reads it — or `null` everywhere the shell cannot
 * answer, which the picker takes as "use the page's own file input".
 *
 * The web ships ahead of the app, so this code runs inside app builds that have no handler for these
 * messages. Such a shell answers `NOT_FOUND`, and one such answer settles it for the rest of the
 * session: there is one installed app, so there is one answer. Only `NOT_FOUND` is learned from — a
 * timeout or a transport error is transient, and treating one as a permanent verdict would take the
 * picker away for a whole session over one slow round trip. The handshake's `supportedWebMessages`
 * is not consulted: it arrives asynchronously, and it is built from the app's compiled message map
 * rather than from the handlers actually registered. Same reasoning as `nativeUploadSource` and
 * `nativeBadgeReader`.
 *
 * Videos are asked for on every list, and one `NOT_FOUND` from `KeepLibraryVideo` stops that for the
 * session the same way. An app from before videos ignores the request and lists photos only, so asking
 * costs it nothing; an app that lists a video is one that can keep it — both arrived in the same build.
 * The learned verdict is for the app that lists videos and still cannot keep one, which no release
 * ships but a mismatched development build can.
 */
export interface PhotoLibrary {
    /** Albums, or null when this shell has no picker. */
    albums(): Promise<OnListPhotoAlbumsPayload | null>;
    /** One page, or null when this shell has no picker. */
    photos(input: { albumId?: string; after?: string; limit: number }): Promise<OnListPhotosPayload | null>;
    /** A picked photo as a `File`, ready for the send. */
    read(item: Pick<PhotoLibraryItem, 'id'>): Promise<File>;
    /**
     * A picked video, kept by the shell and ready for the send as a shell file. Rejects with the shell's
     * code (`KeepLibraryVideoErrorCode`), or `NOT_FOUND` on an app that cannot keep one — learned, so
     * `videosSupported` turns false and later lists leave videos out.
     */
    keepVideo(item: Pick<PhotoLibraryItem, 'id'>): Promise<ShellFileRef>;
    /** Whether lists still ask for videos — false once `keepVideo` met an app without it. */
    videosSupported(): boolean;
    /** Opens the iOS "choose more photos" sheet; resolves with the access afterwards. */
    manageSelection(): Promise<PhotoLibraryAccess | null>;
    /** Whether this shell is already known to have no picker. */
    isUnsupported(): boolean;
    /** Test seam — forgets the learned verdicts. */
    reset(): void;
}

/** Why a picked video was not kept: the shell's own codes, and `NOT_FOUND` from an app without it. */
export type KeepVideoErrorCode = KeepLibraryVideoErrorCode | 'NOT_FOUND';

const isNotFound = (error: unknown): boolean => (error as { code?: string })?.code === 'NOT_FOUND';

/** Decodes base64 into a File. `atob` is fine at photo sizes; the send prepares one file at a time. */
export const base64ToFile = (base64: string, fileName: string, mimeType: string): File => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], fileName, { type: mimeType });
};

/** A preview the picker can put straight into an `<img src>`. */
export const photoPreviewSrc = (thumbBase64: string): string => `data:image/jpeg;base64,${thumbBase64}`;

const MEDIA_TYPES_WITH_VIDEO: PhotoLibraryMediaType[] = ['image', 'video'];

class ShellPhotoLibrary implements PhotoLibrary {
    private unsupported = false;
    private videosUnsupported = false;

    isUnsupported(): boolean {
        return this.unsupported || !isNative();
    }

    videosSupported(): boolean {
        return !this.videosUnsupported;
    }

    reset(): void {
        this.unsupported = false;
        this.videosUnsupported = false;
    }

    /** What a list asks for: photos and videos, or the default (photos) once videos were learned out. */
    private mediaTypes(): { mediaTypes?: PhotoLibraryMediaType[] } {
        return this.videosUnsupported ? {} : { mediaTypes: MEDIA_TYPES_WITH_VIDEO };
    }

    /** Runs a request, learning from NOT_FOUND. Other failures surface to the caller. */
    private async ask<T>(request: () => Promise<{ data: T }>): Promise<T | null> {
        if (this.isUnsupported()) return null;
        try {
            const response = await request();
            return response.data;
        } catch (error) {
            if (isNotFound(error)) {
                this.unsupported = true;
                return null;
            }
            throw error;
        }
    }

    albums(): Promise<OnListPhotoAlbumsPayload | null> {
        return this.ask(() => appBridge.listPhotoAlbums(this.mediaTypes()));
    }

    async photos(input: { albumId?: string; after?: string; limit: number }): Promise<OnListPhotosPayload | null> {
        const page = await this.ask(() => appBridge.listPhotos({ ...input, ...this.mediaTypes() }));
        // Learned while the request was out: what it brought cannot be sent either.
        if (!page || !this.videosUnsupported) return page;
        return { ...page, items: page.items.filter(item => item.mediaType !== 'video') };
    }

    async read(item: Pick<PhotoLibraryItem, 'id'>): Promise<File> {
        const photo = await this.ask(() => appBridge.readPhoto(item.id));
        if (!photo) throw new Error('photo library unavailable');
        return base64ToFile(photo.base64, photo.fileName, photo.mimeType);
    }

    async keepVideo(item: Pick<PhotoLibraryItem, 'id'>): Promise<ShellFileRef> {
        if (this.isUnsupported() || this.videosUnsupported) {
            throw Object.assign(new Error('this app cannot keep a library video'), { code: 'NOT_FOUND' });
        }
        try {
            const { data } = await appBridge.keepLibraryVideo(item.id);
            return {
                uri: data.uri,
                name: data.name,
                type: data.contentType,
                size: data.size,
                kind: 'video',
                ...(data.needsExport ? { needsExport: true } : {}),
            };
        } catch (error) {
            if (isNotFound(error)) this.videosUnsupported = true;
            throw error;
        }
    }

    async manageSelection(): Promise<PhotoLibraryAccess | null> {
        const result = await this.ask(() => appBridge.managePhotoSelection());
        return result?.access ?? null;
    }
}

/** One per page: one installed app, one verdict. */
export const photoLibrary: PhotoLibrary = new ShellPhotoLibrary();
