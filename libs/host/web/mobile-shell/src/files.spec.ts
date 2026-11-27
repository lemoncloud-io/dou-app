import type { FilesPort } from '@chatic/ports';

import type { ShellBridge } from './bridge';
import { mobileShellFiles, READ_VIDEO_FRAME_TIMEOUT_MS, SHELL_USE_TIMEOUT_MS } from './files';

const bridge = { post: jest.fn(), request: jest.fn(), onEvent: jest.fn(() => () => undefined) };
const fakeSender = { put: jest.fn(), putShellFile: jest.fn() };
const sender = jest.fn(() => fakeSender);
const syncUploads = jest.fn();

const shell = () =>
    mobileShellFiles({ bridge: bridge as unknown as ShellBridge, sender, syncUploads })({ kind: 'shell' });

const target = { url: 'https://bucket/put', headers: {} } as unknown as Parameters<FilesPort['put']>[0];

beforeEach(() => {
    jest.resetAllMocks();
    sender.mockImplementation(() => fakeSender);
});

describe('mobileShellFiles — the phone app moves the files', () => {
    it('makes no transfer module until first use, then asks for it on each use', async () => {
        const port = shell();
        expect(sender).not.toHaveBeenCalled();
        expect(syncUploads).not.toHaveBeenCalled();

        syncUploads.mockResolvedValue(undefined);
        await port.transfers?.syncUploads();
        await shell().transfers?.syncUploads();

        expect(syncUploads).toHaveBeenCalledTimes(2);
        expect(bridge.request).not.toHaveBeenCalled();
    });

    it("sends an upload through the app's transfer module, not the page's PUT", async () => {
        const result = { kind: 'no-response', reason: 'system' };
        fakeSender.put.mockResolvedValue(result);
        const file = new File(['abc'], 'a.jpg', { type: 'image/jpeg' });
        const onProgress = jest.fn();
        const signal = new AbortController().signal;

        await expect(shell().put(target, file, 'slot-0/original', onProgress, signal)).resolves.toBe(result);

        expect(sender).toHaveBeenCalledTimes(1);
        expect(fakeSender.put).toHaveBeenCalledWith(target, file, 'slot-0/original', onProgress, signal);
        expect(bridge.request).not.toHaveBeenCalled();
    });

    it('starts a transfer of a file the app keeps from where it lies, writing no temp file', async () => {
        const result = { kind: 'no-response', reason: 'source' };
        fakeSender.putShellFile.mockResolvedValue(result);
        const file = {
            uri: 'file:///pick/a.pdf',
            name: 'a.pdf',
            type: 'application/pdf',
            size: 3,
            kind: 'file' as const,
        };
        const onProgress = jest.fn();

        await expect(shell().transfers?.putShellFile(target, file, 'slot-0/original', onProgress)).resolves.toBe(
            result
        );

        expect(fakeSender.putShellFile).toHaveBeenCalledWith(target, file, 'slot-0/original', onProgress);
        expect(fakeSender.put).not.toHaveBeenCalled();
        expect(bridge.request).not.toHaveBeenCalled();
    });

    it('opens a downloaded file with the OS, waiting as long as the preview stays up', async () => {
        bridge.request.mockResolvedValue({ data: {} });

        await expect(shell().transfers?.openFile('file:///d/a.pdf')).resolves.toBeUndefined();

        expect(bridge.request).toHaveBeenCalledWith(
            { type: 'OpenFile', data: { uri: 'file:///d/a.pdf' } },
            { timeoutMs: SHELL_USE_TIMEOUT_MS }
        );
        expect(SHELL_USE_TIMEOUT_MS).toBe(10 * 60_000);
    });

    it('keeps a downloaded file and answers where it went', async () => {
        bridge.request.mockResolvedValue({ data: { saved: true, location: 'Download/DoU/a.pdf' } });

        await expect(shell().transfers?.saveFile('file:///d/a.pdf', 'a.pdf')).resolves.toEqual({
            saved: true,
            location: 'Download/DoU/a.pdf',
        });
        expect(bridge.request).toHaveBeenCalledWith(
            { type: 'SaveFile', data: { uri: 'file:///d/a.pdf', name: 'a.pdf' } },
            { timeoutMs: SHELL_USE_TIMEOUT_MS }
        );
    });

    it("passes the app's refusal of a save through", async () => {
        const refusal = Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' });
        bridge.request.mockRejectedValue(refusal);

        await expect(shell().transfers?.saveFile('file:///d/a.pdf', 'a.pdf')).rejects.toBe(refusal);
    });

    it('reads a video frame on the device', async () => {
        const frame = { base64: 'AAA', contentType: 'image/jpeg', width: 4, height: 3 };
        bridge.request.mockResolvedValue({ data: frame });
        const ask = { url: 'https://bucket/v.mp4', atMs: 500, maxEdge: 400 };

        await expect(shell().transfers?.readVideoFrame(ask)).resolves.toEqual(frame);
        expect(bridge.request).toHaveBeenCalledWith(
            { type: 'ReadVideoFrame', data: ask },
            { timeoutMs: READ_VIDEO_FRAME_TIMEOUT_MS }
        );
        expect(READ_VIDEO_FRAME_TIMEOUT_MS).toBe(25_000);
    });
});
