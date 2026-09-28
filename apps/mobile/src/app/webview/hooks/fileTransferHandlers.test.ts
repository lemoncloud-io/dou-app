import type { IAppBridgeHost } from '@chatic/bridges';
import type { OnFileTransferStatePayload, StartFileTransferPayload } from '@chatic/app-messages';
import type { ITransferManagerBridge } from '../../bridge';
import type { ILogService } from '../../services';

import { createFileTransferHandlers } from './fileTransferHandlers';

// The real bridge barrel loads every native module wrapper; the handlers only need `safeHost` from it
// at runtime, and receive the transfer and file bridges by injection.
jest.mock('../../bridge', () => ({
    safeHost: (url: string) => new URL(url).host,
}));

const createBridgeMock = (): jest.Mocked<IAppBridgeHost> =>
    ({
        registerHandler: jest.fn(),
        unregisterHandler: jest.fn(),
        pushEvent: jest.fn(),
        handleMessage: jest.fn(),
    }) as any;

const createLoggerMock = (): jest.Mocked<ILogService> =>
    ({ subscribe: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) as any;

const createTransferMock = (): jest.Mocked<ITransferManagerBridge> => ({
    start: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([]),
    ack: jest.fn().mockResolvedValue(0),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
});

const request: StartFileTransferPayload = {
    transferId: 't1',
    direction: 'upload',
    url: 'https://bucket.example.com/key?X-Amz-Signature=secret',
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    file: { uri: 'file:///tmp/a.jpg', contentType: 'image/jpeg', contentLength: 10 },
    title: 'a.jpg',
};

const message = <T>(type: string, data: T) => ({ type, data }) as any;

const rejection = (code: string | undefined, text = 'boom') => Object.assign(new Error(text), code ? { code } : {});

describe('createFileTransferHandlers', () => {
    let bridge: jest.Mocked<IAppBridgeHost>;
    let transfer: jest.Mocked<ITransferManagerBridge>;
    let fileManager: { writeTempFile: jest.Mock };
    let logger: jest.Mocked<ILogService>;

    beforeEach(() => {
        bridge = createBridgeMock();
        transfer = createTransferMock();
        fileManager = { writeTempFile: jest.fn().mockResolvedValue('file:///tmp/transfer-temp/x.jpg') };
        logger = createLoggerMock();
    });

    const handlers = () => createFileTransferHandlers(bridge, transfer, fileManager, logger);

    describe('StartFileTransfer', () => {
        it('passes the request through unchanged and answers with the transfer id', async () => {
            const reply = await handlers().handleStartFileTransfer(message('StartFileTransfer', request));

            expect(transfer.start).toHaveBeenCalledWith(request);
            expect(reply).toEqual({ type: 'OnStartFileTransfer', success: true, data: { transferId: 't1' } });
        });

        it('logs the host only, never the signed query', async () => {
            await handlers().handleStartFileTransfer(message('StartFileTransfer', request));

            const logged = logger.info.mock.calls.map(call => call.join(' ')).join('\n');
            expect(logged).toContain('bucket.example.com');
            expect(logged).not.toContain('X-Amz-Signature');
            expect(logged).not.toContain('secret');
        });

        it('carries the native error code into the reply envelope', async () => {
            transfer.start.mockRejectedValueOnce(rejection('INVALID', 'duplicate transferId'));

            const reply = await handlers().handleStartFileTransfer(message('StartFileTransfer', request));

            expect(reply).toEqual({
                type: 'OnStartFileTransfer',
                success: false,
                error: { code: 'INVALID', message: 'duplicate transferId' },
            });
        });

        it('reports an unknown or missing code as INTERNAL', async () => {
            transfer.start.mockRejectedValueOnce(rejection('E_SOMETHING_ELSE'));
            const unknown = await handlers().handleStartFileTransfer(message('StartFileTransfer', request));
            transfer.start.mockRejectedValueOnce(rejection(undefined));
            const missing = await handlers().handleStartFileTransfer(message('StartFileTransfer', request));

            expect(unknown).toMatchObject({ success: false, error: { code: 'INTERNAL' } });
            expect(missing).toMatchObject({ success: false, error: { code: 'INTERNAL' } });
        });
    });

    describe('CancelFileTransfer', () => {
        it('answers with the transfer id once native accepts the cancellation', async () => {
            const reply = await handlers().handleCancelFileTransfer(
                message('CancelFileTransfer', { transferId: 't1' })
            );

            expect(transfer.cancel).toHaveBeenCalledWith('t1');
            expect(reply).toEqual({ type: 'OnCancelFileTransfer', success: true, data: { transferId: 't1' } });
        });

        it('fails with INVALID when the transfer already ended', async () => {
            transfer.cancel.mockRejectedValueOnce(rejection('INVALID', 'already ended'));

            const reply = await handlers().handleCancelFileTransfer(
                message('CancelFileTransfer', { transferId: 't1' })
            );

            expect(reply).toMatchObject({ success: false, error: { code: 'INVALID' } });
        });
    });

    describe('ListFileTransfers', () => {
        it('returns what the native registry holds', async () => {
            const held: OnFileTransferStatePayload[] = [
                {
                    transferId: 't1',
                    direction: 'upload',
                    state: 'responded',
                    transferredBytes: 10,
                    totalBytes: 10,
                    httpStatus: 412,
                },
            ];
            transfer.list.mockResolvedValueOnce(held);

            const reply = await handlers().handleListFileTransfers();

            expect(reply).toEqual({ type: 'OnListFileTransfers', success: true, data: { transfers: held } });
        });

        it('reports a native failure in the envelope', async () => {
            transfer.list.mockRejectedValueOnce(rejection('INTERNAL'));

            expect(await handlers().handleListFileTransfers()).toMatchObject({
                success: false,
                error: { code: 'INTERNAL' },
            });
        });
    });

    describe('AckFileTransfers', () => {
        it('forwards the ids and answers with how many remain', async () => {
            transfer.ack.mockResolvedValueOnce(2);

            const reply = await handlers().handleAckFileTransfers(message('AckFileTransfers', { transferIds: ['t1'] }));

            expect(transfer.ack).toHaveBeenCalledWith(['t1']);
            expect(reply).toEqual({ type: 'OnAckFileTransfers', success: true, data: { remaining: 2 } });
        });

        it('reports a native failure in the envelope', async () => {
            transfer.ack.mockRejectedValueOnce(rejection('INTERNAL'));

            const reply = await handlers().handleAckFileTransfers(message('AckFileTransfers', { transferIds: ['t1'] }));

            expect(reply).toMatchObject({ success: false, error: { code: 'INTERNAL' } });
        });
    });

    describe('WriteTempFile', () => {
        it('answers with the written file URI', async () => {
            const reply = await handlers().handleWriteTempFile(
                message('WriteTempFile', { base64: 'AAAA', fileName: 'x.jpg' })
            );

            expect(fileManager.writeTempFile).toHaveBeenCalledWith('AAAA', 'x.jpg');
            expect(reply).toEqual({
                type: 'OnWriteTempFile',
                success: true,
                data: { uri: 'file:///tmp/transfer-temp/x.jpg' },
            });
        });

        it('reports a failed write as SOURCE', async () => {
            fileManager.writeTempFile.mockRejectedValueOnce(new Error('disk full'));

            const reply = await handlers().handleWriteTempFile(message('WriteTempFile', { base64: 'AAAA' }));

            expect(reply).toEqual({
                type: 'OnWriteTempFile',
                success: false,
                error: { code: 'SOURCE', message: 'disk full' },
            });
        });
    });

    describe('state events', () => {
        it('forwards every native state change to the WebView as OnFileTransferState', () => {
            const unsubscribe = jest.fn();
            let listener: ((state: OnFileTransferStatePayload) => void) | undefined;
            transfer.subscribe.mockImplementationOnce(fn => {
                listener = fn;
                return unsubscribe;
            });

            const stop = handlers().relayStateEvents();
            const state: OnFileTransferStatePayload = {
                transferId: 't1',
                direction: 'upload',
                state: 'running',
                transferredBytes: 4,
                totalBytes: 10,
            };
            listener?.(state);

            expect(bridge.pushEvent).toHaveBeenCalledWith({ type: 'OnFileTransferState', success: true, data: state });
            stop();
            expect(unsubscribe).toHaveBeenCalled();
        });
    });
});
