import { act, renderHook } from '@testing-library/react';

import type { DownloadResult } from '../../../runtime/transfer';
import { shellCapabilities } from '../../../bridge/shellCapabilities';
import { useImageExports } from './useImageExports';

const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => toast(arg) }));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
    }),
}));

const saveToPhotoLibrary = jest.fn();
const shareFile = jest.fn();
jest.mock('../../../bridge/appBridge', () => ({
    appBridge: {
        openSettings: jest.fn(),
        saveToPhotoLibrary: (uri: string) => saveToPhotoLibrary(uri),
        shareFile: (uri: string, title?: string) => shareFile(uri, title),
    },
}));

let nextResult: Promise<DownloadResult>;
const cancel = jest.fn();
type Start = (input: { url: string }) => { transferId: string; result: Promise<DownloadResult>; cancel: jest.Mock };
const defaultStart: Start = () => ({ transferId: 'd-1', result: nextResult, cancel });
let start: Start = defaultStart;
jest.mock('../../../bridge/shellDownload', () => ({
    getShellDownloads: () => ({
        start: (input: { url: string }) => start(input),
        acknowledge: async () => undefined,
    }),
}));
const getChat = jest.fn();
jest.mock('@chatic/app-runtime', () => ({
    runtime: { data: { getCloudRepositories: () => ({ chat: { getChat: (input: unknown) => getChat(input) } }) } },
}));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));

const file = { uri: 'file:///cache/transfer-download/h/photo.jpg', size: 3, contentType: 'image/jpeg' };
const image = { uploadId: 'u-1', url: 'https://bucket.s3.amazonaws.com/k', name: 'photo.jpg' };

const capable = () =>
    shellCapabilities.setReport({
        protocolVersion: '2.3.0',
        supportedWebMessages: ['SaveToPhotoLibrary', 'ShareFile'],
        supportedAppMessages: [],
    });

beforeEach(() => {
    toast.mockClear();
    cancel.mockClear();
    saveToPhotoLibrary.mockReset().mockResolvedValue({ data: {} });
    shareFile.mockReset().mockResolvedValue({ data: { completed: true } });
    nextResult = Promise.resolve({ kind: 'file', file });
    start = defaultStart;
    getChat.mockReset();
});
afterEach(() => shellCapabilities.reset());

describe('useImageExports', () => {
    it('is off until the handshake lists both messages', () => {
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));
        expect(result.current.canExport).toBe(false);

        act(() => capable());

        expect(result.current.canExport).toBe(true);
    });

    it('saves, marks the image busy meanwhile, and reports it', async () => {
        capable();
        let finish: (result: DownloadResult) => void = () => undefined;
        nextResult = new Promise(resolve => (finish = resolve));
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        let running: Promise<void> = Promise.resolve();
        act(() => {
            running = result.current.run('save', image);
        });
        expect(result.current.busyFor('u-1')).toEqual({ action: 'save', progress: null });

        await act(async () => {
            finish({ kind: 'file', file });
            await running;
        });

        expect(saveToPhotoLibrary).toHaveBeenCalledWith(file.uri);
        expect(result.current.busyFor('u-1')).toBeUndefined();
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.export.saved' });
    });

    it('offers the settings when the permission was refused', async () => {
        capable();
        saveToPhotoLibrary.mockRejectedValueOnce(
            Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED', details: { canAskAgain: false } })
        );
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => result.current.run('save', image));

        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'chat.attach.export.permission',
                variant: 'destructive',
                action: expect.anything(),
            })
        );
    });

    it('stays quiet after a share', async () => {
        capable();
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => result.current.run('share', image));

        expect(shareFile).toHaveBeenCalledWith(file.uri, 'photo.jpg');
        expect(toast).not.toHaveBeenCalled();
    });

    it('cancels a share still downloading when the viewer closes', async () => {
        capable();
        let finish: (result: DownloadResult) => void = () => undefined;
        nextResult = new Promise(resolve => (finish = resolve));
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        let running: Promise<void> = Promise.resolve();
        act(() => {
            running = result.current.run('share', image);
        });
        act(() => result.current.cancelShares());
        expect(cancel).toHaveBeenCalledTimes(1);

        await act(async () => {
            finish({ kind: 'cancelled' });
            await running;
        });
        expect(shareFile).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
    });

    it('hides the actions for the session when the shell answers NOT_FOUND', async () => {
        capable();
        nextResult = Promise.resolve({ kind: 'unsupported' });
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => result.current.run('save', image));

        expect(result.current.canExport).toBe(false);
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.export.updateRequired' });
    });

    it('starts one export for two taps inside one frame', async () => {
        capable();
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => Promise.all([result.current.run('save', image), result.current.run('save', image)]));

        expect(saveToPhotoLibrary).toHaveBeenCalledTimes(1);
    });

    it('cancels a share still downloading when the row goes away', () => {
        capable();
        nextResult = new Promise(() => undefined);
        const { result, unmount } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));
        act(() => {
            void result.current.run('share', image);
        });

        unmount();

        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('retries an expired thumbnail-only image from the thumbnail the message is read again with', async () => {
        capable();
        const starts: string[] = [];
        start = input => {
            starts.push(input.url);
            return {
                transferId: `d-${starts.length}`,
                result: Promise.resolve<DownloadResult>(
                    starts.length === 1 ? { kind: 'responded', httpStatus: 403 } : { kind: 'file', file }
                ),
                cancel,
            };
        };
        getChat.mockResolvedValueOnce({
            upload$$: [{ id: 'u-1', thumbUrl: 'https://bucket.s3.amazonaws.com/fresh-thumb' }],
        });
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => result.current.run('save', image));

        expect(starts).toEqual([image.url, 'https://bucket.s3.amazonaws.com/fresh-thumb']);
        expect(saveToPhotoLibrary).toHaveBeenCalledWith(file.uri);
    });

    it('saves every image of the message in one run, busy throughout, and reports once', async () => {
        capable();
        const urls: string[] = [];
        start = input => {
            urls.push(input.url);
            return {
                transferId: `d-${urls.length}`,
                result: Promise.resolve<DownloadResult>({ kind: 'file', file }),
                cancel,
            };
        };
        const second = { uploadId: 'u-2', url: 'https://bucket.s3.amazonaws.com/k2', name: 'two.jpg' };
        const sending = { uploadId: 'local-2', url: 'blob:https://app/3' };
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        let running: Promise<void> = Promise.resolve();
        act(() => {
            running = result.current.runAll([image, second, sending]);
        });
        expect(result.current.busyFor('u-1')).toEqual({ action: 'save', progress: null });
        expect(result.current.busyFor('u-2')).toEqual({ action: 'save', progress: null });
        await act(() => running);

        expect(urls).toEqual([image.url, second.url]);
        expect(saveToPhotoLibrary).toHaveBeenCalledTimes(2);
        expect(result.current.busyFor('u-1')).toBeUndefined();
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.export.savedAll:{"n":2}' });
    });

    it('leaves an image already being saved to that save, and saves the rest', async () => {
        capable();
        let finish: (result: DownloadResult) => void = () => undefined;
        const urls: string[] = [];
        start = input => {
            urls.push(input.url);
            const result =
                urls.length === 1
                    ? new Promise<DownloadResult>(resolve => (finish = resolve))
                    : Promise.resolve<DownloadResult>({ kind: 'file', file });
            return { transferId: `d-${urls.length}`, result, cancel };
        };
        const second = { uploadId: 'u-2', url: 'https://bucket.s3.amazonaws.com/k2', name: 'two.jpg' };
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        let single: Promise<void> = Promise.resolve();
        act(() => {
            single = result.current.run('save', image);
        });
        await act(() => result.current.runAll([image, second]));

        expect(urls).toEqual([image.url, second.url]);
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.export.savedAll:{"n":1}' });
        await act(async () => {
            finish({ kind: 'file', file });
            await single;
        });
    });

    it('starts nothing on an image that a save all is working on', async () => {
        capable();
        let finish: (result: DownloadResult) => void = () => undefined;
        const urls: string[] = [];
        start = input => {
            urls.push(input.url);
            return {
                transferId: `d-${urls.length}`,
                result: new Promise<DownloadResult>(resolve => (finish = resolve)),
                cancel,
            };
        };
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        let all: Promise<void> = Promise.resolve();
        act(() => {
            all = result.current.runAll([image]);
        });
        await act(() => result.current.run('share', image));

        expect(urls).toEqual([image.url]);
        expect(shareFile).not.toHaveBeenCalled();
        await act(async () => {
            finish({ kind: 'file', file });
            await all;
        });
    });
});
