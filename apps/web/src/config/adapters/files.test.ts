import { webClient } from '@chatic/bridges';
import type { UploadPutTarget } from '@chatic/runtime-react';
import type { WebHostFacts } from '@chatic/runtime-hybrid-web';

import { appBridge } from '../../app/bridge/appBridge';
import { pageUploadPut } from '../upload';
import { resetNativeTransfersForTest, SHELL_USE_TIMEOUT_MS, webFiles } from './files';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    webClient: { request: jest.fn(), onEvent: jest.fn(() => () => undefined) },
}));
jest.mock('../../app/bridge/appBridge', () => ({ appBridge: { readVideoFrame: jest.fn() } }));

const facts = {} as WebHostFacts;
const shell = () => webFiles.shell({ kind: 'shell' }, facts);
const browser = () => webFiles.browser({ kind: 'browser' }, facts);

const request = webClient.request as jest.Mock;
const onEvent = webClient.onEvent as jest.Mock;
const target = { url: 'https://bucket/put', headers: {} } as unknown as UploadPutTarget;

beforeEach(() => {
    jest.clearAllMocks();
    resetNativeTransfersForTest();
});

describe('webFiles — the phone app moves the files', () => {
    it('makes no transfer module until first use, then one for the page', async () => {
        const port = shell();
        expect(onEvent).not.toHaveBeenCalled();

        request.mockResolvedValue({ data: { transfers: [] } });
        await port.transfers?.syncUploads();
        await shell().transfers?.syncUploads();

        expect(onEvent).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledWith({ type: 'ListFileTransfers', data: {} });
    });

    it("sends an upload through the app's transfer module, not the page's PUT", async () => {
        request.mockRejectedValue(Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' }));
        const file = new File(['abc'], 'a.jpg', { type: 'image/jpeg' });

        await expect(shell().put(target, file, 'slot-0/original')).resolves.toEqual({
            kind: 'no-response',
            reason: 'system',
        });

        expect(request).toHaveBeenCalledTimes(1);
        expect(request.mock.calls[0][0]).toMatchObject({ type: 'WriteTempFile', data: { fileName: 'a.jpg' } });
    });

    it('starts a transfer of a file the app keeps from where it lies, writing no temp file', async () => {
        request.mockRejectedValue(Object.assign(new Error('SOURCE'), { code: 'SOURCE' }));
        const file = {
            uri: 'file:///pick/a.pdf',
            name: 'a.pdf',
            type: 'application/pdf',
            size: 3,
            kind: 'file' as const,
        };

        await expect(shell().transfers?.putShellFile(target, file, 'slot-0/original')).resolves.toEqual({
            kind: 'no-response',
            reason: 'source',
        });

        expect(request).toHaveBeenCalledTimes(1);
        expect(request.mock.calls[0][0]).toEqual({
            type: 'StartFileTransfer',
            data: {
                transferId: expect.any(String),
                direction: 'upload',
                url: 'https://bucket/put',
                method: 'PUT',
                headers: {},
                file: { uri: 'file:///pick/a.pdf', contentType: 'application/pdf', contentLength: 3 },
            },
        });
    });

    it('opens a downloaded file with the OS, waiting as long as the preview stays up', async () => {
        request.mockResolvedValue({ data: {} });

        await expect(shell().transfers?.openFile('file:///d/a.pdf')).resolves.toBeUndefined();

        expect(request).toHaveBeenCalledWith(
            { type: 'OpenFile', data: { uri: 'file:///d/a.pdf' } },
            { timeoutMs: SHELL_USE_TIMEOUT_MS }
        );
    });

    it('keeps a downloaded file and answers where it went', async () => {
        request.mockResolvedValue({ data: { saved: true, location: 'Download/DoU/a.pdf' } });

        await expect(shell().transfers?.saveFile('file:///d/a.pdf', 'a.pdf')).resolves.toEqual({
            saved: true,
            location: 'Download/DoU/a.pdf',
        });
        expect(request).toHaveBeenCalledWith(
            { type: 'SaveFile', data: { uri: 'file:///d/a.pdf', name: 'a.pdf' } },
            { timeoutMs: SHELL_USE_TIMEOUT_MS }
        );
    });

    it("passes the app's refusal of a save through", async () => {
        const refusal = Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' });
        request.mockRejectedValue(refusal);

        await expect(shell().transfers?.saveFile('file:///d/a.pdf', 'a.pdf')).rejects.toBe(refusal);
    });

    it('reads a video frame on the device', async () => {
        const frame = { base64: 'AAA', contentType: 'image/jpeg', width: 4, height: 3 };
        (appBridge.readVideoFrame as jest.Mock).mockResolvedValue({ data: frame });
        const ask = { url: 'https://bucket/v.mp4', atMs: 500, maxEdge: 400 };

        await expect(shell().transfers?.readVideoFrame(ask)).resolves.toEqual(frame);
        expect(appBridge.readVideoFrame).toHaveBeenCalledWith(ask);
    });
});

describe('webFiles — the page moves the files', () => {
    it("sends with the page's own PUT and has no transfer module", () => {
        const port = browser();

        expect(port.kind).toBe('browser');
        expect(port.put).toBe(pageUploadPut);
        expect(port.transfers).toBeNull();
        expect(request).not.toHaveBeenCalled();
    });
});
