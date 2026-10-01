import type { OnFileTransferStatePayload } from '@chatic/app-messages';
import type { PutPort } from '@chatic/data';
import { createNativeTransfers, toPutResult, type TransferBridge } from './nativePut';
import { syncFileTransfers } from './transferSync';

type Listener = (message: { data: OnFileTransferStatePayload }) => void;

/**
 * A shell that answers each request type from a table and lets the test push transfer states.
 * An answer that is an Error is thrown, the way the bridge rejects.
 */
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
            listener({ data: { direction: 'upload', state: 'running', transferredBytes: 0, totalBytes: 0, ...state } })
        );
    return { bridge: bridge as unknown as TransferBridge & typeof bridge, requests, emit, listeners };
};

const notFound = () => Object.assign(new Error('no handler'), { code: 'NOT_FOUND' });

const target = {
    url: 'https://bucket.s3.amazonaws.com/k?X-Amz-Signature=s',
    headers: { 'content-type': 'image/jpeg' },
};
const file = new File(['abc'], 'a.jpg', { type: 'image/jpeg' });

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** Waits until the sender has asked the shell for `type` — reading the file takes several turns. */
const untilRequested = async (requests: Array<{ type: string }>, type: string) => {
    for (let i = 0; i < 200 && !requests.some(request => request.type === type); i++) await flush();
    if (!requests.some(request => request.type === type)) throw new Error(`${type} was never requested`);
};

const setup = (answers?: Record<string, unknown>) => {
    const shell = createShell({
        WriteTempFile: { uri: 'file:///tmp/a.jpg' },
        StartFileTransfer: (data: { transferId: string }) => ({ transferId: data.transferId }),
        AckFileTransfers: { remaining: 0 },
        ...answers,
    });
    const fallback = jest.fn<ReturnType<PutPort>, Parameters<PutPort>>(async () => ({
        kind: 'responded',
        httpStatus: 200,
    }));
    let next = 0;
    const transfers = createNativeTransfers({
        bridge: shell.bridge,
        fallback,
        newTransferId: () => `t-${++next}`,
    });
    return { ...shell, fallback, transfers };
};

describe('toPutResult', () => {
    const state = (patch: Partial<OnFileTransferStatePayload>): OnFileTransferStatePayload => ({
        transferId: 't',
        direction: 'upload',
        state: 'responded',
        transferredBytes: 0,
        totalBytes: 0,
        ...patch,
    });

    it.each([
        [state({ state: 'responded', httpStatus: 200 }), { kind: 'responded', httpStatus: 200 }],
        [
            state({ state: 'responded', httpStatus: 403, providerCode: 'AccessDenied' }),
            { kind: 'responded', httpStatus: 403, providerCode: 'AccessDenied' },
        ],
        [state({ state: 'failed', errorCode: 'NETWORK' }), { kind: 'no-response', reason: 'network' }],
        [state({ state: 'failed', errorCode: 'SOURCE' }), { kind: 'no-response', reason: 'source' }],
        [state({ state: 'failed', errorCode: 'SYSTEM' }), { kind: 'no-response', reason: 'system' }],
        [state({ state: 'failed', errorCode: 'INVALID' }), { kind: 'no-response', reason: 'system' }],
        [state({ state: 'failed', errorCode: 'INTERNAL' }), { kind: 'no-response', reason: 'system' }],
        [state({ state: 'cancelled' }), { kind: 'no-response', reason: 'system' }],
    ])('maps %j', (input, expected) => {
        expect(toPutResult(input)).toEqual(expected);
    });
});

describe('createNativeTransfers', () => {
    it('writes a temp file, starts an upload with its length, and resolves on the terminal state', async () => {
        const { transfers, requests, emit } = setup();

        const result = transfers.put(target, file, 'slot-0/original');
        await untilRequested(requests, 'StartFileTransfer');
        emit({ transferId: 't-1', state: 'running', transferredBytes: 1 });
        emit({ transferId: 't-1', state: 'responded', httpStatus: 200 });

        await expect(result).resolves.toEqual({ kind: 'responded', httpStatus: 200 });
        expect(requests[0]).toEqual({ type: 'WriteTempFile', data: { base64: btoa('abc'), fileName: 'a.jpg' } });
        expect(requests[1]).toEqual({
            type: 'StartFileTransfer',
            data: {
                transferId: 't-1',
                direction: 'upload',
                url: target.url,
                method: 'PUT',
                headers: target.headers,
                file: { uri: 'file:///tmp/a.jpg', contentType: 'image/jpeg', contentLength: 3 },
            },
        });
    });

    it('acknowledges the transfer once it has ended', async () => {
        const { transfers, requests, emit } = setup();

        const result = transfers.put(target, file, 'slot-0/original');
        await untilRequested(requests, 'StartFileTransfer');
        emit({ transferId: 't-1', state: 'failed', errorCode: 'NETWORK' });
        await result;
        await untilRequested(requests, 'AckFileTransfers');

        expect(requests.at(-1)).toEqual({ type: 'AckFileTransfers', data: { transferIds: ['t-1'] } });
    });

    it('ignores states of transfers it did not start', async () => {
        const { transfers, requests, emit } = setup();

        emit({ transferId: 'someone-else', state: 'responded', httpStatus: 200 });
        await flush();

        expect(requests).toEqual([]);
        expect(transfers.waiting()).toEqual([]);
    });

    it.each(['WriteTempFile', 'StartFileTransfer'])(
        'falls back to the page PUT when %s is NOT_FOUND, and stays there for the session',
        async failing => {
            const { transfers, fallback, bridge } = setup({ [failing]: notFound() });

            await expect(transfers.put(target, file, 'slot-0/original')).resolves.toEqual({
                kind: 'responded',
                httpStatus: 200,
            });
            const requestsAfterFirst = bridge.request.mock.calls.length;
            await transfers.put(target, file, 'slot-1/original');

            expect(fallback).toHaveBeenCalledTimes(2);
            expect(fallback).toHaveBeenCalledWith(target, file, 'slot-0/original');
            expect(transfers.usesFallback()).toBe(true);
            // The second PUT never asked the shell anything.
            expect(bridge.request.mock.calls.length).toBe(requestsAfterFirst);
            expect(transfers.waiting()).toEqual([]);
        }
    );

    it('reports a refused start as a system failure and does not fall back', async () => {
        const invalid = Object.assign(new Error('bad request'), { code: 'INVALID' });
        const { transfers, fallback } = setup({ StartFileTransfer: invalid });

        await expect(transfers.put(target, file, 'slot-0/original')).resolves.toEqual({
            kind: 'no-response',
            reason: 'system',
        });
        expect(fallback).not.toHaveBeenCalled();
        expect(transfers.usesFallback()).toBe(false);
    });

    it('reports a temp file the shell could not write as a source failure', async () => {
        const failedWrite = Object.assign(new Error('disk full'), { code: 'SOURCE' });
        const { transfers } = setup({ WriteTempFile: failedWrite });

        await expect(transfers.put(target, file, 'slot-0/original')).resolves.toEqual({
            kind: 'no-response',
            reason: 'source',
        });
    });

    it('writes one temp file at a time, while the transfers themselves overlap', async () => {
        let inWrite = 0;
        let peak = 0;
        const { transfers, requests, emit } = setup({
            WriteTempFile: () => {
                peak = Math.max(peak, ++inWrite);
                return new Promise(resolve =>
                    setTimeout(() => {
                        inWrite--;
                        resolve({ uri: 'file:///tmp/x' });
                    }, 5)
                );
            },
        });

        const a = transfers.put(target, file, 'slot-0/original');
        const b = transfers.put(target, file, 'slot-1/original');
        for (let i = 0; i < 200 && requests.filter(r => r.type === 'StartFileTransfer').length < 2; i++) await flush();
        emit({ transferId: 't-1', state: 'responded', httpStatus: 200 });
        emit({ transferId: 't-2', state: 'responded', httpStatus: 200 });

        await Promise.all([a, b]);
        expect(peak).toBe(1);
    });

    it('stops listening when disposed, and settles what it was still waiting on', async () => {
        const { transfers, requests, listeners } = setup();
        const result = transfers.put(target, file, 'slot-0/original');
        await untilRequested(requests, 'StartFileTransfer');

        transfers.dispose();

        expect(listeners).toHaveLength(0);
        await expect(result).resolves.toEqual({ kind: 'no-response', reason: 'system' });
    });

    it('stops listening when disposed', () => {
        const { transfers, listeners } = setup();

        transfers.dispose();

        expect(listeners).toHaveLength(0);
    });
});

describe('syncFileTransfers', () => {
    it('settles a waiting upload from the held list and acknowledges every ended transfer, known or not', async () => {
        const { transfers, bridge, requests } = setup();
        const result = transfers.put(target, file, 'slot-0/original');
        await untilRequested(requests, 'StartFileTransfer');
        (bridge.request as jest.Mock).mockImplementationOnce(async message => {
            requests.push(message);
            return {
                data: {
                    transfers: [
                        {
                            transferId: 't-1',
                            direction: 'upload',
                            state: 'responded',
                            httpStatus: 412,
                            transferredBytes: 3,
                            totalBytes: 3,
                        },
                        {
                            transferId: 'from-a-reloaded-page',
                            direction: 'upload',
                            state: 'responded',
                            httpStatus: 200,
                            transferredBytes: 1,
                            totalBytes: 1,
                        },
                        {
                            transferId: 'still-going',
                            direction: 'upload',
                            state: 'running',
                            transferredBytes: 1,
                            totalBytes: 9,
                        },
                    ],
                },
            };
        });

        await syncFileTransfers(bridge, transfers);

        await expect(result).resolves.toEqual({ kind: 'responded', httpStatus: 412 });
        expect(requests.at(-1)).toEqual({
            type: 'AckFileTransfers',
            data: { transferIds: ['t-1', 'from-a-reloaded-page'] },
        });
    });

    it('leaves downloads to their own reader: neither settled nor acknowledged', async () => {
        const { transfers, bridge, requests } = setup({
            ListFileTransfers: {
                transfers: [
                    {
                        transferId: 'a-download',
                        direction: 'download',
                        state: 'responded',
                        httpStatus: 200,
                        transferredBytes: 3,
                        totalBytes: 3,
                        file: { uri: 'file:///cache/transfer-download/x/a.jpg', size: 3, contentType: 'image/jpeg' },
                    },
                    {
                        transferId: 'an-upload',
                        direction: 'upload',
                        state: 'responded',
                        httpStatus: 200,
                        transferredBytes: 1,
                        totalBytes: 1,
                    },
                ],
            },
        });

        await syncFileTransfers(bridge, transfers);

        expect(requests.at(-1)).toEqual({ type: 'AckFileTransfers', data: { transferIds: ['an-upload'] } });
    });

    it('fails an upload the shell accepted but no longer holds', async () => {
        const { transfers, bridge } = setup({ ListFileTransfers: { transfers: [] } });
        const result = transfers.put(target, file, 'slot-0/original');
        for (let i = 0; i < 200 && transfers.waiting().length === 0; i++) await flush();

        await syncFileTransfers(bridge, transfers);

        await expect(result).resolves.toEqual({ kind: 'no-response', reason: 'system' });
    });

    it('does not fail an upload whose start the shell has not answered yet', async () => {
        let accept: () => void = () => undefined;
        const { transfers, bridge, requests, emit } = setup({
            StartFileTransfer: (data: { transferId: string }) =>
                new Promise(resolve => (accept = () => resolve({ transferId: data.transferId }))),
            ListFileTransfers: { transfers: [] },
        });
        const result = transfers.put(target, file, 'slot-0/original');
        await untilRequested(requests, 'StartFileTransfer');

        await syncFileTransfers(bridge, transfers);
        accept();
        await flush();
        emit({ transferId: 't-1', state: 'responded', httpStatus: 200 });

        await expect(result).resolves.toEqual({ kind: 'responded', httpStatus: 200 });
    });

    it('does nothing on a shell without the transfer module', async () => {
        const { transfers, bridge } = setup({ ListFileTransfers: notFound() });

        await expect(syncFileTransfers(bridge, transfers)).resolves.toBeUndefined();
        expect(bridge.request).toHaveBeenCalledTimes(1);
    });

    it('does not ask at all once the page uses the fallback', async () => {
        const { transfers, bridge } = setup({ WriteTempFile: notFound() });
        await transfers.put(target, file, 'slot-0/original');
        bridge.request.mockClear();

        await syncFileTransfers(bridge, transfers);

        expect(bridge.request).not.toHaveBeenCalled();
    });
});
