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
 *
 * Pages are asked for by `offset`, and the answer says whether that was understood: an app from before
 * offsets ignores the field and answers the first page, without echoing an `offset`. One such answer
 * settles it — `pagesByOffset` turns false and the picker pages by cursor for the rest of the session.
 * Asking costs that app nothing as long as the first request is offset 0, whose answer is the first
 * page either way; the picker asks for no other offset before it knows. `thumbSize` needs no verdict:
 * an app that ignores it answers its old, smaller previews, which still draw.
 */
export interface PhotoLibrary {
    /** Albums, or null when this shell has no picker. `thumbSize` sizes the covers. */
    albums(input?: { thumbSize?: number }): Promise<OnListPhotoAlbumsPayload | null>;
    /**
     * One page, or null when this shell has no picker. With `offset`, a page whose answer echoes no
     * `offset` came from an app that pages by cursor only, and `pagesByOffset` turns false.
     */
    photos(input: PhotoPageRequest): Promise<OnListPhotosPayload | null>;
    /** Whether pages may be asked for by offset — false once an app answered one without echoing it. */
    pagesByOffset(): boolean;
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

/** What a page is asked for by: a cursor (`after`) or a position (`offset`), and the preview size. */
export interface PhotoPageRequest {
    albumId?: string;
    after?: string;
    offset?: number;
    limit: number;
    thumbSize?: number;
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

/** The request without its unset fields, so the message carries only what was asked. */
const withoutUndefined = <T extends object>(input: T): T =>
    Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;

const MEDIA_TYPES_WITH_VIDEO: PhotoLibraryMediaType[] = ['image', 'video'];

class ShellPhotoLibrary implements PhotoLibrary {
    private unsupported = false;
    private videosUnsupported = false;
    private offsetUnsupported = false;

    isUnsupported(): boolean {
        return this.unsupported || !isNative();
    }

    videosSupported(): boolean {
        return !this.videosUnsupported;
    }

    pagesByOffset(): boolean {
        return !this.offsetUnsupported;
    }

    reset(): void {
        this.unsupported = false;
        this.videosUnsupported = false;
        this.offsetUnsupported = false;
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

    albums(input: { thumbSize?: number } = {}): Promise<OnListPhotoAlbumsPayload | null> {
        return this.ask(() => appBridge.listPhotoAlbums({ ...withoutUndefined(input), ...this.mediaTypes() }));
    }

    async photos(input: PhotoPageRequest): Promise<OnListPhotosPayload | null> {
        const page = await this.ask(() => appBridge.listPhotos({ ...withoutUndefined(input), ...this.mediaTypes() }));
        // A denied answer is empty on every app and says nothing about offsets.
        if (page && page.access !== 'denied' && input.offset !== undefined && page.offset === undefined) {
            this.offsetUnsupported = true;
        }
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
