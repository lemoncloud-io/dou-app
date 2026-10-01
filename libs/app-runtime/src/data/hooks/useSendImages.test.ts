import { act, renderHook, waitFor } from '@testing-library/react';

import type { ChatAttachmentSource, DomainChat, SendImageResult, ShellFileRef } from '@chatic/data';

import { prepareChatAttachment } from '@chatic/shared';

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

jest.mock('@chatic/shared', () => ({ prepareChatAttachment: jest.fn() }));
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

    it('leaves a video the shell refused out of the message, says why, and keeps it to retry on its own', async () => {
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
        expect(result.current.canRetry(pendingId)).toBe(true);
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
});
