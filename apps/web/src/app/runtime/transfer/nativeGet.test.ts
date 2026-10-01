import type { OnFileTransferStatePayload } from '@chatic/app-messages';

import { createNativeDownloads, toDownloadResult, type DownloadBridge } from './nativeGet';

type Listener = (message: { data: OnFileTransferStatePayload }) => void;

/** A shell that answers each request type from a table and lets the test push transfer states. */
const createShell = (answers: Record<string, unknown | ((data: any) => unknown)> = {}) => {
    const listeners: Listener[] = [];
    const requests: Array<{ type: string; data: any }> = [];
    const bridge = {
        request: jest.fn(async (message: { type: string; data: any }) => {
            requests.push(message);
            const answer = answers[message.type];
            const value = await (typeof answer === 'function'
                ? (answer as (data: any) => unknown)(message.data)
                : answer);
            if (value instanceof Error) throw value;
            return { data: value };
        }),
        onEvent: jest.fn((_type: string, listener: Listener) => {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
        }),
    };
    const emit = (state: Partial<OnFileTransferStatePayload> & { transferId: string }) =>
        listeners.forEach(listener =>
            listener({
                data: {
                    direction: 'download',
                    state: 'running',
                    transferredBytes: 0,
                    totalBytes: 0,
                    ...state,
                } as OnFileTransferStatePayload,
            })
        );
    return { bridge: bridge as unknown as DownloadBridge & typeof bridge, requests, emit, listeners };
};

const notFound = () => Object.assign(new Error('no handler'), { code: 'NOT_FOUND' });

const file = { uri: 'file:///cache/transfer-download/h/photo.jpg', size: 3, contentType: 'image/jpeg' };
const url = 'https://bucket.s3.amazonaws.com/k?X-Amz-Signature=s';

/** Lets pending bridge replies land. Works under fake timers: it only waits on promises. */
const settle = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
};

const setup = (answers?: Record<string, unknown>, stallMs = 30_000) => {
    const shell = createShell({
        StartFileTransfer: (data: { transferId: string }) => ({ transferId: data.transferId }),
        CancelFileTransfer: {},
        AckFileTransfers: { remaining: 0 },
        ...answers,
    });
    let next = 0;
    const downloads = createNativeDownloads({ bridge: shell.bridge, newTransferId: () => `d-${++next}`, stallMs });
    const acks = () =>
        shell.requests.filter(request => request.type === 'AckFileTransfers').map(r => r.data.transferIds);
    return { ...shell, downloads, acks };
};

describe('toDownloadResult', () => {
    const base = { transferId: 'd', direction: 'download' as const, transferredBytes: 0, totalBytes: 0 };

    it('reads a 2xx with a file as the file, and a 2xx without one as the file lost', () => {
        expect(toDownloadResult({ ...base, state: 'responded', httpStatus: 200, file })).toEqual({
            kind: 'file',
            file,
        });
        expect(toDownloadResult({ ...base, state: 'responded', httpStatus: 200 })).toEqual({
            kind: 'failed',
            reason: 'source',
        });
    });

    it('keeps any other status with its storage code', () => {
        expect(
            toDownloadResult({ ...base, state: 'responded', httpStatus: 403, providerCode: 'AccessDenied' })
        ).toEqual({
            kind: 'responded',
            httpStatus: 403,
            providerCode: 'AccessDenied',
        });
    });

    it('maps failure codes and cancellation', () => {
        expect(toDownloadResult({ ...base, state: 'failed', errorCode: 'NETWORK' })).toEqual({
            kind: 'failed',
            reason: 'network',
        });
        expect(toDownloadResult({ ...base, state: 'failed', errorCode: 'SYSTEM' })).toEqual({
            kind: 'failed',
            reason: 'system',
        });
        expect(toDownloadResult({ ...base, state: 'failed', errorCode: 'INVALID' })).toEqual({
            kind: 'failed',
            reason: 'other',
        });
        expect(toDownloadResult({ ...base, state: 'cancelled' })).toEqual({ kind: 'cancelled' });
    });
});

describe('createNativeDownloads', () => {
    afterEach(() => jest.useRealTimers());

    it('asks for a GET download with only a name hint — never a path', async () => {
        const { downloads, requests } = setup();

        downloads.start({ url, name: 'photo.jpg', title: 'photo.jpg' });
        await settle();

        expect(requests[0]).toEqual({
            type: 'StartFileTransfer',
            data: {
                transferId: 'd-1',
                direction: 'download',
                url,
                method: 'GET',
                title: 'photo.jpg',
                file: { name: 'photo.jpg' },
            },
        });
        expect(requests[0].data.file).not.toHaveProperty('uri');
    });

    it('resolves a 2xx with its file and leaves the acknowledgement to the caller', async () => {
        const { downloads, emit, acks } = setup();
        const download = downloads.start({ url });
        await settle();

        emit({ transferId: download.transferId, state: 'responded', httpStatus: 200, file });

        await expect(download.result).resolves.toEqual({ kind: 'file', file });
        expect(acks()).toEqual([]);
    });

    it('resolves a 403 as responded and acknowledges it, since it brought nothing to keep', async () => {
        const { downloads, emit, acks } = setup();
        const download = downloads.start({ url });
        await settle();

        emit({ transferId: download.transferId, state: 'responded', httpStatus: 403, providerCode: 'AccessDenied' });

        await expect(download.result).resolves.toEqual({
            kind: 'responded',
            httpStatus: 403,
            providerCode: 'AccessDenied',
        });
        await settle();
        expect(acks()).toEqual([['d-1']]);
    });

    it('settles from a state that arrives before the start is answered', async () => {
        const { downloads, emit } = setup({
            StartFileTransfer: () => new Promise(() => undefined),
        });
        const download = downloads.start({ url });

        emit({ transferId: download.transferId, state: 'failed', errorCode: 'NETWORK' });

        await expect(download.result).resolves.toEqual({ kind: 'failed', reason: 'network' });
    });

    it('reads NOT_FOUND on start as an app that cannot download', async () => {
        const { downloads } = setup({ StartFileTransfer: notFound() });

        await expect(downloads.start({ url }).result).resolves.toEqual({ kind: 'unsupported' });
    });

    it('cancels a start that was never answered, since the shell may have begun it', async () => {
        const { downloads, requests, emit, acks } = setup({
            StartFileTransfer: Object.assign(new Error('late'), { code: 'TIMEOUT' }),
        });
        const download = downloads.start({ url });

        await expect(download.result).resolves.toEqual({ kind: 'failed', reason: 'other' });
        await settle();
        expect(requests.at(-1)).toEqual({ type: 'CancelFileTransfer', data: { transferId: 'd-1' } });
        emit({ transferId: 'd-1', state: 'cancelled' });
        await settle();
        expect(acks()).toEqual([['d-1']]);
    });

    it('ignores upload states with the same id', async () => {
        const { downloads, emit } = setup();
        const download = downloads.start({ url });
        await settle();
        let settled = false;
        void download.result.then(() => (settled = true));

        emit({ transferId: download.transferId, direction: 'upload', state: 'responded', httpStatus: 200 });
        await settle();

        expect(settled).toBe(false);
    });

    it('reports progress', async () => {
        const onProgress = jest.fn();
        const { downloads, emit } = setup();
        const download = downloads.start({ url, onProgress });
        await settle();

        emit({ transferId: download.transferId, transferredBytes: 5, totalBytes: 10 });

        expect(onProgress).toHaveBeenLastCalledWith({ transferredBytes: 5, totalBytes: 10 });
    });

    it('cancels a download that moves no byte for the stall window', async () => {
        jest.useFakeTimers();
        const { downloads, requests, emit, acks } = setup(undefined, 1_000);
        const download = downloads.start({ url });
        await settle();

        jest.advanceTimersByTime(1_000);

        await expect(download.result).resolves.toEqual({ kind: 'stalled' });
        expect(requests.at(-1)).toEqual({ type: 'CancelFileTransfer', data: { transferId: 'd-1' } });

        // The shell's own cancelled state is acknowledged when it comes.
        emit({ transferId: 'd-1', state: 'cancelled' });
        await settle();
        expect(acks()).toEqual([['d-1']]);
    });

    it('does not cancel a download the shell finished while the page’s timer ran out', async () => {
        jest.useFakeTimers();
        const { downloads, requests } = setup(
            {
                ListFileTransfers: {
                    transfers: [
                        {
                            transferId: 'd-1',
                            direction: 'download',
                            state: 'responded',
                            httpStatus: 200,
                            transferredBytes: 3,
                            totalBytes: 3,
                            file,
                        },
                    ],
                },
            },
            1_000
        );
        const download = downloads.start({ url });
        await settle();

        // The app was away: the timer is overdue, and the terminal event has not been delivered yet.
        jest.advanceTimersByTime(1_000);

        await expect(download.result).resolves.toEqual({ kind: 'file', file });
        expect(requests.some(request => request.type === 'CancelFileTransfer')).toBe(false);
    });

    it('starts the window again when the shell reports bytes the page did not hear about', async () => {
        jest.useFakeTimers();
        const { downloads, requests } = setup(
            {
                ListFileTransfers: {
                    transfers: [
                        {
                            transferId: 'd-1',
                            direction: 'download',
                            state: 'running',
                            transferredBytes: 2,
                            totalBytes: 9,
                        },
                    ],
                },
            },
            1_000
        );
        downloads.start({ url });
        await settle();

        jest.advanceTimersByTime(1_000);
        await settle();

        expect(requests.some(request => request.type === 'CancelFileTransfer')).toBe(false);
    });

    it('starts the stall window again whenever bytes move', async () => {
        jest.useFakeTimers();
        const { downloads, emit } = setup(undefined, 1_000);
        const download = downloads.start({ url });
        await settle();
        let result: unknown;
        void download.result.then(value => (result = value));

        jest.advanceTimersByTime(900);
        emit({ transferId: download.transferId, transferredBytes: 1 });
        jest.advanceTimersByTime(900);
        emit({ transferId: download.transferId, transferredBytes: 2 });
        jest.advanceTimersByTime(900);
        await settle();
        expect(result).toBeUndefined();

        // A repeated state with the same count is not progress.
        emit({ transferId: download.transferId, transferredBytes: 2 });
        jest.advanceTimersByTime(100);
        await settle();
        expect(result).toEqual({ kind: 'stalled' });
    });

    it('cancels on request, and acknowledges the shell’s cancelled state when it comes', async () => {
        const { downloads, requests, emit, acks } = setup();
        const download = downloads.start({ url });
        await settle();

        download.cancel();

        await expect(download.result).resolves.toEqual({ kind: 'cancelled' });
        expect(requests.at(-1)).toEqual({ type: 'CancelFileTransfer', data: { transferId: 'd-1' } });
        emit({ transferId: 'd-1', state: 'cancelled' });
        await settle();
        expect(acks()).toEqual([['d-1']]);
    });

    it('acknowledges only the ids it is given', async () => {
        const { downloads, acks } = setup();

        await downloads.acknowledge(['d-1']);
        await downloads.acknowledge([]);

        expect(acks()).toEqual([['d-1']]);
    });

    describe('sync', () => {
        const held = (transfers: Array<Partial<OnFileTransferStatePayload> & { transferId: string }>) => ({
            transfers: transfers.map(state => ({
                direction: 'download',
                state: 'responded',
                transferredBytes: 0,
                totalBytes: 0,
                ...state,
            })),
        });

        it('settles a waiting download from the list and acknowledges ended downloads nobody waits for', async () => {
            const { downloads, acks } = setup({
                ListFileTransfers: held([
                    { transferId: 'd-1', httpStatus: 200, file },
                    { transferId: 'from-a-reloaded-page', httpStatus: 200, file },
                    { transferId: 'still-going', state: 'running' },
                    { transferId: 'an-upload', direction: 'upload', httpStatus: 200 },
                ]),
            });
            const download = downloads.start({ url });
            await settle();

            await downloads.sync();

            await expect(download.result).resolves.toEqual({ kind: 'file', file });
            expect(acks()).toEqual([['from-a-reloaded-page']]);
        });

        it('fails a download the shell accepted but no longer holds', async () => {
            const { downloads } = setup({ ListFileTransfers: held([]) });
            const download = downloads.start({ url });
            await settle();

            await downloads.sync();

            await expect(download.result).resolves.toEqual({ kind: 'failed', reason: 'system' });
        });

        it('does not fail a download whose start the shell has not answered yet', async () => {
            let accept: () => void = () => undefined;
            const { downloads, emit } = setup({
                StartFileTransfer: (data: { transferId: string }) =>
                    new Promise(resolve => (accept = () => resolve({ transferId: data.transferId }))),
                ListFileTransfers: held([]),
            });
            const download = downloads.start({ url });

            await downloads.sync();
            accept();
            await settle();
            emit({ transferId: download.transferId, state: 'responded', httpStatus: 200, file });

            await expect(download.result).resolves.toEqual({ kind: 'file', file });
        });

        it('acknowledges an abandoned download that ended while the page was away', async () => {
            const { downloads, acks, bridge } = setup({
                CancelFileTransfer: Object.assign(new Error('done'), { code: 'NOT_FOUND' }),
            });
            const download = downloads.start({ url });
            await settle();
            download.cancel();
            await settle();
            (bridge.request as jest.Mock).mockImplementationOnce(async () => ({
                data: held([{ transferId: 'd-1', httpStatus: 200, file }]),
            }));

            await downloads.sync();
            await settle();

            expect(acks()).toEqual([['d-1']]);
        });

        it('does nothing on a shell without the transfer module', async () => {
            const { downloads, acks } = setup({ ListFileTransfers: notFound() });

            await expect(downloads.sync()).resolves.toBeUndefined();
            expect(acks()).toEqual([]);
        });
    });
});
