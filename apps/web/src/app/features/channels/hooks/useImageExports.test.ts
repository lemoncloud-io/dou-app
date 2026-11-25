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
let filesKind: 'shell' | 'browser' = 'shell';
jest.mock('@chatic/runtime-react', () => {
    const testing = require('@chatic/runtime-react/testing');
    return testing.fakeRuntimeModule({
        data: { getCloudRepositories: () => ({ chat: { getChat: (input: unknown) => getChat(input) } }) },
        get files() {
            const files = testing.browserFiles();
            return filesKind === 'shell' ? { ...files, kind: 'shell', transfers: {} } : files;
        },
    });
});
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));

const fetchInBrowser = jest.fn();
jest.mock('../lib/fileDownload', () => ({
    fetchInBrowser: (...args: unknown[]) => fetchInBrowser(...args),
}));
const saveBlob = jest.fn();
jest.mock('../lib/browserSave', () => ({
    saveFileInBrowser: (...args: unknown[]) => saveBlob(...args),
}));
const shareFileInBrowser = jest.fn();
let browserShares = true;
jest.mock('../lib/browserShare', () => ({
    canShareFilesInBrowser: () => browserShares,
    shareFileInBrowser: (...args: unknown[]) => shareFileInBrowser(...args),
}));

const file = { uri: 'file:///cache/transfer-download/h/photo.jpg', size: 3, contentType: 'image/jpeg' };
const image = { uploadId: 'u-1', url: 'https://bucket.s3.amazonaws.com/k', name: 'photo.jpg', kind: 'image' as const };
const clip = { uploadId: 'v-1', url: 'https://bucket.s3.amazonaws.com/v', name: 'clip.mp4', kind: 'video' as const };
const second = { uploadId: 'u-2', url: 'https://bucket.s3.amazonaws.com/k2', name: 'two.jpg', kind: 'image' as const };
const sending = { uploadId: 'local-2', url: 'blob:https://app/3', kind: 'image' as const };
const instant =
    (urls: string[]): Start =>
    input => {
        urls.push(input.url);
        return {
            transferId: `d-${urls.length}`,
            result: Promise.resolve<DownloadResult>({ kind: 'file', file }),
            cancel,
        };
    };

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
    filesKind = 'shell';
    browserShares = true;
    fetchInBrowser.mockReset();
    saveBlob.mockReset().mockResolvedValue('saved');
    shareFileInBrowser.mockReset();
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
        act(() => result.current.stopOnClose());
        expect(cancel).toHaveBeenCalledTimes(1);

        await act(async () => {
            finish({ kind: 'cancelled' });
            await running;
        });
        expect(shareFile).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
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
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        let running: Promise<void> = Promise.resolve();
        act(() => {
            running = result.current.runAll([image, second, sending]);
        });
        const first = { action: 'save', progress: null, step: { current: 1, total: 2 } };
        expect(result.current.busyFor('u-1')).toEqual(first);
        expect(result.current.busyFor('u-2')).toEqual(first);
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

    it('saves a video through the photo library and says it saved a video', async () => {
        capable();
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => result.current.run('save', clip));

        expect(saveToPhotoLibrary).toHaveBeenCalledWith(file.uri);
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.export.savedVideo' });
    });

    it('counts as savable only what is sent and drawn', () => {
        capable();
        const broken = { ...second, broken: true };
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        expect(result.current.savable([image, sending, broken, clip])).toEqual([image, clip]);
    });

    it('counts items rather than photos when a save all has a video in it', async () => {
        capable();
        start = instant([]);
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => result.current.runAll([image, clip]));

        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.export.savedAllItems:{"n":2}' });
    });

    it('shows which item a save all is on', async () => {
        capable();
        const finishes: Array<(result: DownloadResult) => void> = [];
        start = () => ({
            transferId: `d-${finishes.length + 1}`,
            result: new Promise<DownloadResult>(resolve => finishes.push(resolve)),
            cancel,
        });
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        let all: Promise<void> = Promise.resolve();
        act(() => {
            all = result.current.runAll([image, clip]);
        });
        await act(async () => {
            finishes[0]({ kind: 'file', file });
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(result.current.busyFor('v-1')?.step).toEqual({ current: 2, total: 2 });
        await act(async () => {
            finishes[1]({ kind: 'file', file });
            await all;
        });
    });

    it('finishes the current item of a save all when the viewer closes, and stops there', async () => {
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
            all = result.current.runAll([image, second, clip]);
        });
        act(() => result.current.stopOnClose());
        await act(async () => {
            finish({ kind: 'file', file });
            await all;
        });

        expect(cancel).not.toHaveBeenCalled();
        expect(urls).toEqual([image.url]);
        expect(saveToPhotoLibrary).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.export.savedAll:{"n":1}' });
    });
});

describe('useImageExports in a browser', () => {
    const bytes = new Blob(['jpeg'], { type: 'image/jpeg' });

    beforeEach(() => {
        filesKind = 'browser';
        fetchInBrowser.mockResolvedValue({ kind: 'blob', blob: bytes });
        shareFileInBrowser.mockResolvedValue('shared');
    });

    it('offers save and share without a handshake, but never save all', () => {
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        expect(result.current.canExport).toBe(true);
        expect(result.current.canShare).toBe(true);
        expect(result.current.canSaveAll).toBe(false);
    });

    it('leaves share out where the browser cannot share files', () => {
        browserShares = false;
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        expect(result.current.canShare).toBe(false);
    });

    it('fetches the original and hands it to the browser as a download, with no shell call or toast', async () => {
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => result.current.run('save', image));

        expect(fetchInBrowser).toHaveBeenCalledWith(image.url, expect.anything());
        expect(saveBlob).toHaveBeenCalledWith(bytes, 'photo.jpg');
        expect(saveToPhotoLibrary).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
        expect(result.current.busyFor('u-1')).toBeUndefined();
    });

    it('shares the fetched bytes on the browser sheet', async () => {
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => result.current.run('share', image));

        expect(shareFileInBrowser).toHaveBeenCalledWith(bytes, 'photo.jpg');
        expect(shareFile).not.toHaveBeenCalled();
    });

    it('keeps the bytes when the browser wants a fresh tap, and shares them on the next one without fetching', async () => {
        shareFileInBrowser.mockResolvedValueOnce('needs-gesture').mockResolvedValueOnce('shared');
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => result.current.run('share', image));
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.browserShare.again' });

        await act(() => result.current.run('share', image));
        expect(fetchInBrowser).toHaveBeenCalledTimes(1);
        expect(shareFileInBrowser).toHaveBeenCalledTimes(2);
    });

    it('saves the bytes a refused share already fetched, without fetching again', async () => {
        shareFileInBrowser.mockResolvedValueOnce('needs-gesture');
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => result.current.run('share', image));
        await act(() => result.current.run('save', image));

        expect(fetchInBrowser).toHaveBeenCalledTimes(1);
        expect(saveBlob).toHaveBeenCalledWith(bytes, 'photo.jpg');
    });

    it('signs an expired address again through the item’s own message when it names one', async () => {
        fetchInBrowser.mockResolvedValueOnce({ kind: 'expired' });
        getChat.mockResolvedValue({ upload$$: [{ id: 'u-1', orgUrl: 'https://bucket/fresh' }] });
        const { result } = renderHook(() => useImageExports({ cid: 'c' }));

        await act(() => result.current.run('save', { ...image, chatId: 'other' }));

        expect(getChat).toHaveBeenCalledWith({ id: 'other' });
        expect(fetchInBrowser).toHaveBeenLastCalledWith('https://bucket/fresh', expect.anything());
    });

    it('finishes the item under way and starts no more when the list goes', async () => {
        let finish: (result: unknown) => void = () => undefined;
        fetchInBrowser.mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
        const { result, unmount } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        let running: Promise<void> = Promise.resolve();
        act(() => {
            running = result.current.runAll([image, second]);
        });
        unmount();
        await act(async () => {
            finish({ kind: 'blob', blob: bytes });
            await running;
        });

        expect(saveBlob).toHaveBeenCalledTimes(1);
        expect(fetchInBrowser).toHaveBeenCalledTimes(1);
    });

    it('keeps the bytes when the iOS share sheet refuses a save, and saves them on the next press', async () => {
        saveBlob.mockResolvedValueOnce('needs-gesture').mockResolvedValueOnce('saved');
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => result.current.run('save', image));
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.browserShare.again' });

        await act(() => result.current.run('save', image));
        expect(fetchInBrowser).toHaveBeenCalledTimes(1);
        expect(saveBlob).toHaveBeenCalledTimes(2);
    });

    it('says so when the original cannot be fetched', async () => {
        fetchInBrowser.mockResolvedValue({ kind: 'failed' });
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => result.current.run('save', clip));

        expect(saveBlob).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.export.failedVideo', variant: 'destructive' });
    });

    it('does not share where the browser cannot', async () => {
        browserShares = false;
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => result.current.run('share', image));

        expect(fetchInBrowser).not.toHaveBeenCalled();
    });

    it('saves a selection one by one and reports once when some failed', async () => {
        fetchInBrowser.mockResolvedValueOnce({ kind: 'blob', blob: bytes }).mockResolvedValueOnce({ kind: 'failed' });
        const { result } = renderHook(() => useImageExports({ cid: 'c', chatId: 'm' }));

        await act(() => result.current.runAll([image, second]));

        expect(saveBlob).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.export.failed', variant: 'destructive' });
    });
});
