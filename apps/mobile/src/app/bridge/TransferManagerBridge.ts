import { NativeEventEmitter, NativeModules } from 'react-native';
import type {
    FileTransferErrorCode,
    OnFileTransferStatePayload,
    StartFileTransferPayload,
} from '@chatic/bridge-messages';

const { TransferManager } = NativeModules;

export const TRANSFER_STATE_EVENT = 'TransferManagerStateChanged';

export interface TransferManagerError extends Error {
    code: FileTransferErrorCode;
}

export interface ITransferManagerBridge {
    start(request: StartFileTransferPayload): Promise<void>;
    cancel(transferId: string): Promise<void>;
    list(): Promise<OnFileTransferStatePayload[]>;
    ack(transferIds: string[]): Promise<number>;
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
