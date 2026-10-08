import { act, renderHook, waitFor } from '@testing-library/react';

import type { ChatAttachmentSource, DomainChat, SendImageResult, ShellFileRef } from '@chatic/data';

import { makeVideoPoster, prepareChatAttachment } from '@chatic/shared';

import { getCloudRepositories, runInCloud } from '../cloudChat';
import { useSendImages, type PreparedShellVideo, type UseSendImagesInput } from './useSendImages';

jest.mock('../cloudChat', () => ({ getCloudRepositories: jest.fn(), runInCloud: jest.fn() }));

/** The clouds whose socket is held right now, as `runInCloud` would hold them. */
const held: string[] = [];

const mockSendImageMessage = jest.fn();
jest.mock('@chatic/data', () => ({
    ...jest.requireActual('@chatic/data'),
    sendImageMessage: (...args: unknown[]) => mockSendImageMessage(...args),
}));

jest.mock('@chatic/shared', () => ({ prepareChatAttachment: jest.fn(), makeVideoPoster: jest.fn() }));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn() } }));

const put = jest.fn();
const beforeSweep = jest.fn(async () => undefined);
/** The hook as a shell binds it: its PUT and its catch-up are fixed, the room varies. */
const useBound = (room: Omit<UseSendImagesInput, 'put' | 'beforeSweep'>) =>
    useSendImages({ ...room, put, beforeSweep });

const chat = {
    createPendingImageChat: jest.fn(),
    sendPendingImageChat: jest.fn(),
    failPendingImageChat: jest.fn<Promise<undefined>, [string]>(async () => undefined),
    listPendingImageChats: jest.fn(async (): Promise<DomainChat[]> => []),
    startUploads: jest.fn(),
    completeUploads: jest.fn(),
};

let urlSeq = 0;
const revoked: string[] = [];

beforeAll(() => {
    URL.createObjectURL = jest.fn(() => `blob:${++urlSeq}`);
    URL.revokeObjectURL = jest.fn((url: string) => void revoked.push(url));
});

let rowSeq = 0;
beforeEach(() => {
    jest.clearAllMocks();
    revoked.length = 0;
    held.length = 0;
    (getCloudRepositories as jest.Mock).mockReturnValue({ chat });
    (runInCloud as jest.Mock).mockImplementation(
        async (cid: string, work: (repositories: { chat: typeof chat }) => Promise<unknown>) => {
            held.push(cid);
            try {
                return await work({ chat });
            } finally {
                held.splice(held.indexOf(cid), 1);
            }
        }
    );
    chat.createPendingImageChat.mockImplementation(
        async ({ pendingId }: { pendingId?: string }) => pendingId ?? `row-${++rowSeq}`
    );
    chat.listPendingImageChats.mockResolvedValue([]);
    // A browser that cannot draw the frame, unless a test says otherwise.
    (makeVideoPoster as jest.Mock).mockResolvedValue(null);
});

const sent: SendImageResult = { status: 'sent', uploadIds: ['up-1'], failedIndexes: [] };
const failed: SendImageResult = { status: 'failed', reason: 'socket', error: new Error('x') };
const files = () => [new File(['a'], 'a.jpg'), new File(['b'], 'b.jpg')];

const pendingRow = (fields: Partial<DomainChat>): DomainChat =>
    ({ channelId: 'ch-1', chatNo: 0, isPending: true, isFailed: false, createdAtMs: 0, ...fields }) as DomainChat;

describe('useSendImages', () => {
    it("writes, uploads and sends in the room's own cloud, holding its socket for the whole sequence", async () => {
        const heldDuringSend: string[][] = [];
        mockSendImageMessage.mockImplementation(async () => {
            heldDuringSend.push([...held]);
            return sent;
        });
        const { result, unmount } = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(files()));

        expect(getCloudRepositories).toHaveBeenCalledWith('cloud-a');
        expect(runInCloud).toHaveBeenCalledWith('cloud-a', expect.any(Function));
        expect(heldDuringSend).toEqual([['cloud-a']]);
        expect(held).toEqual([]);
        unmount();
    });

    it('waits for the cloud\u2019s socket to come back, inside the hold, before the first request', async () => {
        let reconnect: (verified: boolean) => void = () => undefined;
        const waitForConnection = jest.fn(() => new Promise<boolean>(resolve => (reconnect = resolve)));
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() =>
            useBound({ cid: 'cloud-a', channelId: 'ch-1', waitForConnection })
        );

        let sending: Promise<void> = Promise.resolve();
        act(() => {
            sending = result.current.sendImages(files());
        });
        await waitFor(() => expect(waitForConnection).toHaveBeenCalledWith('cloud-a'));
        expect(held).toEqual(['cloud-a']);
        expect(mockSendImageMessage).not.toHaveBeenCalled();

        await act(async () => {
            reconnect(true);
            await sending;
        });
        expect(mockSendImageMessage).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('still sends when the socket does not come back in time, so the failure is the request\u2019s own', async () => {
        const waitForConnection = jest.fn().mockResolvedValue(false);
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() =>
            useBound({ cid: 'cloud-a', channelId: 'ch-1', waitForConnection })
        );

        await act(() => result.current.sendImages(files()));

        expect(mockSendImageMessage).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('keeps a send addressed to the cloud it was written in when the screen moves to another cloud', async () => {
        let finish: (value: SendImageResult) => void = () => undefined;
        mockSendImageMessage.mockImplementation(() => new Promise(resolve => (finish = resolve)));
        const { result, rerender, unmount } = renderHook(props => useBound(props), {
            initialProps: { cid: 'cloud-a', channelId: 'ch-1' },
        });
        let sending: Promise<void> = Promise.resolve();
        act(() => {
            sending = result.current.sendImages(files());
        });
        await waitFor(() => expect(mockSendImageMessage).toHaveBeenCalled());
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;

        rerender({ cid: 'cloud-b', channelId: 'ch-1' });
        (getCloudRepositories as jest.Mock).mockClear();
        await act(async () => {
            finish(failed);
            await sending;
        });

        expect(runInCloud).toHaveBeenCalledTimes(1);
        expect(runInCloud).toHaveBeenCalledWith('cloud-a', expect.any(Function));
        expect(getCloudRepositories).toHaveBeenCalledWith('cloud-a');
        expect(chat.failPendingImageChat).toHaveBeenCalledWith(pendingId);
        unmount();
    });

    it('writes the pending row first, then runs the sequence bound to this row and this shell', async () => {
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() =>
            useBound({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' })
        );
        const picked = files();

        await act(() => result.current.sendImages(picked));

        expect(chat.createPendingImageChat).toHaveBeenCalledWith({
            channelId: 'ch-1',
            parentId: 'root-1',
            localThumbUrls: expect.arrayContaining([expect.stringMatching(/^blob:/)]),
        });
        const [sentFiles, ports] = mockSendImageMessage.mock.calls[0];
        expect(sentFiles).toEqual(picked);
        sentFiles.forEach((file: File, i: number) => expect(file).toBe(picked[i]));
        const pendingId = chat.createPendingImageChat.mock.results[0].value;
        // A page file goes to the shell's own PUT, untouched.
        put.mockResolvedValueOnce({ kind: 'responded', httpStatus: 200 });
        await ports.put({ url: 'u', headers: {} }, picked[0], 'slot-0/original');
        expect(put).toHaveBeenCalledWith({ url: 'u', headers: {} }, picked[0], 'slot-0/original');
        await ports.send({ uploadIds: ['up-1'] });
        expect(chat.sendPendingImageChat).toHaveBeenCalledWith(await pendingId, { uploadIds: ['up-1'] });
        unmount();
    });

    it('lets the files and previews go once the message is sent', async () => {
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(files()));
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;

        expect(revoked).toHaveLength(2);
        expect(result.current.canRetry(pendingId)).toBe(false);
        expect(chat.failPendingImageChat).not.toHaveBeenCalled();
        unmount();
    });

    // A refused file (a type this cloud does not take) used to vanish with the row the message replaced.
    it('writes the files a sent message left out as a failed message of their own, which can be retried', async () => {
        const partial: SendImageResult = { status: 'sent', uploadIds: ['up-0'], failedIndexes: [1] };
        mockSendImageMessage.mockResolvedValueOnce(partial).mockResolvedValueOnce(sent);
        const { result, unmount } = renderHook(() =>
            useBound({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' })
        );
        const picked = [new File(['a'], 'a.jpg'), new File(['%PDF'], 'quote.pdf', { type: 'application/pdf' })];

        await act(() => result.current.sendImages(picked));

        expect(chat.createPendingImageChat).toHaveBeenCalledTimes(2);
        expect(chat.createPendingImageChat).toHaveBeenLastCalledWith({
            channelId: 'ch-1',
            parentId: 'root-1',
            localThumbUrls: [expect.stringMatching(/^blob:/)],
            localFiles: [{ name: 'quote.pdf', contentType: 'application/pdf', size: 4 }],
        });
        const leftover = await chat.createPendingImageChat.mock.results[1].value;
        expect(chat.failPendingImageChat).toHaveBeenCalledWith(leftover);
        expect(result.current.canRetry(leftover)).toBe(true);

        await act(async () => void (await result.current.retry(leftover)));
        expect(mockSendImageMessage.mock.calls[1][0]).toEqual([picked[1]]);
        unmount();
    });

    it('leaves no files in memory for the left-out files when the screen has gone', async () => {
        const partial: SendImageResult = { status: 'sent', uploadIds: ['up-0'], failedIndexes: [1] };
        let finish: (value: SendImageResult) => void = () => undefined;
        mockSendImageMessage.mockImplementationOnce(() => new Promise<SendImageResult>(resolve => (finish = resolve)));
        const { result, unmount } = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));

        let sending: Promise<void> = Promise.resolve();
        act(() => void (sending = result.current.sendImages(files())));
        await waitFor(() => expect(mockSendImageMessage).toHaveBeenCalled());
        unmount();
        await act(async () => {
            finish(partial);
            await sending;
        });

        const leftover = await chat.createPendingImageChat.mock.results[1].value;
        expect(chat.failPendingImageChat).toHaveBeenCalledWith(leftover);
        expect(result.current.canRetry(leftover)).toBe(false);
    });

    it('marks the row failed and keeps the files, then retries the same pictures on the same row', async () => {
        mockSendImageMessage.mockResolvedValueOnce(failed).mockResolvedValueOnce(sent);
        const { result, unmount } = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));
        const picked = files();

        await act(() => result.current.sendImages(picked));
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;
        expect(chat.failPendingImageChat).toHaveBeenCalledWith(pendingId);
        expect(result.current.canRetry(pendingId)).toBe(true);
        expect(revoked).toHaveLength(0);

        let retried = false;
        await act(async () => {
            retried = await result.current.retry(pendingId);
        });

        expect(retried).toBe(true);
        expect(chat.createPendingImageChat).toHaveBeenLastCalledWith(expect.objectContaining({ pendingId }));
        expect(mockSendImageMessage.mock.calls[1][0]).toEqual(picked);
        expect(result.current.canRetry(pendingId)).toBe(false);
        unmount();
    });

    it('runs a double-tapped retry once', async () => {
        mockSendImageMessage.mockResolvedValueOnce(failed).mockResolvedValue(sent);
        const { result, unmount } = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));
        await act(() => result.current.sendImages(files()));
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;

        let outcomes: boolean[] = [];
        await act(async () => {
            outcomes = await Promise.all([result.current.retry(pendingId), result.current.retry(pendingId)]);
        });

        expect(outcomes.sort()).toEqual([false, true]);
        expect(mockSendImageMessage).toHaveBeenCalledTimes(2);
        unmount();
    });

    it('does not offer a retry until the failure has been written', async () => {
        let markFailed: () => void = () => undefined;
        mockSendImageMessage.mockResolvedValue(failed);
        chat.failPendingImageChat.mockImplementationOnce(
            () => new Promise<undefined>(resolve => (markFailed = () => resolve(undefined)))
        );
        const { result, unmount } = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));

        let sending: Promise<void> = Promise.resolve();
        act(() => {
            sending = result.current.sendImages(files());
        });
        await waitFor(() => expect(chat.failPendingImageChat).toHaveBeenCalled());
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;
        expect(result.current.canRetry(pendingId)).toBe(false);

        markFailed();
        await act(() => sending);
        expect(result.current.canRetry(pendingId)).toBe(true);
        unmount();
    });

    it('hands out a new canRetry once the failure is written, so a memoised row re-renders its Retry', async () => {
        let markFailed: () => void = () => undefined;
        mockSendImageMessage.mockResolvedValue(failed);
        chat.failPendingImageChat.mockImplementationOnce(
            () => new Promise<undefined>(resolve => (markFailed = () => resolve(undefined)))
        );
        const { result, unmount } = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));

        let sending: Promise<void> = Promise.resolve();
        act(() => {
            sending = result.current.sendImages(files());
        });
        await waitFor(() => expect(chat.failPendingImageChat).toHaveBeenCalled());
        const beforeFailure = result.current.canRetry;

        markFailed();
        await act(() => sending);

        expect(result.current.canRetry).not.toBe(beforeFailure);
        unmount();
    });

    it('gives up a retry, and the files, when the row was deleted meanwhile', async () => {
        mockSendImageMessage.mockResolvedValue(failed);
        const { result, unmount } = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));
        await act(() => result.current.sendImages(files()));
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;
        chat.createPendingImageChat.mockRejectedValueOnce(new Error('gone'));

        let retried = true;
        await act(async () => {
            retried = await result.current.retry(pendingId);
        });

        expect(retried).toBe(false);
        expect(result.current.canRetry(pendingId)).toBe(false);
        expect(revoked).toHaveLength(2);
        unmount();
    });

    it('writes a row for the first ten images only', async () => {
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));
        const many = Array.from({ length: 12 }, (_, i) => new File([String(i)], `${i}.jpg`));

        await act(() => result.current.sendImages(many));

        expect(chat.createPendingImageChat.mock.calls[0][0].localThumbUrls).toHaveLength(10);
        expect(mockSendImageMessage.mock.calls[0][0]).toHaveLength(10);
        unmount();
    });

    it('refuses to retry a row whose files are not in memory', async () => {
        const { result, unmount } = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));

        await expect(result.current.retry('from-an-earlier-page')).resolves.toBe(false);
        expect(result.current.canRetry('from-an-earlier-page')).toBe(false);
        expect(mockSendImageMessage).not.toHaveBeenCalled();
        unmount();
    });

    it('drops a failed row’s files and previews when the channel changes', async () => {
        mockSendImageMessage.mockResolvedValue(failed);
        const { result, rerender, unmount } = renderHook(props => useBound(props), {
            initialProps: { cid: 'cloud-a', channelId: 'ch-1' },
        });
        await act(() => result.current.sendImages(files()));
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;

        rerender({ cid: 'cloud-a', channelId: 'ch-2' });

        expect(revoked).toHaveLength(2);
        expect(result.current.canRetry(pendingId)).toBe(false);
        unmount();
    });

    it('lets a send that is still running finish after unmount, then drops its files', async () => {
        let finish: (value: SendImageResult) => void = () => undefined;
        mockSendImageMessage.mockImplementation(() => new Promise(resolve => (finish = resolve)));
        const { result, unmount } = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));

        let sending: Promise<void> = Promise.resolve();
        act(() => {
            sending = result.current.sendImages(files());
        });
        await waitFor(() => expect(mockSendImageMessage).toHaveBeenCalled());
        unmount();
        expect(revoked).toHaveLength(0);

        finish(failed);
        await sending;

        expect(chat.failPendingImageChat).toHaveBeenCalled();
        expect(revoked).toHaveLength(2);
    });

    it('keeps a running send’s files when the screen comes back before it settles', async () => {
        let finish: (value: SendImageResult) => void = () => undefined;
        mockSendImageMessage.mockImplementation(() => new Promise(resolve => (finish = resolve)));
        const first = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));
        let sending: Promise<void> = Promise.resolve();
        act(() => {
            sending = first.result.current.sendImages(files());
        });
        await waitFor(() => expect(mockSendImageMessage).toHaveBeenCalled());
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;
        first.unmount();

        const again = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));
        finish(failed);
        await act(() => sending);

        expect(again.result.current.canRetry(pendingId)).toBe(true);
        expect(revoked).toHaveLength(0);
        again.unmount();
    });

    it('does not park files in memory when the screen left while the row was being written', async () => {
        let created: (id: string) => void = () => undefined;
        chat.createPendingImageChat.mockImplementationOnce(() => new Promise(resolve => (created = resolve)));
        mockSendImageMessage.mockResolvedValue(failed);
        const { result, unmount } = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));

        let sending: Promise<void> = Promise.resolve();
        act(() => {
            sending = result.current.sendImages(files());
        });
        unmount();
        created('late-row');
        await sending;

        expect(revoked).toHaveLength(2);
        expect(result.current.canRetry('late-row')).toBe(false);
    });

    it('forgets a row’s files on discard', async () => {
        mockSendImageMessage.mockResolvedValue(failed);
        const { result, unmount } = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));
        await act(() => result.current.sendImages(files()));
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;

        act(() => result.current.discard(pendingId));

        expect(revoked).toHaveLength(2);
        expect(result.current.canRetry(pendingId)).toBe(false);
        unmount();
    });

    it('does not touch the other screen’s rows when a thread and its room share a channel', async () => {
        mockSendImageMessage.mockResolvedValue(failed);
        const room = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));
        const thread = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' }));
        await act(() => room.result.current.sendImages(files()));
        const roomRow = await chat.createPendingImageChat.mock.results[0].value;

        thread.unmount();

        expect(room.result.current.canRetry(roomRow)).toBe(true);
        room.unmount();
    });

    describe('leftover rows', () => {
        it('fails every older sending image row this page has no files for, and nothing else', async () => {
            mockSendImageMessage.mockResolvedValue(failed);
            const live = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));
            await act(() => live.result.current.sendImages(files()));
            const liveRow = await chat.createPendingImageChat.mock.results[0].value;
            chat.failPendingImageChat.mockClear();

            chat.listPendingImageChats.mockResolvedValue([
                pendingRow({ id: 'orphan-pending' }),
                pendingRow({
                    id: 'orphan-slot-sending',
                    isPending: false,
                    upload$$: [{ localStatus: 'sending', localThumbUrl: 'blob:x' }],
                }),
                pendingRow({
                    id: 'already-failed',
                    isPending: false,
                    isFailed: true,
                    upload$$: [{ localStatus: 'failed', localThumbUrl: 'blob:y' }],
                }),
                pendingRow({ id: liveRow }),
                pendingRow({ id: 'written-after-attach', createdAtMs: Number.MAX_SAFE_INTEGER }),
            ]);

            const other = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' }));

            await waitFor(() => expect(chat.failPendingImageChat).toHaveBeenCalledTimes(2));
            expect(chat.listPendingImageChats).toHaveBeenLastCalledWith('ch-1');
            expect(chat.failPendingImageChat.mock.calls.map(call => call[0])).toEqual([
                'orphan-pending',
                'orphan-slot-sending',
            ]);
            expect(other.result.current.canRetry('orphan-pending')).toBe(false);
            expect(other.result.current.canRetry(liveRow)).toBe(true);
            other.unmount();
            live.unmount();
        });

        it('lets the shell catch up but does not sweep before the screen has a room', async () => {
            const { unmount } = renderHook(() => useBound({ cid: '', channelId: '' }));
            await act(async () => undefined);

            expect(beforeSweep).toHaveBeenCalledTimes(1);
            expect(chat.listPendingImageChats).not.toHaveBeenCalled();
            unmount();
        });

        it('lets the shell catch up before it looks for leftovers', async () => {
            let caughtUp: () => void = () => undefined;
            beforeSweep.mockImplementationOnce(
                () => new Promise<undefined>(resolve => (caughtUp = () => resolve(undefined)))
            );
            const { unmount } = renderHook(() => useBound({ cid: 'cloud-a', channelId: 'ch-1' }));
            await waitFor(() => expect(beforeSweep).toHaveBeenCalledTimes(1));
            expect(chat.listPendingImageChats).not.toHaveBeenCalled();

            caughtUp();

            await waitFor(() => expect(chat.listPendingImageChats).toHaveBeenCalledWith('ch-1'));
            unmount();
        });
    });
});

describe('useSendImages — one message per file', () => {
    const three = () => [new File(['a'], 'a.jpg'), new File(['b'], 'b.jpg'), new File(['c'], 'c.jpg')];
    const separately = { separately: true } as const;
    const rowsWritten = () => Promise.all(chat.createPendingImageChat.mock.results.map(result => result.value));

    it('writes every row, in pick order, before the first message is prepared', async () => {
        const order: string[] = [];
        chat.createPendingImageChat.mockImplementation(async ({ pendingId }: { pendingId?: string }) => {
            order.push(pendingId ? 'rewrite' : 'create');
            return pendingId ?? `row-${++rowSeq}`;
        });
        (prepareChatAttachment as jest.Mock).mockImplementation(async (file: File) => {
            order.push(`prepare ${file.name}`);
            return { original: { file }, thumbnail: null };
        });
        mockSendImageMessage.mockImplementation(
            async (picked: File[], ports: { prepare: (f: File) => Promise<unknown> }) => {
                for (const file of picked) await ports.prepare(file);
                order.push('start');
                return sent;
            }
        );
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(three(), separately));

        expect(order).toEqual([
            'create',
            'create',
            'create',
            'prepare a.jpg',
            'start',
            'prepare b.jpg',
            'start',
            'prepare c.jpg',
            'start',
        ]);
        // One preview per row, each its own file's.
        const previews = chat.createPendingImageChat.mock.calls.map(call => call[0].localThumbUrls);
        expect(previews).toEqual([[expect.any(String)], [expect.any(String)], [expect.any(String)]]);
        expect(new Set(previews.flat()).size).toBe(3);
        unmount();
    });

    // Pending rows sort by `createdAt` in milliseconds; two rows stamped alike lose their pick order.
    it('stamps each row a later millisecond than the row before it', async () => {
        // Where the repository takes the row's `createdAt`. An instant write is the case at stake.
        const stamps: number[] = [];
        chat.createPendingImageChat.mockImplementation(async () => {
            stamps.push(Date.now());
            return `row-${++rowSeq}`;
        });
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(three(), separately));

        expect(stamps).toHaveLength(3);
        stamps.slice(1).forEach((stamp, i) => expect(stamp).toBeGreaterThan(stamps[i]));
        unmount();
    });

    it('sends the messages in pick order, each one only once the one before it has settled', async () => {
        const settle: (() => void)[] = [];
        mockSendImageMessage.mockImplementation(
            async (picked: File[], ports: { send: (input: { uploadIds: string[] }) => Promise<unknown> }) => {
                await new Promise<void>(resolve => settle.push(resolve));
                await ports.send({ uploadIds: [`up-${picked[0].name}`] });
                return sent;
            }
        );
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));
        const picked = three();

        let sending: Promise<void> = Promise.resolve();
        act(() => void (sending = result.current.sendImages(picked, separately)));
        for (let k = 0; k < picked.length; k += 1) {
            await waitFor(() => expect(settle).toHaveLength(k + 1));
            // The next message has not started while this one is still on its way.
            await act(() => new Promise(resolve => setTimeout(resolve, 5)));
            expect(mockSendImageMessage).toHaveBeenCalledTimes(k + 1);
            act(() => settle[k]());
        }
        await act(() => sending);

        const rows = await rowsWritten();
        mockSendImageMessage.mock.calls.forEach(([files], k) => {
            expect(files).toHaveLength(1);
            expect(files[0]).toBe(picked[k]);
        });
        expect(chat.sendPendingImageChat.mock.calls.map(call => call[0])).toEqual(rows);
        unmount();
    });

    it('still sends the next message when one fails, and marks only that row failed', async () => {
        mockSendImageMessage.mockResolvedValueOnce(sent).mockResolvedValueOnce(failed).mockResolvedValueOnce(sent);
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(three(), separately));

        const [first, second, third] = await rowsWritten();
        expect(mockSendImageMessage).toHaveBeenCalledTimes(3);
        expect(chat.failPendingImageChat.mock.calls).toEqual([[second]]);
        expect(result.current.canRetry(first)).toBe(false);
        expect(result.current.canRetry(second)).toBe(true);
        expect(result.current.canRetry(third)).toBe(false);
        unmount();
    });

    it('retries a failed message on its own row with its own file, leaving the others alone', async () => {
        mockSendImageMessage
            .mockResolvedValueOnce(failed)
            .mockResolvedValueOnce(sent)
            .mockResolvedValueOnce(failed)
            .mockResolvedValueOnce(sent);
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));
        const picked = three();
        await act(() => result.current.sendImages(picked, separately));
        const [first, , third] = await rowsWritten();

        await act(async () => void (await result.current.retry(third)));

        expect(chat.createPendingImageChat).toHaveBeenLastCalledWith(expect.objectContaining({ pendingId: third }));
        expect(mockSendImageMessage).toHaveBeenCalledTimes(4);
        expect(mockSendImageMessage.mock.calls[3][0]).toHaveLength(1);
        expect(mockSendImageMessage.mock.calls[3][0][0]).toBe(picked[2]);
        expect(result.current.canRetry(third)).toBe(false);
        // The first row's failure is untouched by the third one's retry.
        expect(result.current.canRetry(first)).toBe(true);
        unmount();
    });

    it('sends one file the same way with or without the option', async () => {
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() =>
            useBound({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' })
        );
        const photo = new File(['a'], 'a.jpg');

        await act(() => result.current.sendImages([photo]));
        await act(() => result.current.sendImages([photo], separately));

        const [bundled, separate] = chat.createPendingImageChat.mock.calls.map(call => call[0]);
        expect(chat.createPendingImageChat).toHaveBeenCalledTimes(2);
        expect(bundled).toEqual({
            channelId: 'ch-1',
            parentId: 'root-1',
            localThumbUrls: [expect.stringMatching(/^blob:/)],
        });
        expect(separate).toEqual({ ...bundled, localThumbUrls: [expect.stringMatching(/^blob:/)] });
        expect(runInCloud).toHaveBeenCalledTimes(2);
        mockSendImageMessage.mock.calls.forEach(([files]) => {
            expect(files).toHaveLength(1);
            expect(files[0]).toBe(photo);
        });
        unmount();
    });

    it('keeps the whole pick in one message without the option, or with it off', async () => {
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(three()));
        await act(() => result.current.sendImages(three(), { separately: false }));

        expect(chat.createPendingImageChat.mock.calls.map(call => call[0].localThumbUrls.length)).toEqual([3, 3]);
        expect(mockSendImageMessage.mock.calls.map(call => call[0].length)).toEqual([3, 3]);
        unmount();
    });

    it('cuts the pick to ten before writing, so at most ten messages go', async () => {
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));
        const many = Array.from({ length: 12 }, (_, i) => new File([String(i)], `${i}.jpg`));

        await act(() => result.current.sendImages(many, separately));

        expect(chat.createPendingImageChat).toHaveBeenCalledTimes(10);
        expect(mockSendImageMessage).toHaveBeenCalledTimes(10);
        expect(mockSendImageMessage.mock.calls.map(call => call[0][0])).toEqual(many.slice(0, 10));
        unmount();
    });

    // Every row is already on screen as sending; stopping the queue would leave the later ones so.
    it('keeps sending the queued messages after the screen leaves, and keeps no files once they settle', async () => {
        let finishFirst: (value: SendImageResult) => void = () => undefined;
        mockSendImageMessage
            .mockImplementationOnce(() => new Promise<SendImageResult>(resolve => (finishFirst = resolve)))
            .mockResolvedValueOnce(failed)
            .mockResolvedValueOnce(sent);
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        let sending: Promise<void> = Promise.resolve();
        act(() => void (sending = result.current.sendImages(three(), separately)));
        await waitFor(() => expect(mockSendImageMessage).toHaveBeenCalledTimes(1));
        const rows = await rowsWritten();
        unmount();
        // Still in flight, so the screen leaving kept every file.
        expect(revoked).toHaveLength(0);

        await act(async () => {
            finishFirst(sent);
            await sending;
        });

        expect(mockSendImageMessage).toHaveBeenCalledTimes(3);
        expect(chat.failPendingImageChat.mock.calls).toEqual([[rows[1]]]);
        // The failed one is left to delete: its screen has gone, and its files with it.
        rows.forEach(row => expect(result.current.canRetry(row)).toBe(false));
        expect(revoked).toHaveLength(3);
    });

    it('still sends the rows written before one that could not be written, then rejects', async () => {
        chat.createPendingImageChat
            .mockImplementationOnce(async () => `row-${++rowSeq}`)
            .mockRejectedValueOnce(new Error('cache'));
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));
        const picked = three();

        await act(() => expect(result.current.sendImages(picked, separately)).rejects.toThrow('cache'));

        // The third file is never shown as sending, since nothing would send it.
        expect(chat.createPendingImageChat).toHaveBeenCalledTimes(2);
        expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
        expect(mockSendImageMessage).toHaveBeenCalledTimes(1);
        expect(mockSendImageMessage.mock.calls[0][0][0]).toBe(picked[0]);
        // The sent row's preview went with its send, the unwritten row's with its write.
        expect(revoked).toHaveLength(2);
        unmount();
    });
});

describe('useSendImages — text with the pictures', () => {
    const three = () => [new File(['a'], 'a.jpg'), new File(['b'], 'b.jpg'), new File(['c'], 'c.jpg')];
    const writes = () => chat.createPendingImageChat.mock.calls.map(call => call[0]);

    it('writes the text, trimmed, on the row of the one bundled message', async () => {
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() =>
            useBound({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' })
        );

        await act(() => result.current.sendImages(three(), { content: '  look at this \n' }));

        expect(writes()).toEqual([
            {
                channelId: 'ch-1',
                parentId: 'root-1',
                localThumbUrls: [expect.any(String), expect.any(String), expect.any(String)],
                content: 'look at this',
            },
        ]);
        expect(mockSendImageMessage).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('writes the text on the first message only when each file goes alone', async () => {
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(three(), { separately: true, content: 'look at this' }));

        expect(writes().map(write => write.content)).toEqual(['look at this', undefined, undefined]);
        writes()
            .slice(1)
            .forEach(write => expect(write).not.toHaveProperty('content'));
        unmount();
    });

    it('writes the text on the one message a single file makes, with the option or without', async () => {
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages([new File(['a'], 'a.jpg')], { content: 'one' }));
        await act(() => result.current.sendImages([new File(['b'], 'b.jpg')], { separately: true, content: 'two' }));

        expect(writes().map(write => write.content)).toEqual(['one', 'two']);
        unmount();
    });

    // The text went out with the message the files were left out of; a second copy would repeat it.
    it('writes the row of the files a sent message left out without the text', async () => {
        const partial: SendImageResult = { status: 'sent', uploadIds: ['up-0'], failedIndexes: [1] };
        mockSendImageMessage.mockResolvedValueOnce(partial);
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(files(), { content: 'look at this' }));

        const [message, leftover] = writes();
        expect(message).toMatchObject({ content: 'look at this' });
        expect(leftover).not.toHaveProperty('content');
        expect(chat.failPendingImageChat).toHaveBeenCalledWith(await chat.createPendingImageChat.mock.results[1].value);
        unmount();
    });

    // The repository sends the row's own text, so a retry that named none keeps the text it was written with.
    it('retries on the same row without naming the text, and sends it through that row', async () => {
        mockSendImageMessage
            .mockResolvedValueOnce(failed)
            .mockImplementationOnce(async (_files: File[], ports: { send: (input: unknown) => Promise<unknown> }) => {
                await ports.send({ uploadIds: ['up-1'] });
                return sent;
            });
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));
        await act(() => result.current.sendImages(files(), { content: 'look at this' }));
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;

        await act(async () => void (await result.current.retry(pendingId)));

        const rearm = writes()[writes().length - 1];
        expect(rearm).toMatchObject({ pendingId });
        expect(rearm).not.toHaveProperty('content');
        expect(chat.sendPendingImageChat).toHaveBeenCalledWith(pendingId, { uploadIds: ['up-1'] });
        unmount();
    });

    it('writes the row it always has when there is no text, or only blank text', async () => {
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(files()));
        await act(() => result.current.sendImages(files(), { content: ' \n ' }));
        await act(() => result.current.sendImages(files(), { separately: true, content: '' }));

        const plain = { channelId: 'ch-1', localThumbUrls: expect.any(Array) };
        expect(writes()).toEqual([plain, plain, plain, plain]);
        unmount();
    });
});

describe('useSendImages — preparations across messages', () => {
    const separately = { separately: true } as const;
    const photo = (name: string) => new File([name], name);
    let active = 0;
    let peak = 0;
    const holds = new Map<string, () => void>();

    // Every preparation counts towards `active`; one whose file is listed waits for `holds.get(name)`.
    const holdPreparing = (...names: string[]) =>
        (prepareChatAttachment as jest.Mock).mockImplementation(async (file: File) => {
            active += 1;
            peak = Math.max(peak, active);
            if (names.includes(file.name)) await new Promise<void>(resolve => holds.set(file.name, resolve));
            active -= 1;
            return { original: { file }, thumbnail: null };
        });

    beforeEach(() => {
        active = 0;
        peak = 0;
        holds.clear();
        mockSendImageMessage.mockImplementation(
            async (picked: File[], ports: { prepare: (f: File) => Promise<unknown> }) => {
                for (const file of picked) await ports.prepare(file);
                return sent;
            }
        );
    });

    // The page's preparation turn outlives a test; one left held would stall the next file's one-each sends.
    afterEach(() => holds.forEach(release => release()));

    // Bundled sends prepared side by side before one-each picks existed, and desktop sends nothing else.
    it('prepares two bundled messages side by side, as before', async () => {
        holdPreparing('a.jpg', 'b.jpg');
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        let sending: Promise<unknown> = Promise.resolve();
        act(() => {
            sending = Promise.all([
                result.current.sendImages([photo('a.jpg')]),
                result.current.sendImages([photo('b.jpg')]),
            ]);
        });
        await waitFor(() => expect(prepareChatAttachment).toHaveBeenCalledTimes(2));

        await act(async () => {
            holds.forEach(release => release());
            await sending;
        });
        expect(peak).toBe(2);
        unmount();
    });

    it('prepares a one-each message one at a time with a one-each queue in another room', async () => {
        holdPreparing('a.jpg');
        const room = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));
        const thread = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1', parentId: 'root-1' }));

        let sending: Promise<unknown> = Promise.resolve();
        act(() => {
            sending = Promise.all([
                room.result.current.sendImages([photo('a.jpg'), photo('b.jpg')], separately),
                thread.result.current.sendImages([photo('c.jpg'), photo('d.jpg')], separately),
            ]);
        });
        await waitFor(() => expect(holds.has('a.jpg')).toBe(true));
        // The thread's queue is on its way and waiting on its preparation, not on the room's queue.
        await waitFor(() => expect(mockSendImageMessage).toHaveBeenCalledTimes(2));
        expect(prepareChatAttachment).toHaveBeenCalledTimes(1);

        await act(async () => {
            holds.get('a.jpg')?.();
            await sending;
        });
        expect(prepareChatAttachment).toHaveBeenCalledTimes(4);
        expect(peak).toBe(1);
        room.unmount();
        thread.unmount();
    });

    it('lets a retried one-each message wait for the preparation under way in its queue', async () => {
        holdPreparing('b.jpg');
        mockSendImageMessage
            .mockImplementationOnce(async (picked: File[], ports: { prepare: (f: File) => Promise<unknown> }) => {
                await ports.prepare(picked[0]);
                return failed;
            })
            .mockImplementation(async (picked: File[], ports: { prepare: (f: File) => Promise<unknown> }) => {
                await ports.prepare(picked[0]);
                return sent;
            });
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        let sending: Promise<void> = Promise.resolve();
        act(() => void (sending = result.current.sendImages([photo('a.jpg'), photo('b.jpg')], separately)));
        await waitFor(() => expect(holds.has('b.jpg')).toBe(true));
        const [first] = await Promise.all(chat.createPendingImageChat.mock.results.map(r => r.value));

        let retrying: Promise<boolean> = Promise.resolve(false);
        act(() => void (retrying = result.current.retry(first)));
        await waitFor(() => expect(mockSendImageMessage).toHaveBeenCalledTimes(3));
        await act(() => new Promise(resolve => setTimeout(resolve, 5)));
        expect(prepareChatAttachment).toHaveBeenCalledTimes(2);

        await act(async () => {
            holds.get('b.jpg')?.();
            await Promise.all([sending, retrying]);
        });
        expect(prepareChatAttachment).toHaveBeenCalledTimes(3);
        expect(peak).toBe(1);
        unmount();
    });

    it('prepares a bundled message beside a one-each queue’s preparation, and retries it the same way', async () => {
        holdPreparing('a.jpg');
        mockSendImageMessage
            .mockImplementationOnce(async () => failed)
            .mockImplementation(async (picked: File[], ports: { prepare: (f: File) => Promise<unknown> }) => {
                for (const file of picked) await ports.prepare(file);
                return sent;
            });
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-2' }));
        const queue = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));
        await act(() => result.current.sendImages([photo('x.jpg')]));
        const [bundled] = await Promise.all(chat.createPendingImageChat.mock.results.map(r => r.value));

        let sending: Promise<unknown> = Promise.resolve();
        act(() => void (sending = queue.result.current.sendImages([photo('a.jpg'), photo('b.jpg')], separately)));
        await waitFor(() => expect(holds.has('a.jpg')).toBe(true));
        let other: Promise<unknown> = Promise.resolve();
        act(() => {
            other = Promise.all([result.current.retry(bundled), result.current.sendImages([photo('y.jpg')])]);
        });
        // The retry and the new send each prepared while the queue's preparation was still held.
        await waitFor(() => expect(prepareChatAttachment).toHaveBeenCalledTimes(3));
        expect(peak).toBe(2);

        await act(async () => {
            holds.get('a.jpg')?.();
            await Promise.all([sending, other]);
        });
        unmount();
        queue.unmount();
    });

    it('lets the next one-each preparation go once one has held the turn for thirty seconds', async () => {
        jest.useFakeTimers();
        let unstick: () => void = () => undefined;
        try {
            let startedAt = 0;
            (prepareChatAttachment as jest.Mock).mockImplementation(async (file: File) => {
                if (file.name === 'a.jpg') {
                    startedAt = Date.now();
                    await new Promise<void>(resolve => (unstick = resolve));
                }
                return { original: { file }, thumbnail: null };
            });
            const advance = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));
            const stuck = renderHook(() => useBound({ cid: 'stuck', channelId: 'ch-1' }));
            const other = renderHook(() => useBound({ cid: 'stuck', channelId: 'ch-2' }));
            const prepared = () => (prepareChatAttachment as jest.Mock).mock.calls.map(([file]) => file.name);

            let sending: Promise<unknown> = Promise.resolve();
            act(() => void (sending = stuck.result.current.sendImages([photo('a.jpg'), photo('b.jpg')], separately)));
            while (!prepared().includes('a.jpg')) await advance(1);
            act(() => {
                sending = Promise.all([
                    sending,
                    other.result.current.sendImages([photo('c.jpg'), photo('d.jpg')], separately),
                ]);
            });
            // The other room's first message is on its way, waiting for its turn to prepare.
            while (mockSendImageMessage.mock.calls.length < 2) await advance(1);

            await advance(startedAt + 30_000 - 1 - Date.now());
            expect(prepared()).toEqual(['a.jpg']);
            await advance(1);
            expect(prepared().slice(0, 2)).toEqual(['a.jpg', 'c.jpg']);

            // The stuck preparation still holds its own message; once it lands, everything settles.
            unstick();
            await advance(100);
            await act(() => sending);
            expect(prepared()).toEqual(['a.jpg', 'c.jpg', 'd.jpg', 'b.jpg']);
            stuck.unmount();
            other.unmount();
        } finally {
            unstick();
            jest.useRealTimers();
        }
    });
});

describe('useSendImages — order in a room', () => {
    const separately = { separately: true } as const;
    const photo = (name: string) => new File([name], name);
    /** What reached the server, in the order its sends arrived: each message as its files' names. */
    const server: string[] = [];
    const holding = new Set<string>();
    const releases = new Map<string, () => void>();
    const failingOnce = new Set<string>();

    const nameOf = (picked: File[]) => picked.map(file => file.name).join('+');
    const hold = (name: string) => holding.add(name);
    const release = (name: string) => releases.get(name)?.();
    /** Resolves once the named message is on its way and waiting at its hold. */
    const reached = (name: string) => waitFor(() => expect(releases.has(name)).toBe(true));
    // Long enough for a send that is free to go to reach the server.
    const settleALittle = () => act(() => new Promise(resolve => setTimeout(resolve, 10)));

    beforeEach(() => {
        server.length = 0;
        holding.clear();
        releases.clear();
        failingOnce.clear();
        mockSendImageMessage.mockImplementation(
            async (picked: File[], ports: { send: (input: { uploadIds: string[] }) => Promise<unknown> }) => {
                const name = nameOf(picked);
                if (holding.delete(name)) await new Promise<void>(resolve => releases.set(name, resolve));
                if (failingOnce.delete(name)) return failed;
                await ports.send({ uploadIds: [`up-${name}`] });
                server.push(name);
                return sent;
            }
        );
    });

    // A room's queue outlives a test; one left held would keep the next test's sends in that room waiting.
    afterEach(() => {
        holding.clear();
        releases.forEach(go => go());
    });

    it('sends a bundled pick made while a one-each queue runs after the whole queue, showing its row at once', async () => {
        hold('a.jpg');
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        let queue: Promise<void> = Promise.resolve();
        act(
            () => void (queue = result.current.sendImages([photo('a.jpg'), photo('b.jpg'), photo('c.jpg')], separately))
        );
        await reached('a.jpg');
        let later: Promise<void> = Promise.resolve();
        act(() => void (later = result.current.sendImages([photo('d.jpg'), photo('e.jpg')])));
        await waitFor(() => expect(chat.createPendingImageChat).toHaveBeenCalledTimes(4));
        await settleALittle();
        expect(mockSendImageMessage).toHaveBeenCalledTimes(1);

        await act(async () => {
            release('a.jpg');
            await Promise.all([queue, later]);
        });
        expect(server).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg+e.jpg']);
        unmount();
    });

    it('sends a second one-each pick made while the first runs after it, never between its messages', async () => {
        hold('a.jpg');
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        let first: Promise<void> = Promise.resolve();
        act(
            () => void (first = result.current.sendImages([photo('a.jpg'), photo('b.jpg'), photo('c.jpg')], separately))
        );
        await reached('a.jpg');
        let second: Promise<void> = Promise.resolve();
        act(() => void (second = result.current.sendImages([photo('d.jpg'), photo('e.jpg')], separately)));
        await waitFor(() => expect(chat.createPendingImageChat).toHaveBeenCalledTimes(5));
        await settleALittle();
        expect(mockSendImageMessage).toHaveBeenCalledTimes(1);

        await act(async () => {
            release('a.jpg');
            await Promise.all([first, second]);
        });
        expect(server).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg']);
        unmount();
    });

    it('holds a one-each pick behind a bundled send that is itself waiting for the queue ahead', async () => {
        hold('a.jpg');
        hold('d.jpg');
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        let sending: Promise<unknown> = Promise.resolve();
        act(() => void (sending = result.current.sendImages([photo('a.jpg'), photo('b.jpg')], separately)));
        await reached('a.jpg');
        act(() => {
            sending = Promise.all([
                sending,
                result.current.sendImages([photo('d.jpg')]),
                result.current.sendImages([photo('e.jpg'), photo('f.jpg')], separately),
            ]);
        });
        await settleALittle();

        act(() => release('a.jpg'));
        await reached('d.jpg');
        // The bundled send made before the second queue holds that queue back while it is on its way.
        await settleALittle();
        expect(server).toEqual(['a.jpg', 'b.jpg']);

        await act(async () => {
            release('d.jpg');
            await sending;
        });
        expect(server).toEqual(['a.jpg', 'b.jpg', 'd.jpg', 'e.jpg', 'f.jpg']);
        unmount();
    });

    it('keeps the queue open for a pick still waiting when the one ahead of it settles', async () => {
        hold('a.jpg');
        hold('c.jpg');
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        let sending: Promise<unknown> = Promise.resolve();
        act(() => {
            sending = Promise.all([
                result.current.sendImages([photo('a.jpg'), photo('b.jpg')], separately),
                result.current.sendImages([photo('c.jpg'), photo('d.jpg')], separately),
            ]);
        });
        await reached('a.jpg');
        act(() => release('a.jpg'));
        // The first queue has settled; the second one is on its way.
        await reached('c.jpg');
        expect(server).toEqual(['a.jpg', 'b.jpg']);

        act(() => void (sending = Promise.all([sending, result.current.sendImages([photo('e.jpg')])])));
        await settleALittle();
        expect(server).toEqual(['a.jpg', 'b.jpg']);

        await act(async () => {
            release('c.jpg');
            await sending;
        });
        expect(server).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg']);
        unmount();
    });

    it('starts a one-each pick only once a bundled send already on its way in the room has settled', async () => {
        hold('x.jpg');
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        let sending: Promise<unknown> = Promise.resolve();
        act(() => void (sending = result.current.sendImages([photo('x.jpg')])));
        await reached('x.jpg');
        act(
            () =>
                void (sending = Promise.all([
                    sending,
                    result.current.sendImages([photo('a.jpg'), photo('b.jpg')], separately),
                ]))
        );
        await waitFor(() => expect(chat.createPendingImageChat).toHaveBeenCalledTimes(3));
        await settleALittle();
        expect(mockSendImageMessage).toHaveBeenCalledTimes(1);

        await act(async () => {
            release('x.jpg');
            await sending;
        });
        expect(server).toEqual(['x.jpg', 'a.jpg', 'b.jpg']);
        unmount();
    });

    it('does not hold a send in another room or in the thread while a one-each queue runs', async () => {
        hold('a.jpg');
        const room = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));
        const thread = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1', parentId: 'root-1' }));
        const elsewhere = renderHook(() => useBound({ cid: 'c', channelId: 'ch-2' }));

        let queue: Promise<void> = Promise.resolve();
        act(() => void (queue = room.result.current.sendImages([photo('a.jpg'), photo('b.jpg')], separately)));
        await reached('a.jpg');
        await act(() => thread.result.current.sendImages([photo('t.jpg')]));
        await act(() => elsewhere.result.current.sendImages([photo('e.jpg'), photo('f.jpg')], separately));
        expect(server).toEqual(['t.jpg', 'e.jpg', 'f.jpg']);

        await act(async () => {
            release('a.jpg');
            await queue;
        });
        expect(server).toEqual(['t.jpg', 'e.jpg', 'f.jpg', 'a.jpg', 'b.jpg']);
        room.unmount();
        thread.unmount();
        elsewhere.unmount();
    });

    // What desktop does: bundled sends only, which never waited on one another.
    it('sends a bundled pick at once while an earlier bundled one is still on its way', async () => {
        hold('a.jpg');
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        let sending: Promise<unknown> = Promise.resolve();
        act(() => void (sending = result.current.sendImages([photo('a.jpg')])));
        await reached('a.jpg');
        act(() => void (sending = Promise.all([sending, result.current.sendImages([photo('b.jpg')])])));
        await settleALittle();
        expect(server).toEqual(['b.jpg']);

        await act(async () => {
            release('a.jpg');
            await sending;
        });
        expect(server).toEqual(['b.jpg', 'a.jpg']);
        unmount();
    });

    it('opens no queue for one file sent with the option, which goes as it would without it', async () => {
        hold('a.jpg');
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        let sending: Promise<unknown> = Promise.resolve();
        act(() => void (sending = result.current.sendImages([photo('a.jpg')], separately)));
        await reached('a.jpg');
        act(() => void (sending = Promise.all([sending, result.current.sendImages([photo('b.jpg')])])));
        await settleALittle();
        expect(server).toEqual(['b.jpg']);

        await act(async () => {
            release('a.jpg');
            await sending;
        });
        unmount();
    });

    it('sends a retry when it is tapped, without waiting for the queue still running', async () => {
        failingOnce.add('a.jpg');
        hold('b.jpg');
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        let queue: Promise<void> = Promise.resolve();
        act(
            () => void (queue = result.current.sendImages([photo('a.jpg'), photo('b.jpg'), photo('c.jpg')], separately))
        );
        await reached('b.jpg');
        const [first] = await Promise.all(chat.createPendingImageChat.mock.results.map(r => r.value));

        await act(async () => void (await result.current.retry(first)));
        expect(server).toEqual(['a.jpg']);

        await act(async () => {
            release('b.jpg');
            await queue;
        });
        expect(server).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
        unmount();
    });

    it('lets the room go on after a queue whose rows could not be written', async () => {
        chat.createPendingImageChat.mockRejectedValueOnce(new Error('cache'));
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() =>
            expect(result.current.sendImages([photo('a.jpg'), photo('b.jpg')], separately)).rejects.toThrow('cache')
        );
        await act(() => result.current.sendImages([photo('d.jpg')]));

        expect(server).toEqual(['d.jpg']);
        unmount();
    });
});

describe('useSendImages — previews while sending', () => {
    const thumb = (name: string) => new File(['t'], `${name}-thumb.jpg`, { type: 'image/jpeg' });
    const order: string[] = [];

    // The mocked sequence calls the real prepare port the hook binds, then records where `start`
    // would run — which is what the preview switch has to come before.
    const runSequence = (result: SendImageResult = sent) =>
        mockSendImageMessage.mockImplementation(
            async (picked: File[], ports: { prepare: (f: File) => Promise<unknown> }) => {
                for (const file of picked) await ports.prepare(file);
                order.push('start');
                return result;
            }
        );

    beforeEach(() => {
        order.length = 0;
        chat.createPendingImageChat.mockImplementation(async ({ pendingId }: { pendingId?: string }) => {
            order.push(pendingId ? 'rewrite' : 'create');
            return pendingId ?? `row-${++rowSeq}`;
        });
    });

    // A video or document has nothing to resize and no thumbnail; the server wants its original under
    // its own type, and a name that ends in the format's extension.
    it('sends a video or document as its original alone, typed and named the way the server takes it', async () => {
        const prepared: unknown[] = [];
        mockSendImageMessage.mockImplementation(
            async (picked: File[], ports: { prepare: (f: File) => Promise<unknown> }) => {
                for (const file of picked) prepared.push(await ports.prepare(file));
                return sent;
            }
        );
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() =>
            result.current.sendImages([
                new File(['%PDF'], 'report', { type: 'application/pdf' }),
                new File(['h'], 'a.hwp'),
            ])
        );

        expect(prepareChatAttachment).not.toHaveBeenCalled();
        const [pdf, hwp] = prepared as { original: { file: File; width: number; height: number }; thumbnail: null }[];
        expect(pdf).toMatchObject({ original: { width: 0, height: 0 }, thumbnail: null });
        expect(pdf.original.file).toMatchObject({ name: 'report.pdf', type: 'application/pdf', size: 4 });
        expect(hwp.original.file).toMatchObject({ name: 'a.hwp', type: 'application/x-hwp' });
        expect(chat.createPendingImageChat.mock.calls[0][0].localFiles).toEqual([
            { name: 'report.pdf', contentType: 'application/pdf', size: 4 },
            { name: 'a.hwp', contentType: 'application/x-hwp', size: 1 },
        ]);
        unmount();
    });

    // An image let in by its extension still has the raw type it arrived with; declared as-is, the
    // server refuses it, and an untyped GIF would get the still thumbnail a GIF must not have.
    it('prepares an image under its format’s type when it arrived untyped', async () => {
        runSequence();
        (prepareChatAttachment as jest.Mock).mockImplementation(async (file: File) => ({
            original: { file },
            thumbnail: null,
        }));
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages([new File(['g'], 'a.gif')]));

        expect((prepareChatAttachment as jest.Mock).mock.calls[0][0]).toMatchObject({
            name: 'a.gif',
            type: 'image/gif',
        });
        unmount();
    });

    it('writes no file details for an image, which draws its own preview', async () => {
        runSequence();
        (prepareChatAttachment as jest.Mock).mockImplementation(async (file: File) => ({
            original: { file },
            thumbnail: null,
        }));
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages([new File(['a'], 'a.jpg', { type: 'image/jpeg' })]));

        expect(prepareChatAttachment).toHaveBeenCalledTimes(1);
        expect(chat.createPendingImageChat.mock.calls[0][0]).not.toHaveProperty('localFiles');
        unmount();
    });

    // A phone photo is several megapixels; the feed must not decode ten of them for small tiles.
    it('switches the row to the thumbnails once every image is prepared, before the upload starts', async () => {
        (prepareChatAttachment as jest.Mock).mockImplementation(async (file: File) => ({
            original: { file },
            thumbnail: { file: thumb(file.name) },
        }));
        runSequence();
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(files()));

        expect(order).toEqual(['create', 'rewrite', 'start']);
        const [first, second] = chat.createPendingImageChat.mock.calls.map(call => call[0]);
        expect(second.pendingId).toBeDefined();
        expect(second.localThumbUrls).toHaveLength(2);
        expect(second.localThumbUrls).not.toEqual(first.localThumbUrls);
        // The original previews are let go once the thumbnails replace them.
        expect(revoked).toEqual(expect.arrayContaining(first.localThumbUrls));
        unmount();
    });

    it('keeps the original preview for an image that has no thumbnail', async () => {
        (prepareChatAttachment as jest.Mock).mockImplementation(async (file: File) => ({
            original: { file },
            thumbnail: file.name === 'a.jpg' ? { file: thumb('a') } : null,
        }));
        runSequence();
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(files()));

        const [first, second] = chat.createPendingImageChat.mock.calls.map(call => call[0]);
        expect(second.localThumbUrls[0]).not.toBe(first.localThumbUrls[0]);
        expect(second.localThumbUrls[1]).toBe(first.localThumbUrls[1]);
        unmount();
    });

    it('does not rewrite the row when no image has a thumbnail', async () => {
        (prepareChatAttachment as jest.Mock).mockImplementation(async (file: File) => ({
            original: { file },
            thumbnail: null,
        }));
        runSequence();
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(files()));

        expect(order).toEqual(['create', 'start']);
        unmount();
    });

    it('does not switch again on a retry, since the row already shows the thumbnails', async () => {
        (prepareChatAttachment as jest.Mock).mockImplementation(async (file: File) => ({
            original: { file },
            thumbnail: { file: thumb(file.name) },
        }));
        runSequence(failed);
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));
        await act(() => result.current.sendImages(files()));
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;
        order.length = 0;

        runSequence(sent);
        await act(async () => {
            await result.current.retry(pendingId);
        });

        // The retry's own reset of the row, then straight to the upload — no second switch.
        expect(order).toEqual(['rewrite', 'start']);
        unmount();
    });

    it('lets the new previews go when the row was deleted before the switch', async () => {
        (prepareChatAttachment as jest.Mock).mockImplementation(async (file: File) => ({
            original: { file },
            thumbnail: { file: thumb(file.name) },
        }));
        runSequence();
        chat.createPendingImageChat.mockImplementation(async ({ pendingId }: { pendingId?: string }) => {
            if (pendingId) throw new Error('gone');
            return `row-${++rowSeq}`;
        });
        const created = urlSeq;
        const { result, unmount } = renderHook(() => useBound({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(files()));

        // Two originals, then two thumbnails; the thumbnails were never shown and are revoked.
        expect(revoked).toEqual(expect.arrayContaining([`blob:${created + 3}`, `blob:${created + 4}`]));
        unmount();
    });
});

describe('useSendImages — shell files', () => {
    const putShellFile = jest.fn();
    const prepareVideo = jest.fn<Promise<PreparedShellVideo>, [ShellFileRef]>();
    const onVideoRefused = jest.fn();
    const useShell = () =>
        useSendImages({ cid: 'c', channelId: 'ch-1', put, beforeSweep, putShellFile, prepareVideo, onVideoRefused });

    const shellFile = (name: string, type: string, extra: Partial<ShellFileRef> = {}): ShellFileRef => ({
        uri: `file:///cache/attach-pick/${name}`,
        name,
        type,
        size: 1000,
        kind: type.startsWith('video/') ? 'video' : 'file',
        ...extra,
    });
    const mov = () => shellFile('IMG_0001.MOV', 'video/quicktime', { needsExport: true, size: 170_000_000 });
    const exported = (source: ShellFileRef, size = 80_000_000): PreparedShellVideo => ({
        file: {
            ...source,
            uri: `${source.uri}.mp4`,
            name: 'IMG_0001.mp4',
            type: 'video/mp4',
            size,
            needsExport: false,
        },
        width: 1920,
        height: 1080,
        poster: {
            file: { ...source, uri: `${source.uri}.jpg`, name: 'poster.jpg', type: 'image/jpeg', size: 20_000 },
            width: 400,
            height: 225,
            preview: new Blob(['jpeg'], { type: 'image/jpeg' }),
        },
    });
    const prepared: unknown[] = [];
    /** The mocked sequence runs the real prepare port the hook binds, then answers `result`. */
    const runSequence = (result: (picked: ChatAttachmentSource[]) => SendImageResult = () => sent) =>
        mockSendImageMessage.mockImplementation(
            async (
                picked: ChatAttachmentSource[],
                ports: { prepare: (f: ChatAttachmentSource) => Promise<unknown> }
            ) => {
                for (const file of picked) prepared.push(await ports.prepare(file));
                return result(picked);
            }
        );

    beforeEach(() => {
        prepared.length = 0;
        prepareVideo.mockImplementation(async source => exported(source));
    });

    it('sends a shell document from where the shell keeps it, named and typed the way the server takes it', async () => {
        runSequence();
        const { result, unmount } = renderHook(useShell);
        const hwp = shellFile('report.hwp', 'application/octet-stream');

        await act(() => result.current.sendImages([hwp]));

        expect(chat.createPendingImageChat.mock.calls[0][0]).toMatchObject({
            localThumbUrls: [''],
            localFiles: [{ name: 'report.hwp', contentType: 'application/x-hwp', size: 1000 }],
        });
        const [doc] = prepared as { original: { file: ShellFileRef }; thumbnail: null }[];
        expect(doc).toMatchObject({ original: { width: 0, height: 0 }, thumbnail: null });
        expect(doc.original.file).toEqual({ ...hwp, type: 'application/x-hwp' });
        expect(prepareVideo).not.toHaveBeenCalled();
        unmount();
    });

    it('converts an mp4 the shell handed over as a document, as it does any video', async () => {
        runSequence();
        const { result, unmount } = renderHook(useShell);
        const clip = shellFile('clip.mp4', 'application/octet-stream', { kind: 'file' });

        await act(() => result.current.sendImages([clip]));

        expect(prepareVideo).toHaveBeenCalledWith(clip);
        unmount();
    });

    it('routes a shell file to the shell sender and a page file to the page sender', async () => {
        runSequence();
        const { result, unmount } = renderHook(useShell);
        await act(() => result.current.sendImages([shellFile('a.pdf', 'application/pdf')]));
        const ports = mockSendImageMessage.mock.calls[0][1];
        const doc = shellFile('a.pdf', 'application/pdf');
        const page = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
        putShellFile.mockResolvedValue({ kind: 'responded', httpStatus: 200 });
        put.mockResolvedValue({ kind: 'responded', httpStatus: 200 });

        await ports.put({ url: 'u', headers: {} }, doc, 'slot-0/original');
        await ports.put({ url: 'u', headers: {} }, page, 'slot-1/original');

        expect(putShellFile).toHaveBeenCalledWith({ url: 'u', headers: {} }, doc, 'slot-0/original');
        expect(put).toHaveBeenCalledTimes(1);
        expect(put).toHaveBeenCalledWith({ url: 'u', headers: {} }, page, 'slot-1/original');
        unmount();
    });

    it('fails a shell file that reaches a shell with no shell sender, without handing it to the page sender', async () => {
        runSequence();
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'c', channelId: 'ch-1', put }));
        await act(() => result.current.sendImages([shellFile('a.pdf', 'application/pdf')]));
        const ports = mockSendImageMessage.mock.calls[0][1];

        const answer = await ports.put(
            { url: 'u', headers: {} },
            shellFile('a.pdf', 'application/pdf'),
            'slot-0/original'
        );

        expect(answer).toEqual({ kind: 'no-response', reason: 'system' });
        expect(put).not.toHaveBeenCalled();
        unmount();
    });

    it('converts a shell video before the sequence, sends what it made, and shows its poster meanwhile', async () => {
        const order: string[] = [];
        prepareVideo.mockImplementation(async source => {
            order.push('convert');
            return exported(source);
        });
        chat.createPendingImageChat.mockImplementation(async ({ pendingId }: { pendingId?: string }) => {
            order.push(pendingId ? 'rewrite' : 'create');
            return pendingId ?? `row-${++rowSeq}`;
        });
        runSequence();
        const { result, unmount } = renderHook(useShell);
        const video = mov();

        await act(() => result.current.sendImages([video]));

        expect(order).toEqual(['create', 'convert', 'rewrite']);
        // Drawn as the mp4 it will be, with no preview the page could not read.
        expect(chat.createPendingImageChat.mock.calls[0][0]).toMatchObject({
            localThumbUrls: [''],
            localFiles: [{ name: 'IMG_0001.mp4', contentType: 'video/mp4', size: 170_000_000 }],
        });
        expect(chat.createPendingImageChat.mock.calls[1][0].localThumbUrls).toEqual([expect.stringMatching(/^blob:/)]);
        const made = exported(video);
        expect(prepared).toEqual([
            {
                original: { file: made.file, width: 1920, height: 1080 },
                thumbnail: { file: made.poster?.file, width: 400, height: 225 },
            },
        ]);
        unmount();
    });

    it('leaves a video the shell refused out of the message, says why, and offers only delete for it', async () => {
        prepareVideo.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'TOO_LARGE' }));
        runSequence();
        const { result, unmount } = renderHook(useShell);
        const photo = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
        (prepareChatAttachment as jest.Mock).mockImplementation(async (file: File) => ({
            original: { file },
            thumbnail: null,
        }));
        const video = mov();

        await act(() => result.current.sendImages([video, photo]));

        expect(onVideoRefused).toHaveBeenCalledWith('too-large');
        expect(mockSendImageMessage.mock.calls[0][0]).toEqual([photo]);
        const leftover = await chat.createPendingImageChat.mock.results[1].value;
        expect(chat.createPendingImageChat.mock.calls[1][0].localFiles).toEqual([
            { name: 'IMG_0001.mp4', contentType: 'video/mp4', size: 170_000_000 },
        ]);
        expect(chat.failPendingImageChat).toHaveBeenCalledWith(leftover);
        // Converting it again would be refused the same way.
        expect(result.current.canRetry(leftover)).toBe(false);
        unmount();
    });

    // Sent one per file, the refused video fails its own row rather than splitting off a leftover row.
    it('fails a refused video on its own row when each file goes alone, and still sends the next file', async () => {
        prepareVideo.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'TOO_LARGE' }));
        runSequence();
        const { result, unmount } = renderHook(useShell);
        const photo = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
        (prepareChatAttachment as jest.Mock).mockImplementation(async (file: File) => ({
            original: { file },
            thumbnail: null,
        }));

        await act(() => result.current.sendImages([mov(), photo], { separately: true }));

        const [videoRow, photoRow] = await Promise.all(chat.createPendingImageChat.mock.results.map(r => r.value));
        expect(chat.createPendingImageChat).toHaveBeenCalledTimes(2);
        expect(onVideoRefused).toHaveBeenCalledWith('too-large');
        expect(chat.failPendingImageChat.mock.calls).toEqual([[videoRow]]);
        expect(result.current.canRetry(videoRow)).toBe(false);
        expect(mockSendImageMessage).toHaveBeenCalledTimes(1);
        expect(mockSendImageMessage.mock.calls[0][0]).toEqual([photo]);
        expect(result.current.canRetry(photoRow)).toBe(false);
        unmount();
    });

    it('keeps a video whose conversion failed in passing to retry on its own', async () => {
        prepareVideo.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'SYSTEM' }));
        runSequence();
        const { result, unmount } = renderHook(useShell);
        const photo = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
        (prepareChatAttachment as jest.Mock).mockImplementation(async (file: File) => ({
            original: { file },
            thumbnail: null,
        }));
        const video = mov();

        await act(() => result.current.sendImages([video, photo]));

        expect(onVideoRefused).not.toHaveBeenCalled();
        const leftover = await chat.createPendingImageChat.mock.results[1].value;
        expect(result.current.canRetry(leftover)).toBe(true);

        await act(async () => void (await result.current.retry(leftover)));
        expect(prepareVideo).toHaveBeenLastCalledWith(video);
        unmount();
    });

    it('judges the converted file again and fails a video the estimate let through over the limit', async () => {
        prepareVideo.mockImplementation(async source => exported(source, 300 * 1024 * 1024 + 1));
        runSequence();
        const { result, unmount } = renderHook(useShell);

        await act(() => result.current.sendImages([mov()]));

        expect(onVideoRefused).toHaveBeenCalledWith('too-large');
        expect(mockSendImageMessage).not.toHaveBeenCalled();
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;
        expect(chat.failPendingImageChat).toHaveBeenCalledWith(pendingId);
        expect(result.current.canRetry(pendingId)).toBe(false);
        unmount();
    });

    it('offers only delete for a video the shell no longer has', async () => {
        prepareVideo.mockRejectedValue(Object.assign(new Error('x'), { code: 'SOURCE' }));
        runSequence();
        const { result, unmount } = renderHook(useShell);

        await act(() => result.current.sendImages([mov()]));

        const pendingId = await chat.createPendingImageChat.mock.results[0].value;
        expect(chat.failPendingImageChat).toHaveBeenCalledWith(pendingId);
        expect(onVideoRefused).not.toHaveBeenCalled();
        expect(result.current.canRetry(pendingId)).toBe(false);
        unmount();
    });

    it('splits a left-out shell file the shell has lost into a row of its own that can only be deleted', async () => {
        const lostDoc = shellFile('lost.pdf', 'application/pdf');
        const flaky = new File(['b'], 'b.pdf', { type: 'application/pdf' });
        mockSendImageMessage.mockImplementation(
            async (picked: ChatAttachmentSource[], ports: { put: (...args: unknown[]) => Promise<unknown> }) => {
                putShellFile.mockResolvedValueOnce({ kind: 'no-response', reason: 'source' });
                await ports.put({ url: 'u', headers: {} }, picked[1], 'slot-1/original');
                return { status: 'sent', uploadIds: ['up-0'], failedIndexes: [1, 2] } satisfies SendImageResult;
            }
        );
        const { result, unmount } = renderHook(useShell);

        await act(() =>
            result.current.sendImages([new File(['a'], 'a.pdf', { type: 'application/pdf' }), lostDoc, flaky])
        );

        const [, retryable, deleteOnly] = await Promise.all(chat.createPendingImageChat.mock.results.map(r => r.value));
        expect(chat.createPendingImageChat.mock.calls[1][0].localFiles).toEqual([
            { name: 'b.pdf', contentType: 'application/pdf', size: 1 },
        ]);
        expect(chat.createPendingImageChat.mock.calls[2][0].localFiles).toEqual([
            { name: 'lost.pdf', contentType: 'application/pdf', size: 1000 },
        ]);
        expect(result.current.canRetry(retryable)).toBe(true);
        expect(result.current.canRetry(deleteOnly)).toBe(false);
        unmount();
    });

    it('gives a page video no preview, which would draw as a broken image', async () => {
        runSequence();
        const { result, unmount } = renderHook(useShell);

        await act(() => result.current.sendImages([new File(['v'], 'clip.mp4', { type: 'video/mp4' })]));

        expect(chat.createPendingImageChat.mock.calls[0][0].localThumbUrls).toEqual(['']);
        unmount();
    });

    it('sends a page video with the poster the browser drew, and shows the poster once it is made', async () => {
        const poster = new File(['jpeg'], 'clip-poster.jpg', { type: 'image/jpeg' });
        (makeVideoPoster as jest.Mock).mockResolvedValue({ file: poster, width: 400, height: 225 });
        runSequence();
        const { result, unmount } = renderHook(useShell);
        const video = new File(['v'], 'clip.mp4', { type: 'video/mp4' });

        await act(() => result.current.sendImages([video]));

        expect(makeVideoPoster).toHaveBeenCalledWith(video);
        expect(prepared).toEqual([
            {
                original: { file: video, width: 0, height: 0 },
                thumbnail: { file: poster, width: 400, height: 225 },
            },
        ]);
        // Grey while the frame is drawn, then the poster.
        expect(chat.createPendingImageChat.mock.calls[0][0].localThumbUrls).toEqual(['']);
        expect(chat.createPendingImageChat.mock.calls[1][0]).toMatchObject({
            localThumbUrls: [expect.stringMatching(/^blob:/)],
            pendingId: expect.any(String),
        });
        unmount();
    });

    it('sends a page video without a poster when the browser cannot draw one', async () => {
        runSequence();
        const { result, unmount } = renderHook(useShell);
        const video = new File(['v'], 'clip.mp4', { type: 'video/mp4' });

        await act(() => result.current.sendImages([video]));

        expect(prepared).toEqual([{ original: { file: video, width: 0, height: 0 }, thumbnail: null }]);
        expect(mockSendImageMessage).toHaveBeenCalledTimes(1);
        // Nothing to switch to, so the row is written once.
        expect(chat.createPendingImageChat).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('never draws a poster for a shell video, whose poster the shell makes', async () => {
        prepareVideo.mockImplementation(async source => exported(source));
        runSequence();
        const { result, unmount } = renderHook(useShell);

        await act(() => result.current.sendImages([mov()]));

        expect(prepareVideo).toHaveBeenCalledTimes(1);
        expect(makeVideoPoster).not.toHaveBeenCalled();
        unmount();
    });

    it('draws no poster for a document', async () => {
        runSequence();
        const { result, unmount } = renderHook(useShell);

        await act(() => result.current.sendImages([new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })]));

        expect(makeVideoPoster).not.toHaveBeenCalled();
        expect(prepared).toEqual([expect.objectContaining({ thumbnail: null })]);
        unmount();
    });
});
