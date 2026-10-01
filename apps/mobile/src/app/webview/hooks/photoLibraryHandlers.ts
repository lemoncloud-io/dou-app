import type { WebMessageData } from '@chatic/app-messages';
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

/**
 * Relays the in-app photo picker's messages to the native PhotoLibrary module. The library is read
 * natively on each request; nothing is cached here, so a photo taken while the grid is open shows up
 * on the next list.
 */
export const createPhotoLibraryHandlers = (photoLibrary: IPhotoLibraryBridge, logger: ILogService) => {
    const handleListPhotoAlbums = async () => {
        try {
            const data = await photoLibrary.listAlbums();
            return { type: 'OnListPhotoAlbums' as const, success: true, data };
        } catch (e) {
            const error = toError(e);
            logger.warn('DEVICE', `ListPhotoAlbums failed: ${error.code}`);
            return { type: 'OnListPhotoAlbums' as const, success: false, error };
        }
    };

    const handleListPhotos = async (message: WebMessageData<'ListPhotos'>) => {
        const { albumId, after, limit } = message.data ?? ({} as WebMessageData<'ListPhotos'>['data']);
        if (typeof limit !== 'number' || !Number.isFinite(limit)) {
            return {
                type: 'OnListPhotos' as const,
                success: false,
                error: { code: 'INVALID' as const, message: 'limit must be a number' },
            };
        }
        try {
            const data = await photoLibrary.listPhotos({ albumId, after, limit });
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

    return { handleListPhotoAlbums, handleListPhotos, handleReadPhoto, handleManagePhotoSelection };
};
