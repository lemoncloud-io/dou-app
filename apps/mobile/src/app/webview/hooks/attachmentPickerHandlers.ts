import type {
    AttachmentMaxBytes,
    AttachmentPickSource,
    PickAttachmentsErrorCode,
    PrepareVideoErrorCode,
    ReadAttachmentErrorCode,
    ReadVideoFrameErrorCode,
    WebMessageData,
    WebMessageHandlerResponse,
} from '@chatic/bridge-messages';
import type { IAttachmentPickerBridge } from '../../bridge';
import type { ILogService } from '../../services';

const PICK_CODES: readonly string[] = ['BUSY', 'INVALID', 'INTERNAL'];
const PREPARE_CODES: readonly string[] = ['TOO_LARGE', 'UNSUPPORTED', 'SOURCE', 'SYSTEM', 'INVALID'];
const READ_CODES: readonly string[] = ['INVALID', 'SOURCE', 'INTERNAL'];
const FRAME_CODES: readonly string[] = ['INVALID', 'UNREADABLE'];

const SOURCES: readonly string[] = ['media', 'document'];

export const toError = <C extends string>(
    e: unknown,
    known: readonly string[],
    fallback: C
): { code: C; message: string } => {
    const code = (e as { code?: unknown })?.code;
    const message = (e as { message?: unknown })?.message;
    return {
        code: typeof code === 'string' && known.includes(code) ? (code as C) : fallback,
        message: message ? String(message) : 'Unknown error',
    };
};

const isPositiveNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

const readMaxBytes = (value: unknown): AttachmentMaxBytes | null => {
    const { image, video, file } = (value ?? {}) as Partial<Record<keyof AttachmentMaxBytes, unknown>>;
    return isPositiveNumber(image) && isPositiveNumber(video) && isPositiveNumber(file) ? { image, video, file } : null;
};

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
            const error = toError<PrepareVideoErrorCode>(e, PREPARE_CODES, 'SYSTEM');
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
            logger.warn('DEVICE', `ReadAttachment failed: ${error.code}`);
            return { type: 'OnReadAttachment' as const, success: false, error };
        }
    };

    const handleReadVideoFrame = async (
        message: WebMessageData<'ReadVideoFrame'>
    ): Promise<WebMessageHandlerResponse<'ReadVideoFrame'>> => {
        const { url, atMs, maxEdge } = (message.data ?? {}) as Partial<WebMessageData<'ReadVideoFrame'>['data']>;
        const invalid = (text: string) => ({
            type: 'OnReadVideoFrame' as const,
            success: false,
            error: { code: 'INVALID' as const, message: text },
        });
        if (typeof url !== 'string' || !url.startsWith('https:')) return invalid('url must be an https address');
        if (typeof atMs !== 'number' || !Number.isFinite(atMs) || atMs < 0) {
            return invalid('atMs must be a number of zero or more');
        }
        if (!isPositiveNumber(maxEdge)) return invalid('maxEdge must be a positive number');
        try {
            const data = await picker.readVideoFrame(url, atMs, maxEdge);
            return { type: 'OnReadVideoFrame' as const, success: true, data };
        } catch (e) {
            const error = toError<ReadVideoFrameErrorCode>(e, FRAME_CODES, 'UNREADABLE');
            logger.warn('DEVICE', `ReadVideoFrame failed: ${error.code}`);
            return { type: 'OnReadVideoFrame' as const, success: false, error };
        }
    };

    return { handlePickAttachments, handlePrepareVideo, handleReadAttachment, handleReadVideoFrame };
};
