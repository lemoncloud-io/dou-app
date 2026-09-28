import { NativeEventEmitter, NativeModules } from 'react-native';
import type { FileTransferErrorCode, OnFileTransferStatePayload, StartFileTransferPayload } from '@chatic/app-messages';

/**
 * TransferManager — the native file-transfer module (Kotlin `TransferManagerModule`, Swift
 * `TransferManager`).
 *
 * The module is a thin face over a process-wide native owner that holds the registry, runs the
 * transfers and keeps them going in the background. Nothing here keeps state: the registry lives
 * natively so a result that lands while React Native is not running is still there to read.
 */
const { TransferManager } = NativeModules;

/** Event the native owner emits for every state change of every transfer. */
export const TRANSFER_STATE_EVENT = 'TransferManagerStateChanged';

/**
 * A rejected native call carries one of the transfer error codes in `code`, so the caller can pass
 * it straight into the reply envelope.
 */
export interface TransferManagerError extends Error {
    code: FileTransferErrorCode;
}

export interface ITransferManagerBridge {
    /**
     * Resolves once the transfer is accepted; the result arrives as events. Rejects with `INVALID` on a
     * bad request or a reused id, and on iOS with `SOURCE` when the file cannot be used — iOS hands the
     * file to the OS at this point, so it checks it here, where Android finds out while streaming.
     */
    start(request: StartFileTransferPayload): Promise<void>;
    /** Resolves once cancellation is accepted; the `cancelled` event follows. Rejects with `INVALID` when the transfer already ended or is unknown. */
    cancel(transferId: string): Promise<void>;
    /** Running transfers plus ended ones not yet acknowledged, in the order they started. */
    list(): Promise<OnFileTransferStatePayload[]>;
    /** Drops the acknowledged ended transfers; ids of running ones are ignored. Resolves with how many the owner still holds. */
    ack(transferIds: string[]): Promise<number>;
    /** Subscribes to state changes. Returns the unsubscribe function. */
    subscribe(listener: (state: OnFileTransferStatePayload) => void): () => void;
}

const unavailable = (): Promise<never> => {
    const error = new Error('TransferManager native module is not available') as TransferManagerError;
    error.code = 'INTERNAL';
    return Promise.reject(error);
};

const emitter = TransferManager ? new NativeEventEmitter(TransferManager) : null;

export const TransferManagerBridge: ITransferManagerBridge = {
    start: request => (TransferManager ? TransferManager.start(request) : unavailable()),
    cancel: transferId => (TransferManager ? TransferManager.cancel(transferId) : unavailable()),
    list: () => (TransferManager ? TransferManager.list() : unavailable()),
    ack: transferIds => (TransferManager ? TransferManager.ack(transferIds) : unavailable()),
    subscribe: listener => {
        if (!emitter) return () => undefined;
        const subscription = emitter.addListener(TRANSFER_STATE_EVENT, listener);
        return () => subscription.remove();
    },
};
