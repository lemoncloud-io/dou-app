import type { IAppBridgeHost } from '@chatic/bridges';
import type { FileTransferErrorCode, WebMessageData } from '@chatic/bridge-messages';
import type { IFileManagerBridge, ITransferManagerBridge } from '../../bridge';
import { safeHost } from '../../bridge';
import type { ILogService } from '../../services';

const toError = (e: unknown): { code: FileTransferErrorCode; message: string } => {
    const code = (e as { code?: unknown })?.code;
    const known: FileTransferErrorCode[] = ['NETWORK', 'SOURCE', 'INVALID', 'SYSTEM', 'INTERNAL'];
    return {
        code:
            typeof code === 'string' && (known as string[]).includes(code)
                ? (code as FileTransferErrorCode)
                : 'INTERNAL',
        message: (e as { message?: unknown })?.message ? String((e as { message: unknown }).message) : 'Unknown error',
    };
};

const MAX_WRITE_TEMP_FILE_BYTES = 64 * 1024 * 1024;
const base64LengthFor = (bytes: number): number => Math.ceil(bytes / 3) * 4;

export const createFileTransferHandlers = (
    bridge: IAppBridgeHost,
    transfer: ITransferManagerBridge,
    fileManager: Pick<IFileManagerBridge, 'writeTempFile'>,
    logger: ILogService
) => {
    const handleStartFileTransfer = async (message: WebMessageData<'StartFileTransfer'>) => {
        const request = message.data;
        const way = request.direction === 'download' ? 'from' : 'to';
        logger.info('TRANSFER', `[${request.transferId}] start ${request.direction} ${way} ${safeHost(request.url)}`);
        try {
            await transfer.start(request);
            return { type: 'OnStartFileTransfer' as const, success: true, data: { transferId: request.transferId } };
        } catch (e) {
            const error = toError(e);
            logger.warn('TRANSFER', `[${request.transferId}] start rejected: ${error.code}`);
            return { type: 'OnStartFileTransfer' as const, success: false, error };
        }
    };

    const handleCancelFileTransfer = async (message: WebMessageData<'CancelFileTransfer'>) => {
        const { transferId } = message.data;
        try {
            await transfer.cancel(transferId);
            return { type: 'OnCancelFileTransfer' as const, success: true, data: { transferId } };
        } catch (e) {
            return { type: 'OnCancelFileTransfer' as const, success: false, error: toError(e) };
        }
    };

    const handleListFileTransfers = async () => {
        try {
            const transfers = await transfer.list();
            return { type: 'OnListFileTransfers' as const, success: true, data: { transfers } };
        } catch (e) {
            return { type: 'OnListFileTransfers' as const, success: false, error: toError(e) };
        }
    };

    const handleAckFileTransfers = async (message: WebMessageData<'AckFileTransfers'>) => {
        try {
            const remaining = await transfer.ack(message.data.transferIds);
            return { type: 'OnAckFileTransfers' as const, success: true, data: { remaining } };
        } catch (e) {
            return { type: 'OnAckFileTransfers' as const, success: false, error: toError(e) };
        }
    };

    const handleWriteTempFile = async (message: WebMessageData<'WriteTempFile'>) => {
        const { base64, fileName } = message.data;
        if (typeof base64 === 'string' && base64.length > base64LengthFor(MAX_WRITE_TEMP_FILE_BYTES)) {
            logger.warn('TRANSFER', 'temp file payload over the bridge limit', {
                fileName,
                length: base64.length,
            });
            return {
                type: 'OnWriteTempFile' as const,
                success: false,
                error: {
                    code: 'TOO_LARGE' as const,
                    message: `file exceeds the ${MAX_WRITE_TEMP_FILE_BYTES}-byte bridge limit`,
                },
            };
        }
        try {
            const uri = await fileManager.writeTempFile(base64, fileName);
            return { type: 'OnWriteTempFile' as const, success: true, data: { uri } };
        } catch (e) {
            return {
                type: 'OnWriteTempFile' as const,
                success: false,
                error: { code: 'SOURCE' as const, message: toError(e).message },
            };
        }
    };

    const relayStateEvents = () =>
        transfer.subscribe(state => {
            bridge.pushEvent<'OnFileTransferState'>({ type: 'OnFileTransferState', success: true, data: state });
        });

    return {
        handleStartFileTransfer,
        handleCancelFileTransfer,
        handleListFileTransfers,
        handleAckFileTransfers,
        handleWriteTempFile,
        relayStateEvents,
    };
};
