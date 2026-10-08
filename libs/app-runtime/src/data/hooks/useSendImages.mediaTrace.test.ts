import { act, renderHook } from '@testing-library/react';

import type { ChatAttachmentSource, SendImagePorts, SendImageResult } from '@chatic/data';
import { configurePerfTraces, resetPerfTraces } from '@chatic/perf';

import { getCloudRepositories, runInCloud } from '../cloudChat';
import { useSendImages } from './useSendImages';

// Its own file, so the tracer's per-minute cap starts empty: the main suite's sends would use it up.
jest.mock('../cloudChat', () => ({ getCloudRepositories: jest.fn(), runInCloud: jest.fn() }));

const mockSendImageMessage = jest.fn();
jest.mock('@chatic/data', () => ({
    ...jest.requireActual('@chatic/data'),
    sendImageMessage: (...args: unknown[]) => mockSendImageMessage(...args),
}));
jest.mock('@chatic/shared', () => ({ prepareChatAttachment: jest.fn(), makeVideoPoster: jest.fn() }));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn() } }));

const chat = {
    createPendingImageChat: jest.fn(async ({ pendingId }: { pendingId?: string }) => pendingId ?? 'row-1'),
    sendPendingImageChat: jest.fn(async () => ({ id: 'ch-1:9' })),
    failPendingImageChat: jest.fn(async () => undefined),
    listPendingImageChats: jest.fn(async () => []),
    startUploads: jest.fn(async () => ({ tickets: [] })),
    completeUploads: jest.fn(async () => ({ results: [] })),
};

const backend = { start: jest.fn(), stop: jest.fn() };
const sent: SendImageResult = { status: 'sent', uploadIds: ['up-1'], failedIndexes: [] };
const failed: SendImageResult = { status: 'failed', reason: 'socket', error: new Error('x') };

/** Runs the ports the way the real sequence does: start, the transfer, complete, send. */
const throughPorts =
    (result: SendImageResult) => async (_files: unknown, ports: SendImagePorts<ChatAttachmentSource>) => {
        await ports.start({ channelId: 'ch-1', uploads: [] } as never);
        await ports.complete({ uploads: [] } as never);
        if (result.status === 'sent') await ports.send({ uploadIds: result.uploadIds } as never);
        return result;
    };

const recorded = () => backend.stop.mock.calls.map(([record]) => record).filter(r => r.name === 'chat_send_media');

beforeAll(() => {
    URL.createObjectURL = jest.fn(() => 'blob:1');
    URL.revokeObjectURL = jest.fn();
});

beforeEach(() => {
    jest.clearAllMocks();
    configurePerfTraces(backend);
    (getCloudRepositories as jest.Mock).mockReturnValue({ chat });
    (runInCloud as jest.Mock).mockImplementation(async (_cid: string, work: (r: { chat: typeof chat }) => unknown) =>
        work({ chat })
    );
});

afterEach(() => resetPerfTraces());

describe('useSendImages — chat_send_media', () => {
    it('records a sent message with each phase it passed, in order', async () => {
        mockSendImageMessage.mockImplementation(throughPorts(sent));
        const { result, unmount } = renderHook(() =>
            useSendImages({ cid: 'cloud-a', channelId: 'ch-1', put: jest.fn() })
        );

        await act(() => result.current.sendImages([new File(['a'], 'a.jpg', { type: 'image/jpeg' })]));

        const [sample] = recorded();
        expect(sample.attributes).toEqual({ kind: 'image', count: '1', size: '<1mb', thread: 'root', outcome: 'ok' });
        const { row_ms, upload_started_ms, bytes_sent_ms, upload_completed_ms, sent_ms, value_ms } = sample.metrics;
        expect([row_ms, upload_started_ms, bytes_sent_ms, upload_completed_ms, sent_ms].every(Number.isFinite)).toBe(
            true
        );
        expect(row_ms).toBeLessThanOrEqual(upload_started_ms);
        expect(upload_completed_ms).toBeLessThanOrEqual(sent_ms);
        expect(sent_ms).toBeLessThanOrEqual(value_ms);
        expect(sample.metrics.retry).toBe(0);
        unmount();
    });

    it('records a failed send as an error, and its retry as a retry', async () => {
        mockSendImageMessage.mockImplementationOnce(throughPorts(failed)).mockImplementationOnce(throughPorts(sent));
        const { result, unmount } = renderHook(() =>
            useSendImages({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'ch-1:3', put: jest.fn() })
        );

        await act(() => result.current.sendImages([new File(['v'], 'v.mp4', { type: 'video/mp4' })]));
        await act(async () => {
            await result.current.retry('row-1');
        });

        const [first, retried] = recorded();
        expect(first.attributes).toMatchObject({ kind: 'video', thread: 'reply', outcome: 'error' });
        expect(first.metrics).not.toHaveProperty('sent_ms');
        expect(retried.attributes).toMatchObject({ outcome: 'ok' });
        expect(retried.metrics.retry).toBe(1);
        unmount();
    });

    it('records an error when the cloud could not be held for the upload', async () => {
        (runInCloud as jest.Mock).mockRejectedValueOnce(new Error('no cloud slot bound'));
        const { result, unmount } = renderHook(() =>
            useSendImages({ cid: 'cloud-a', channelId: 'ch-1', put: jest.fn() })
        );

        await act(() =>
            result.current.sendImages([new File(['a'], 'a.jpg', { type: 'image/jpeg' })]).catch(() => undefined)
        );

        expect(recorded()[0].attributes).toMatchObject({ outcome: 'error' });
        unmount();
    });

    it('records an error when the pending row could not be written', async () => {
        chat.createPendingImageChat.mockRejectedValueOnce(new Error('bridge timeout'));
        const { result, unmount } = renderHook(() =>
            useSendImages({ cid: 'cloud-a', channelId: 'ch-1', put: jest.fn() })
        );

        await expect(
            result.current.sendImages([new File(['a'], 'a.pdf', { type: 'application/pdf' })])
        ).rejects.toThrow();

        expect(recorded()[0].attributes).toMatchObject({ kind: 'file', outcome: 'error' });
        expect(mockSendImageMessage).not.toHaveBeenCalled();
        unmount();
    });
});
