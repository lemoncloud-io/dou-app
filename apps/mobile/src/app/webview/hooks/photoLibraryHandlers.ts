import type {
    KeepLibraryVideoErrorCode,
    PhotoLibraryMediaType,
    WebMessageData,
    WebMessageHandlerResponse,
} from '@chatic/app-messages';
import type { IPhotoLibraryBridge } from '../../bridge';
import type { ILogService } from '../../services';

type PhotoLibraryErrorCode = 'PHOTO_MISSING' | 'READ_FAILED' | 'INVALID' | 'INTERNAL';

const KNOWN_CODES: readonly string[] = ['PHOTO_MISSING', 'READ_FAILED', 'INVALID', 'INTERNAL'];

/**
 * Anything the native side did not name is `INTERNAL`. That includes `NOT_FOUND`: the web takes that
 * code to mean "this app has no photo library" and falls back to its file input for the rest of the
 * session, so a single failed read must never be able to send it.
 */
const toError = (e: unknown): { code: PhotoLibraryErrorCode; message: string } => {
    const code = (e as { code?: unknown })?.code;
    const message = (e as { message?: unknown })?.message;
    return {
        code: typeof code === 'string' && KNOWN_CODES.includes(code) ? (code as PhotoLibraryErrorCode) : 'INTERNAL',
        message: message ? String(message) : 'Unknown error',
    };
};

const KEEP_VIDEO_CODES: readonly string[] = ['UNSUPPORTED', 'TOO_LARGE', 'PHOTO_MISSING', 'READ_FAILED', 'INVALID'];

const MEDIA_TYPES: readonly string[] = ['image', 'video'];

/**
 * The media types the web asked for, as a fresh array of the two known ones; `undefined` when it asked
 * for none it knows, which native reads as photos only. Nothing else the web put there reaches native
 * code.
 */
export const readMediaTypes = (value: unknown): PhotoLibraryMediaType[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const known = MEDIA_TYPES.filter(type => value.includes(type)) as PhotoLibraryMediaType[];
    return known.length > 0 ? known : undefined;
};

/**
 * Relays the in-app photo picker's messages to the native PhotoLibrary module. The library is read
 * natively on each request; nothing is cached here, so a photo taken while the grid is open shows up
 * on the next list.
 */
export const createPhotoLibraryHandlers = (photoLibrary: IPhotoLibraryBridge, logger: ILogService) => {
    const handleListPhotoAlbums = async (message?: WebMessageData<'ListPhotoAlbums'>) => {
        const mediaTypes = readMediaTypes(message?.data?.mediaTypes);
        try {
            const data = await photoLibrary.listAlbums(mediaTypes ? { mediaTypes } : {});
            return { type: 'OnListPhotoAlbums' as const, success: true, data };
        } catch (e) {
            const error = toError(e);
            logger.warn('DEVICE', `ListPhotoAlbums failed: ${error.code}`);
            return { type: 'OnListPhotoAlbums' as const, success: false, error };
        }
    };

    const handleListPhotos = async (message: WebMessageData<'ListPhotos'>) => {
        const {
            albumId,
            after,
            limit,
            mediaTypes: requested,
        } = message.data ?? ({} as WebMessageData<'ListPhotos'>['data']);
        const mediaTypes = readMediaTypes(requested);
        if (typeof limit !== 'number' || !Number.isFinite(limit)) {
            return {
                type: 'OnListPhotos' as const,
                success: false,
                error: { code: 'INVALID' as const, message: 'limit must be a number' },
            };
        }
        try {
            const data = await photoLibrary.listPhotos({
                albumId,
                after,
                limit,
                ...(mediaTypes ? { mediaTypes } : {}),
            });
            return { type: 'OnListPhotos' as const, success: true, data };
        } catch (e) {
            const error = toError(e);
            logger.warn('DEVICE', `ListPhotos failed: ${error.code}`);
            return { type: 'OnListPhotos' as const, success: false, error };
        }
    };

    const handleReadPhoto = async (message: WebMessageData<'ReadPhoto'>) => {
        const id = message.data?.id;
        if (typeof id !== 'string' || !id) {
            return {
                type: 'OnReadPhoto' as const,
                success: false,
                error: { code: 'INVALID' as const, message: 'id is required' },
            };
        }
        try {
            const data = await photoLibrary.readPhoto(id);
            return { type: 'OnReadPhoto' as const, success: true, data };
        } catch (e) {
            const error = toError(e);
            logger.warn('DEVICE', `ReadPhoto failed: ${error.code}`);
            return { type: 'OnReadPhoto' as const, success: false, error };
        }
    };

    const handleManagePhotoSelection = async () => {
        try {
            const access = await photoLibrary.manageSelection();
            return { type: 'OnManagePhotoSelection' as const, success: true, data: { access } };
        } catch (e) {
            const error = toError(e);
            logger.warn('DEVICE', `ManagePhotoSelection failed: ${error.code}`);
            return { type: 'OnManagePhotoSelection' as const, success: false, error };
        }
    };

    /**
     * Copies a library video into the shell's pick folder. A failure native did not name is a read that
     * failed — never `NOT_FOUND`, which would take videos out of the grid for the session.
     */
    const handleKeepLibraryVideo = async (
        message: WebMessageData<'KeepLibraryVideo'>
    ): Promise<WebMessageHandlerResponse<'KeepLibraryVideo'>> => {
        const id = message.data?.id;
        if (typeof id !== 'string' || !id) {
            return {
                type: 'OnKeepLibraryVideo' as const,
                success: false,
                error: { code: 'INVALID' as const, message: 'id is required' },
            };
        }
        try {
            const data = await photoLibrary.keepVideo(id);
            return { type: 'OnKeepLibraryVideo' as const, success: true, data };
        } catch (e) {
            const code = (e as { code?: unknown })?.code;
            const text = (e as { message?: unknown })?.message;
            const error = {
                code: (typeof code === 'string' && KEEP_VIDEO_CODES.includes(code)
                    ? code
                    : 'READ_FAILED') as KeepLibraryVideoErrorCode,
                message: text ? String(text) : 'Unknown error',
            };
            // The code only: the message can hold a local path.
            logger.warn('DEVICE', `KeepLibraryVideo failed: ${error.code}`);
            return { type: 'OnKeepLibraryVideo' as const, success: false, error };
        }
    };

    return {
        handleListPhotoAlbums,
        handleListPhotos,
        handleReadPhoto,
        handleManagePhotoSelection,
        handleKeepLibraryVideo,
    };
};
