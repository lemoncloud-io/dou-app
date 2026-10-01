import type {
    AttachmentMaxBytes,
    AttachmentPickSource,
    PickAttachmentsErrorCode,
    PrepareVideoErrorCode,
    ReadAttachmentErrorCode,
    WebMessageData,
    WebMessageHandlerResponse,
} from '@chatic/app-messages';
import type { IAttachmentPickerBridge } from '../../bridge';
import type { ILogService } from '../../services';

const PICK_CODES: readonly string[] = ['BUSY', 'INVALID', 'INTERNAL'];
const PREPARE_CODES: readonly string[] = ['TOO_LARGE', 'UNSUPPORTED', 'SOURCE', 'SYSTEM', 'INVALID'];
const READ_CODES: readonly string[] = ['INVALID', 'SOURCE', 'INTERNAL'];

const SOURCES: readonly string[] = ['media', 'document'];

/**
 * A native rejection keeps its code when it is one the message defines; anything else becomes the
 * message's catch-all. That includes `NOT_FOUND`: the web takes it to mean "this app has no picker"
 * and opens its own file input for the rest of the page's life, so one failed pick must never send it.
 */
const toError = <C extends string>(e: unknown, known: readonly string[], fallback: C): { code: C; message: string } => {
    const code = (e as { code?: unknown })?.code;
    const message = (e as { message?: unknown })?.message;
    return {
        code: typeof code === 'string' && known.includes(code) ? (code as C) : fallback,
        message: message ? String(message) : 'Unknown error',
    };
};

const isPositiveNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

/** The three ceilings, copied so nothing else the web put in the object reaches native code. */
const readMaxBytes = (value: unknown): AttachmentMaxBytes | null => {
    const { image, video, file } = (value ?? {}) as Partial<Record<keyof AttachmentMaxBytes, unknown>>;
    return isPositiveNumber(image) && isPositiveNumber(video) && isPositiveNumber(file) ? { image, video, file } : null;
};

/**
 * Relays `PickAttachments`, `PrepareVideo` and `ReadAttachment` to the native AttachmentPicker module.
 *
 * Neither call has a timeout here. A pick answers when the person closes the picker and every copy is
 * written; a conversion can take minutes. The web gives each request its own wait, and an answer
 * that arrives after it gave up is dropped there.
 */
export const createAttachmentPickerHandlers = (picker: IAttachmentPickerBridge, logger: ILogService) => {
    const handlePickAttachments = async (
        message: WebMessageData<'PickAttachments'>
    ): Promise<WebMessageHandlerResponse<'PickAttachments'>> => {
        const fail = (code: PickAttachmentsErrorCode, text: string) => ({
            type: 'OnPickAttachments' as const,
            success: false,
            error: { code, message: text },
        });

        const { source, selectionLimit, maxBytes } = (message.data ?? {}) as Partial<
            WebMessageData<'PickAttachments'>['data']
        >;
        if (typeof source !== 'string' || !SOURCES.includes(source)) {
            return fail('INVALID', 'source must be media or document');
        }
        if (typeof selectionLimit !== 'number' || !Number.isInteger(selectionLimit) || selectionLimit < 1) {
            return fail('INVALID', 'selectionLimit must be a positive integer');
        }
        const limits = readMaxBytes(maxBytes);
        if (!limits) return fail('INVALID', 'maxBytes needs image, video and file as positive numbers');

        try {
            const data = await picker.pick(source as AttachmentPickSource, selectionLimit, limits);
            // Counts only: a picked file's name can say more about a person than a log should hold.
            logger.info(
                'DEVICE',
                `PickAttachments ${source}: ${data.items.length} picked, ${data.refused.length} refused`
            );
            return { type: 'OnPickAttachments' as const, success: true, data };
        } catch (e) {
            const error = toError<PickAttachmentsErrorCode>(e, PICK_CODES, 'INTERNAL');
            logger.warn('DEVICE', `PickAttachments failed: ${error.code}`);
            return fail(error.code, error.message);
        }
    };

    const handlePrepareVideo = async (
        message: WebMessageData<'PrepareVideo'>
    ): Promise<WebMessageHandlerResponse<'PrepareVideo'>> => {
        const uri = message.data?.uri;
        if (typeof uri !== 'string' || !uri) {
            return {
                type: 'OnPrepareVideo' as const,
                success: false,
                error: { code: 'INVALID' as const, message: 'uri is required' },
            };
        }
        try {
            const data = await picker.prepareVideo(uri);
            return { type: 'OnPrepareVideo' as const, success: true, data };
        } catch (e) {
            // A conversion that failed for a reason native did not name is a failed conversion.
            const error = toError<PrepareVideoErrorCode>(e, PREPARE_CODES, 'SYSTEM');
            // The code only: the message can hold a local path.
            logger.warn('DEVICE', `PrepareVideo failed: ${error.code}`);
            return { type: 'OnPrepareVideo' as const, success: false, error };
        }
    };

    const handleReadAttachment = async (
        message: WebMessageData<'ReadAttachment'>
    ): Promise<WebMessageHandlerResponse<'ReadAttachment'>> => {
        const uri = message.data?.uri;
        if (typeof uri !== 'string' || !uri) {
            return {
                type: 'OnReadAttachment' as const,
                success: false,
                error: { code: 'INVALID' as const, message: 'uri is required' },
            };
        }
        try {
            const data = await picker.readAttachment(uri);
            return { type: 'OnReadAttachment' as const, success: true, data };
        } catch (e) {
            const error = toError<ReadAttachmentErrorCode>(e, READ_CODES, 'INTERNAL');
            // The code only: the message can hold a local path.
            logger.warn('DEVICE', `ReadAttachment failed: ${error.code}`);
            return { type: 'OnReadAttachment' as const, success: false, error };
        }
    };

    return { handlePickAttachments, handlePrepareVideo, handleReadAttachment };
};
