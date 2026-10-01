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

const KNOWN_CODES: MediaExportErrorCode[] = ['PERMISSION_DENIED', 'UNSUPPORTED_TYPE', 'SOURCE', 'INVALID', 'INTERNAL'];

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

const hasUri = (data: unknown): data is { uri: string } =>
    typeof (data as { uri?: unknown } | undefined)?.uri === 'string' && (data as { uri: string }).uri.length > 0;

/**
 * Relays `SaveToPhotoLibrary` and `ShareFile` to the native MediaExport module.
 *
 * The one decision made here is the Android storage permission below API 29: asking needs an
 * Activity result, which React Native's `PermissionsAndroid` already handles, so it is asked here
 * before native is called rather than inside the native module. The prompt appears at the moment
 * of saving and nowhere else.
 */
export const createMediaExportHandlers = (
    mediaExport: IMediaExportBridge,
    platform: MediaExportPlatform,
    logger: ILogService
) => {
    const needsStoragePermission = () => platform.os === 'android' && platform.apiLevel < SCOPED_STORAGE_API_LEVEL;

    const handleSaveToPhotoLibrary = async (
        message: WebMessageData<'SaveToPhotoLibrary'>
    ): Promise<WebMessageHandlerResponse<'SaveToPhotoLibrary'>> => {
        const reply = (outcome: { data: { mimeType: string } } | { error: Failure }) =>
            'data' in outcome
                ? { type: 'OnSaveToPhotoLibrary' as const, success: true, data: outcome.data }
                : { type: 'OnSaveToPhotoLibrary' as const, success: false, error: outcome.error };

        if (!hasUri(message.data)) return reply({ error: { code: 'INVALID', message: 'uri is required' } });

        if (needsStoragePermission()) {
            let result: StoragePermissionResult;
            try {
                result = await platform.requestStoragePermission();
            } catch (e) {
                return reply({ error: toFailure(e) });
            }
            if (result !== 'granted') {
                logger.info('MEDIA', `save refused: storage permission ${result}`);
                return reply({
                    error: {
                        code: 'PERMISSION_DENIED',
                        message: 'storage permission is not granted',
                        details: { canAskAgain: result !== 'never_ask_again' },
                    },
                });
            }
        }

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

    return { handleSaveToPhotoLibrary, handleShareFile };
};
