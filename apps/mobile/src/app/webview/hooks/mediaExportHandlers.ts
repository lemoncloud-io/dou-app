import type {
    MediaExportErrorCode,
    MediaExportPermissionDetails,
    WebMessageData,
    WebMessageHandlerResponse,
} from '@chatic/bridge-messages';
import type { IMediaExportBridge } from '../../bridge';
import type { ILogService } from '../../services';

export type StoragePermissionResult = 'granted' | 'denied' | 'never_ask_again';

export interface MediaExportPlatform {
    os: string;
    apiLevel: number;
    requestStoragePermission(): Promise<StoragePermissionResult>;
}

const SCOPED_STORAGE_API_LEVEL = 29;

const KNOWN_CODES: MediaExportErrorCode[] = [
    'PERMISSION_DENIED',
    'UNSUPPORTED_TYPE',
    'SOURCE',
    'INVALID',
    'INTERNAL',
    'NO_HANDLER',
];

type Failure = { code: MediaExportErrorCode; message: string; details?: MediaExportPermissionDetails };

const toFailure = (e: unknown): Failure => {
    const raw = (e as { code?: unknown })?.code;
    const code =
        typeof raw === 'string' && (KNOWN_CODES as string[]).includes(raw) ? (raw as MediaExportErrorCode) : 'INTERNAL';
    const message = (e as { message?: unknown })?.message
        ? String((e as { message: unknown }).message)
        : 'Unknown error';
    return code === 'PERMISSION_DENIED' ? { code, message, details: { canAskAgain: false } } : { code, message };
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const hasUri = (data: unknown): data is { uri: string } =>
    isNonEmptyString((data as { uri?: unknown } | undefined)?.uri);

export const createMediaExportHandlers = (
    mediaExport: IMediaExportBridge,
    platform: MediaExportPlatform,
    logger: ILogService
) => {
    const needsStoragePermission = () => platform.os === 'android' && platform.apiLevel < SCOPED_STORAGE_API_LEVEL;

    const askStoragePermission = async (): Promise<Failure | null> => {
        if (!needsStoragePermission()) return null;
        let result: StoragePermissionResult;
        try {
            result = await platform.requestStoragePermission();
        } catch (e) {
            return toFailure(e);
        }
        if (result === 'granted') return null;
        logger.info('MEDIA', `save refused: storage permission ${result}`);
        return {
            code: 'PERMISSION_DENIED',
            message: 'storage permission is not granted',
            details: { canAskAgain: result !== 'never_ask_again' },
        };
    };

    const handleSaveToPhotoLibrary = async (
        message: WebMessageData<'SaveToPhotoLibrary'>
    ): Promise<WebMessageHandlerResponse<'SaveToPhotoLibrary'>> => {
        const reply = (outcome: { data: { mimeType: string } } | { error: Failure }) =>
            'data' in outcome
                ? { type: 'OnSaveToPhotoLibrary' as const, success: true, data: outcome.data }
                : { type: 'OnSaveToPhotoLibrary' as const, success: false, error: outcome.error };

        if (!hasUri(message.data)) return reply({ error: { code: 'INVALID', message: 'uri is required' } });

        const refused = await askStoragePermission();
        if (refused) return reply({ error: refused });

        try {
            return reply({ data: await mediaExport.saveToPhotoLibrary(message.data.uri) });
        } catch (e) {
            const error = toFailure(e);
            logger.warn('MEDIA', `save failed: ${error.code}`);
            return reply({ error });
        }
    };

    const handleShareFile = async (
        message: WebMessageData<'ShareFile'>
    ): Promise<WebMessageHandlerResponse<'ShareFile'>> => {
        if (!hasUri(message.data)) {
            return {
                type: 'OnShareFile' as const,
                success: false,
                error: { code: 'INVALID', message: 'uri is required' },
            };
        }
        const title = typeof message.data.title === 'string' ? message.data.title : undefined;
        try {
            const data = await mediaExport.shareFile(message.data.uri, title);
            return { type: 'OnShareFile' as const, success: true, data };
        } catch (e) {
            const error = toFailure(e);
            logger.warn('MEDIA', `share failed: ${error.code}`);
            return { type: 'OnShareFile' as const, success: false, error };
        }
    };

    const handleOpenFile = async (
        message: WebMessageData<'OpenFile'>
    ): Promise<WebMessageHandlerResponse<'OpenFile'>> => {
        if (!hasUri(message.data)) {
            return {
                type: 'OnOpenFile' as const,
                success: false,
                error: { code: 'INVALID', message: 'uri is required' },
            };
        }
        try {
            const data = await mediaExport.openFile(message.data.uri);
            return { type: 'OnOpenFile' as const, success: true, data: data ?? {} };
        } catch (e) {
            const error = toFailure(e);
            logger.warn('MEDIA', `open failed: ${error.code}`);
            return { type: 'OnOpenFile' as const, success: false, error };
        }
    };

    const handleSaveFile = async (
        message: WebMessageData<'SaveFile'>
    ): Promise<WebMessageHandlerResponse<'SaveFile'>> => {
        const fail = (error: Failure) => ({ type: 'OnSaveFile' as const, success: false, error });

        if (!hasUri(message.data)) return fail({ code: 'INVALID', message: 'uri is required' });
        if (!isNonEmptyString(message.data.name)) return fail({ code: 'INVALID', message: 'name is required' });

        const refused = await askStoragePermission();
        if (refused) return fail(refused);

        try {
            const data = await mediaExport.saveFile(message.data.uri, message.data.name);
            return { type: 'OnSaveFile' as const, success: true, data };
        } catch (e) {
            const error = toFailure(e);
            logger.warn('MEDIA', `save file failed: ${error.code}`);
            return fail(error);
        }
    };

    return { handleSaveToPhotoLibrary, handleShareFile, handleOpenFile, handleSaveFile };
};
