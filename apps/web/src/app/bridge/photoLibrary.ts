import { isNative } from '@chatic/bridges';
import type {
    OnListPhotoAlbumsPayload,
    OnListPhotosPayload,
    PhotoLibraryAccess,
    PhotoLibraryItem,
} from '@chatic/app-messages';

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
 */
export interface PhotoLibrary {
    /** Albums, or null when this shell has no picker. */
    albums(): Promise<OnListPhotoAlbumsPayload | null>;
    /** One page, or null when this shell has no picker. */
    photos(input: { albumId?: string; after?: string; limit: number }): Promise<OnListPhotosPayload | null>;
    /** A picked photo as a `File`, ready for the send. */
    read(item: Pick<PhotoLibraryItem, 'id'>): Promise<File>;
    /** Opens the iOS "choose more photos" sheet; resolves with the access afterwards. */
    manageSelection(): Promise<PhotoLibraryAccess | null>;
    /** Whether this shell is already known to have no picker. */
    isUnsupported(): boolean;
    /** Test seam — forgets the learned verdict. */
    reset(): void;
}

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

class ShellPhotoLibrary implements PhotoLibrary {
    private unsupported = false;

    isUnsupported(): boolean {
        return this.unsupported || !isNative();
    }

    reset(): void {
        this.unsupported = false;
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
        return this.ask(() => appBridge.listPhotoAlbums());
    }

    photos(input: { albumId?: string; after?: string; limit: number }): Promise<OnListPhotosPayload | null> {
        return this.ask(() => appBridge.listPhotos(input));
    }

    async read(item: Pick<PhotoLibraryItem, 'id'>): Promise<File> {
        const photo = await this.ask(() => appBridge.readPhoto(item.id));
        if (!photo) throw new Error('photo library unavailable');
        return base64ToFile(photo.base64, photo.fileName, photo.mimeType);
    }

    async manageSelection(): Promise<PhotoLibraryAccess | null> {
        const result = await this.ask(() => appBridge.managePhotoSelection());
        return result?.access ?? null;
    }
}

/** One per page: one installed app, one verdict. */
export const photoLibrary: PhotoLibrary = new ShellPhotoLibrary();
