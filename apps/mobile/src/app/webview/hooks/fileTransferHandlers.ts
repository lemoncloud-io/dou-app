import type { IAppBridgeHost } from '@chatic/bridges';
import type { FileTransferErrorCode, WebMessageData } from '@chatic/app-messages';
import type { IFileManagerBridge, ITransferManagerBridge } from '../../bridge';
import { safeHost } from '../../bridge';
import type { ILogService } from '../../services';

/**
 * A native rejection carries a transfer error code; anything else (a missing module, a thrown
 * programming error) is reported as INTERNAL so the web always gets a code it knows.
 */
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

/**
 * Relays the file-transfer messages between the WebView and the native TransferManager.
 *
 * Nothing is held here. The registry lives natively so a transfer that ends while the WebView is
 * suspended, or while React Native is not running at all, is still there for `ListFileTransfers`.
 */
export const createFileTransferHandlers = (
    bridge: IAppBridgeHost,
    transfer: ITransferManagerBridge,
    fileManager: Pick<IFileManagerBridge, 'writeTempFile'>,
    logger: ILogService
) => {
    const handleStartFileTransfer = async (message: WebMessageData<'StartFileTransfer'>) => {
        const request = message.data;
        // Host only: the URL's query string carries the signature. A download names no local file —
        // the shell picks where it goes — so the request is relayed exactly as it came.
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
        try {
            const uri = await fileManager.writeTempFile(base64, fileName);
            return { type: 'OnWriteTempFile' as const, success: true, data: { uri } };
        } catch (e) {
            // A failed write is a local-file problem, the same class as an unreadable upload source.
            return {
                type: 'OnWriteTempFile' as const,
                success: false,
                error: { code: 'SOURCE' as const, message: toError(e).message },
            };
        }
    };

    /**
     * Forwards every native state change to the WebView. Returns the unsubscribe function; the
     * hook ties it to the router's lifetime.
     */
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
