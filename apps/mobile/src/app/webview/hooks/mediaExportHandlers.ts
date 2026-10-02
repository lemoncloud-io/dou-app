import type {
    MediaExportErrorCode,
    MediaExportPermissionDetails,
    WebMessageData,
    WebMessageHandlerResponse,
} from '@chatic/app-messages';
import type { IMediaExportBridge } from '../../bridge';
import type { ILogService } from '../../services';

/** The outcome of an Android runtime permission request, as `PermissionsAndroid.request` reports it. */
export type StoragePermissionResult = 'granted' | 'denied' | 'never_ask_again';

export interface MediaExportPlatform {
    os: string;
    /** Android API level; ignored elsewhere. */
    apiLevel: number;
    /** Asks for `WRITE_EXTERNAL_STORAGE`. Only called on Android below API 29. */
    requestStoragePermission(): Promise<StoragePermissionResult>;
}

/** API 29 is where an app may add its own images to the shared collection without a permission. */
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

/**
 * A native rejection carries a media export code; anything else (a missing module, a thrown
 * programming error) is reported as INTERNAL so the web always gets a code it knows.
 *
 * A `PERMISSION_DENIED` from native is final: iOS asks once and after a refusal only the Settings
 * app can grant access, and on Android the prompt has already been answered in JS by then.
 */
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

/**
 * Relays `SaveToPhotoLibrary`, `ShareFile`, `OpenFile` and `SaveFile` to the native MediaExport module.
 *
 * The one decision made here is the Android storage permission below API 29, for both saves: asking
 * needs an Activity result, which React Native's `PermissionsAndroid` already handles, so it is asked
 * here before native is called rather than inside the native module. The prompt appears at the
 * moment of saving and nowhere else.
 *
 * None of these calls has a timeout here. `ShareFile`, `OpenFile` and `SaveFile` on iOS answer when
 * the sheet or preview closes, which is up to the person; the web gives each request its own wait.
 */
export const createMediaExportHandlers = (
    mediaExport: IMediaExportBridge,
    platform: MediaExportPlatform,
    logger: ILogService
) => {
    const needsStoragePermission = () => platform.os === 'android' && platform.apiLevel < SCOPED_STORAGE_API_LEVEL;

    /** Asks for the storage permission where a save needs it; the failure to answer with, if refused. */
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
            // The code only: the message can hold a local path.
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
        // The extension and path separators are the native side's to judge; only presence is checked here.
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
