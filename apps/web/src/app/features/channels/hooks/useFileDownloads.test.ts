import { act, renderHook } from '@testing-library/react';
import type { ReactElement } from 'react';

import type { ChatFileSlot } from '@chatic/data';

import type { DownloadProgress, DownloadResult } from '../../../runtime/transfer';
import { resetFileDownloads, useFileDownloads } from './useFileDownloads';

const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => toast(arg) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let native = true;
const request = jest.fn();
jest.mock('@chatic/bridges', () => ({
    isNative: () => native,
    logger: { error: jest.fn() },
    webClient: { request: (message: unknown, options: unknown) => request(message, options) },
}));

const shareFile = jest.fn();
const openSettings = jest.fn();
jest.mock('../../../bridge/appBridge', () => ({
    appBridge: {
        shareFile: (uri: string, title?: string) => shareFile(uri, title),
        openSettings: () => openSettings(),
    },
}));

interface Started {
    url: string;
    onProgress?: (progress: DownloadProgress) => void;
    finish: (result: DownloadResult) => void;
}
const started: Started[] = [];
const cancel = jest.fn();
const acknowledge = jest.fn(async (_ids: string[]) => undefined);
/** Downloads finish at once with `autoResult` unless it is `null`; then the test finishes them. */
let autoResult: DownloadResult | null;
jest.mock('../../../bridge/shellDownload', () => ({
    getShellDownloads: () => ({
        start: (input: { url: string; onProgress?: (progress: DownloadProgress) => void }) => {
            let finish: (result: DownloadResult) => void = () => undefined;
            const result = new Promise<DownloadResult>(resolve => (finish = resolve));
            started.push({ url: input.url, onProgress: input.onProgress, finish });
            if (autoResult) finish(autoResult);
            return { transferId: `d-${started.length}`, result, cancel: () => cancel(finish) };
        },
        acknowledge: (ids: string[]) => acknowledge(ids),
    }),
}));

const getChat = jest.fn();
jest.mock('@chatic/app-runtime', () => ({
    runtime: { data: { getCloudRepositories: () => ({ chat: { getChat: (input: unknown) => getChat(input) } }) } },
}));

const downloadInBrowser = jest.fn();
jest.mock('../lib/fileDownload', () => ({
    downloadInBrowser: (...args: unknown[]) => downloadInBrowser(...args),
}));

const shellFile = { uri: 'file:///cache/transfer-download/d-1/report.pdf', size: 3, contentType: 'application/pdf' };
const doc: ChatFileSlot = {
    key: 'c/u-1',
    uploadId: 'u-1',
    name: 'report.pdf',
    url: 'https://bucket/old',
    state: 'ready',
};
const other: ChatFileSlot = { ...doc, key: 'c/u-2', uploadId: 'u-2', name: 'b.pdf' };

const failure = (code: string) => Object.assign(new Error(code), { code });
/** Answers the page's `OpenFile` / `SaveFile` requests by type. */
const answer = (handlers: Partial<Record<'OpenFile' | 'SaveFile', () => Promise<unknown>>>) =>
    request.mockImplementation((message: { type: 'OpenFile' | 'SaveFile' }) =>
        (handlers[message.type] ?? (async () => ({ data: {} })))()
    );
const sent = (type: string) =>
    request.mock.calls.filter(([message]) => (message as { type: string }).type === type).map(([message]) => message);

const render = () => renderHook(() => useFileDownloads({ cid: 'c', chatId: 'm' }));

beforeEach(() => {
    native = true;
    autoResult = { kind: 'file', file: shellFile };
    started.length = 0;
    toast.mockClear();
    cancel.mockReset();
    acknowledge.mockClear();
    request.mockReset();
    answer({ SaveFile: async () => ({ data: { saved: true, location: 'Download/DoU/report.pdf' } }) });
    shareFile.mockReset().mockResolvedValue({ data: { completed: true } });
    openSettings.mockClear();
    getChat.mockReset();
    downloadInBrowser.mockReset().mockResolvedValue('saved');
    resetFileDownloads();
});

describe('useFileDownloads in a browser', () => {
    beforeEach(() => {
        native = false;
    });

    it('fetches and saves the file from the button and from the card body', async () => {
        const { result } = render();

        await act(() => result.current.download(doc));
        await act(() => result.current.open(doc));

        expect(downloadInBrowser).toHaveBeenCalledTimes(2);
        expect(downloadInBrowser).toHaveBeenCalledWith('https://bucket/old', 'report.pdf', expect.anything());
        expect(request).not.toHaveBeenCalled();
        expect(result.current.stateOf(doc)).toBe('idle');
    });

    it('shows downloading meanwhile and cancels through the fetch signal', async () => {
        let signal: AbortSignal | undefined;
        downloadInBrowser.mockImplementation(
            (_url: string, _name: string, options: { signal: AbortSignal }) =>
                new Promise(resolve => {
                    signal = options.signal;
                    options.signal.addEventListener('abort', () => resolve('cancelled'));
                })
        );
        const { result } = render();

        let running: Promise<void> = Promise.resolve();
        act(() => {
            running = result.current.download(doc);
        });
        expect(result.current.stateOf(doc)).toBe('downloading');
        expect(result.current.progressOf(doc)).toBeNull();

        await act(async () => {
            result.current.cancel(doc);
            await running;
        });
        expect(signal?.aborted).toBe(true);
        expect(result.current.stateOf(doc)).toBe('idle');
        expect(toast).not.toHaveBeenCalled();
    });

    it('re-reads the message on an expired address and says the download failed', async () => {
        downloadInBrowser.mockResolvedValue('expired');
        const { result } = render();

        await act(() => result.current.download(doc));

        expect(getChat).toHaveBeenCalledWith({ id: 'm' });
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'chat.attach.fileCard.downloadFailed' }));
    });

    it('never shares', async () => {
        const { result } = render();
        await act(() => result.current.share(doc));
        expect(shareFile).not.toHaveBeenCalled();
        expect(started).toHaveLength(0);
    });
});

describe('useFileDownloads inside the app', () => {
    it('downloads with progress, saves under the upload name, and turns the card done', async () => {
        autoResult = null;
        const { result } = render();
        expect(result.current.stateOf(doc)).toBe('idle');

        let running: Promise<void> = Promise.resolve();
        act(() => {
            running = result.current.download(doc);
        });
        expect(result.current.stateOf(doc)).toBe('downloading');
        act(() => started[0].onProgress?.({ transferredBytes: 50, totalBytes: 100 }));
        expect(result.current.progressOf(doc)).toBe(0.5);

        await act(async () => {
            started[0].finish({ kind: 'file', file: shellFile });
            await running;
        });

        expect(sent('SaveFile')).toEqual([{ type: 'SaveFile', data: { uri: shellFile.uri, name: 'report.pdf' } }]);
        expect(acknowledge).toHaveBeenCalledWith(['d-1']);
        expect(result.current.stateOf(doc)).toBe('done');
        expect(result.current.progressOf(doc)).toBeNull();
        expect(result.current.stateOf(other)).toBe('idle');
    });

    it('says where it was saved, with an Open action that opens the same file without downloading again', async () => {
        const { result } = render();
        await act(() => result.current.download(doc));

        expect(toast).toHaveBeenCalledTimes(1);
        const shown = toast.mock.calls[0][0] as { title: string; description: string; action: ReactElement };
        expect(shown.title).toBe('chat.attach.fileCard.saved');
        expect(shown.description).toBe('Download/DoU/report.pdf');

        await act(async () => {
            (shown.action.props as { onClick: () => void }).onClick();
            await Promise.resolve();
        });

        expect(sent('OpenFile')).toEqual([{ type: 'OpenFile', data: { uri: shellFile.uri } }]);
        expect(started).toHaveLength(1);
    });

    it('stays quiet when the iOS export sheet is dismissed, and the card is still done', async () => {
        answer({ SaveFile: async () => ({ data: { saved: false } }) });
        const { result } = render();

        await act(() => result.current.download(doc));

        expect(toast).not.toHaveBeenCalled();
        expect(result.current.stateOf(doc)).toBe('done');
    });

    it('opens the card body, and opens a done card from the kept file', async () => {
        const { result } = render();

        await act(() => result.current.open(doc));
        await act(() => result.current.open(doc));

        expect(started).toHaveLength(1);
        expect(sent('OpenFile')).toHaveLength(2);
        expect(sent('OpenFile')[1]).toEqual({ type: 'OpenFile', data: { uri: shellFile.uri } });
        expect(result.current.stateOf(doc)).toBe('done');
    });

    it('offers the share sheet when nothing on the device opens the format', async () => {
        answer({ OpenFile: async () => Promise.reject(failure('NO_HANDLER')) });
        const { result } = render();

        await act(() => result.current.open(doc));

        expect(shareFile).toHaveBeenCalledWith(shellFile.uri, 'report.pdf');
        expect(toast).not.toHaveBeenCalled();
    });

    it('shares from the action sheet, reusing a kept file', async () => {
        const { result } = render();
        await act(() => result.current.open(doc));

        await act(() => result.current.share(doc));

        expect(started).toHaveLength(1);
        expect(shareFile).toHaveBeenCalledWith(shellFile.uri, 'report.pdf');
    });

    it('downloads again once when the OS cleared the kept file', async () => {
        const { result } = render();
        await act(() => result.current.open(doc));
        answer({ OpenFile: jest.fn().mockRejectedValueOnce(failure('SOURCE')).mockResolvedValue({ data: {} }) });

        await act(() => result.current.open(doc));

        expect(started).toHaveLength(2);
        expect(toast).not.toHaveBeenCalled();
        expect(result.current.stateOf(doc)).toBe('done');
    });

    it('reads the message again for a fresh address after a 403, and retries once', async () => {
        autoResult = null;
        getChat.mockResolvedValue({ upload$$: [{ id: 'u-1', status: 'stored', orgUrl: 'https://bucket/fresh' }] });
        const { result } = render();

        let running: Promise<void> = Promise.resolve();
        act(() => {
            running = result.current.download(doc);
        });
        await act(async () => {
            started[0].finish({ kind: 'responded', httpStatus: 403 });
            await new Promise(resolve => setTimeout(resolve, 0));
        });
        expect(getChat).toHaveBeenCalledWith({ id: 'm' });
        expect(started[1]?.url).toBe('https://bucket/fresh');

        await act(async () => {
            started[1].finish({ kind: 'file', file: shellFile });
            await running;
        });
        expect(result.current.stateOf(doc)).toBe('done');
    });

    it('learns an app without SaveFile from its NOT_FOUND and shows every card unavailable', async () => {
        answer({ SaveFile: async () => Promise.reject(failure('NOT_FOUND')) });
        const { result } = render();

        await act(() => result.current.download(doc));

        expect(result.current.stateOf(doc)).toBe('unavailable');
        expect(result.current.stateOf(other)).toBe('unavailable');
        expect(toast).not.toHaveBeenCalled();

        await act(() => result.current.download(other));
        await act(() => result.current.open(other));
        expect(started).toHaveLength(1);
    });

    it('learns an app without OpenFile the same way', async () => {
        answer({ OpenFile: async () => Promise.reject(failure('NOT_FOUND')) });
        const { result } = render();

        await act(() => result.current.open(doc));

        expect(result.current.stateOf(doc)).toBe('unavailable');
    });

    it('says saving needs storage access when Android refused it, with the settings', async () => {
        answer({ SaveFile: async () => Promise.reject(failure('PERMISSION_DENIED')) });
        const { result } = render();

        await act(() => result.current.download(doc));

        const shown = toast.mock.calls[0][0] as { title: string; variant: string; action: ReactElement };
        expect(shown.title).toBe('chat.attach.fileCard.storagePermission');
        expect(shown.variant).toBe('destructive');
        (shown.action.props as { onClick: () => void }).onClick();
        expect(openSettings).toHaveBeenCalled();
    });

    it('says the download failed when the shell brought no file', async () => {
        autoResult = { kind: 'failed', reason: 'network' };
        const { result } = render();

        await act(() => result.current.download(doc));

        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.fileCard.downloadFailed', variant: 'destructive' });
        expect(result.current.stateOf(doc)).toBe('idle');
        expect(request).not.toHaveBeenCalled();
    });

    it('asks for an app update when ShareFile refuses a document', async () => {
        shareFile.mockRejectedValue(failure('UNSUPPORTED_TYPE'));
        const { result } = render();

        await act(() => result.current.share(doc));

        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.fileCard.shareUpdateRequired' });
    });

    it('cancels a download in flight and goes back to idle, silently', async () => {
        autoResult = null;
        cancel.mockImplementation((finish: (result: DownloadResult) => void) => finish({ kind: 'cancelled' }));
        const { result } = render();

        let running: Promise<void> = Promise.resolve();
        act(() => {
            running = result.current.download(doc);
        });
        await act(async () => {
            result.current.cancel(doc);
            await running;
        });

        expect(cancel).toHaveBeenCalled();
        expect(result.current.stateOf(doc)).toBe('idle');
        expect(request).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
    });

    it('ignores a second press while the first is still running', async () => {
        autoResult = null;
        const { result } = render();

        let running: Promise<void> = Promise.resolve();
        act(() => {
            running = result.current.download(doc);
        });
        await act(() => result.current.open(doc));
        expect(started).toHaveLength(1);

        await act(async () => {
            started[0].finish({ kind: 'file', file: shellFile });
            await running;
        });
        expect(sent('OpenFile')).toHaveLength(0);
    });
});
