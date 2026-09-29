import { act, renderHook, waitFor } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChat, SendImageResult } from '@chatic/data';

import { useAppForeground } from '../../../bridge/useAppForeground';
import { syncShellTransfers } from '../../../bridge/shellUpload';
import { prepareImage } from '@chatic/shared';

import { useSendImages } from './useSendImages';

jest.mock('@chatic/app-runtime', () => ({
    runtime: { data: { getCloudRepositories: jest.fn(), runInCloud: jest.fn() } },
}));

/** The clouds whose socket is held right now, as `runInCloud` would hold them. */
const held: string[] = [];

const mockSendImageMessage = jest.fn();
jest.mock('@chatic/data', () => ({
    ...jest.requireActual('@chatic/data'),
    sendImageMessage: (...args: unknown[]) => mockSendImageMessage(...args),
}));

jest.mock('@chatic/shared', () => ({ CHAT_ATTACHMENT: {}, prepareImage: jest.fn() }));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn() } }));
jest.mock('../../../bridge/shellUpload', () => ({
    getShellPut: jest.fn(() => jest.fn()),
    syncShellTransfers: jest.fn(async () => undefined),
}));
jest.mock('../../../bridge/useAppForeground', () => ({ useAppForeground: jest.fn() }));

const chat = {
    createPendingImageChat: jest.fn(),
    sendPendingImageChat: jest.fn(),
    failPendingImageChat: jest.fn(async () => undefined),
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
    (runtime.data.getCloudRepositories as jest.Mock).mockReturnValue({ chat });
    (runtime.data.runInCloud as jest.Mock).mockImplementation(
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

const sent: SendImageResult = { status: 'sent', uploadIds: ['up-1'], failedSlots: 0 };
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
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(files()));

        expect(runtime.data.getCloudRepositories).toHaveBeenCalledWith('cloud-a');
        expect(runtime.data.runInCloud).toHaveBeenCalledWith('cloud-a', expect.any(Function));
        expect(heldDuringSend).toEqual([['cloud-a']]);
        expect(held).toEqual([]);
        unmount();
    });

    it('keeps a send addressed to the cloud it was written in when the screen moves to another cloud', async () => {
        let finish: (value: SendImageResult) => void = () => undefined;
        mockSendImageMessage.mockImplementation(() => new Promise(resolve => (finish = resolve)));
        const { result, rerender, unmount } = renderHook(props => useSendImages(props), {
            initialProps: { cid: 'cloud-a', channelId: 'ch-1' },
        });
        let sending: Promise<void> = Promise.resolve();
        act(() => {
            sending = result.current.sendImages(files());
        });
        await waitFor(() => expect(mockSendImageMessage).toHaveBeenCalled());
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;

        rerender({ cid: 'cloud-b', channelId: 'ch-1' });
        (runtime.data.getCloudRepositories as jest.Mock).mockClear();
        await act(async () => {
            finish(failed);
            await sending;
        });

        expect(runtime.data.runInCloud).toHaveBeenCalledTimes(1);
        expect(runtime.data.runInCloud).toHaveBeenCalledWith('cloud-a', expect.any(Function));
        expect(runtime.data.getCloudRepositories).toHaveBeenCalledWith('cloud-a');
        expect(chat.failPendingImageChat).toHaveBeenCalledWith(pendingId);
        unmount();
    });

    it('writes the pending row first, then runs the sequence bound to this row and this shell', async () => {
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() =>
            useSendImages({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' })
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
        await ports.send({ uploadIds: ['up-1'] });
        expect(chat.sendPendingImageChat).toHaveBeenCalledWith(await pendingId, { uploadIds: ['up-1'] });
        unmount();
    });

    it('lets the files and previews go once the message is sent', async () => {
        mockSendImageMessage.mockResolvedValue(sent);
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(files()));
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;

        expect(revoked).toHaveLength(2);
        expect(result.current.canRetry(pendingId)).toBe(false);
        expect(chat.failPendingImageChat).not.toHaveBeenCalled();
        unmount();
    });

    it('marks the row failed and keeps the files, then retries the same pictures on the same row', async () => {
        mockSendImageMessage.mockResolvedValueOnce(failed).mockResolvedValueOnce(sent);
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));
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
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));
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
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));

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

    it('gives up a retry, and the files, when the row was deleted meanwhile', async () => {
        mockSendImageMessage.mockResolvedValue(failed);
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));
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
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));
        const many = Array.from({ length: 12 }, (_, i) => new File([String(i)], `${i}.jpg`));

        await act(() => result.current.sendImages(many));

        expect(chat.createPendingImageChat.mock.calls[0][0].localThumbUrls).toHaveLength(10);
        expect(mockSendImageMessage.mock.calls[0][0]).toHaveLength(10);
        unmount();
    });

    it('refuses to retry a row whose files are not in memory', async () => {
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));

        await expect(result.current.retry('from-an-earlier-page')).resolves.toBe(false);
        expect(result.current.canRetry('from-an-earlier-page')).toBe(false);
        expect(mockSendImageMessage).not.toHaveBeenCalled();
        unmount();
    });

    it('drops a failed row’s files and previews when the channel changes', async () => {
        mockSendImageMessage.mockResolvedValue(failed);
        const { result, rerender, unmount } = renderHook(props => useSendImages(props), {
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
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));

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
        const first = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));
        let sending: Promise<void> = Promise.resolve();
        act(() => {
            sending = first.result.current.sendImages(files());
        });
        await waitFor(() => expect(mockSendImageMessage).toHaveBeenCalled());
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;
        first.unmount();

        const again = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));
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
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));

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
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));
        await act(() => result.current.sendImages(files()));
        const pendingId = await chat.createPendingImageChat.mock.results[0].value;

        act(() => result.current.discard(pendingId));

        expect(revoked).toHaveLength(2);
        expect(result.current.canRetry(pendingId)).toBe(false);
        unmount();
    });

    it('does not touch the other screen’s rows when a thread and its room share a channel', async () => {
        mockSendImageMessage.mockResolvedValue(failed);
        const room = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));
        const thread = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' }));
        await act(() => room.result.current.sendImages(files()));
        const roomRow = await chat.createPendingImageChat.mock.results[0].value;

        thread.unmount();

        expect(room.result.current.canRetry(roomRow)).toBe(true);
        room.unmount();
    });

    describe('leftover rows', () => {
        it('fails every older sending image row this page has no files for, and nothing else', async () => {
            mockSendImageMessage.mockResolvedValue(failed);
            const live = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));
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

            const other = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' }));

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

        it('catches up with the shell on attach and whenever the app comes back to the front', async () => {
            const { unmount } = renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));
            await waitFor(() => expect(syncShellTransfers).toHaveBeenCalledTimes(1));

            const onForeground = (useAppForeground as jest.Mock).mock.calls.at(-1)?.[0] as () => void;
            onForeground();

            expect(syncShellTransfers).toHaveBeenCalledTimes(2);
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

    // A phone photo is several megapixels; the feed must not decode ten of them for small tiles.
    it('switches the row to the thumbnails once every image is prepared, before the upload starts', async () => {
        (prepareImage as jest.Mock).mockImplementation(async (file: File) => ({
            original: { file },
            thumbnail: { file: thumb(file.name) },
        }));
        runSequence();
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'c', channelId: 'ch-1' }));

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
        (prepareImage as jest.Mock).mockImplementation(async (file: File) => ({
            original: { file },
            thumbnail: file.name === 'a.jpg' ? { file: thumb('a') } : null,
        }));
        runSequence();
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(files()));

        const [first, second] = chat.createPendingImageChat.mock.calls.map(call => call[0]);
        expect(second.localThumbUrls[0]).not.toBe(first.localThumbUrls[0]);
        expect(second.localThumbUrls[1]).toBe(first.localThumbUrls[1]);
        unmount();
    });

    it('does not rewrite the row when no image has a thumbnail', async () => {
        (prepareImage as jest.Mock).mockImplementation(async (file: File) => ({ original: { file }, thumbnail: null }));
        runSequence();
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(files()));

        expect(order).toEqual(['create', 'start']);
        unmount();
    });

    it('does not switch again on a retry, since the row already shows the thumbnails', async () => {
        (prepareImage as jest.Mock).mockImplementation(async (file: File) => ({
            original: { file },
            thumbnail: { file: thumb(file.name) },
        }));
        runSequence(failed);
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'c', channelId: 'ch-1' }));
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
        (prepareImage as jest.Mock).mockImplementation(async (file: File) => ({
            original: { file },
            thumbnail: { file: thumb(file.name) },
        }));
        runSequence();
        chat.createPendingImageChat.mockImplementation(async ({ pendingId }: { pendingId?: string }) => {
            if (pendingId) throw new Error('gone');
            return `row-${++rowSeq}`;
        });
        const created = urlSeq;
        const { result, unmount } = renderHook(() => useSendImages({ cid: 'c', channelId: 'ch-1' }));

        await act(() => result.current.sendImages(files()));

        // Two originals, then two thumbnails; the thumbnails were never shown and are revoked.
        expect(revoked).toEqual(expect.arrayContaining([`blob:${created + 3}`, `blob:${created + 4}`]));
        unmount();
    });
});
