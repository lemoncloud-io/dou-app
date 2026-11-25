import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

const sendImages = vi.fn();
const retryImages = vi.fn();
const canRetryImages = vi.fn();
const discardImages = vi.fn();
const filesPut = vi.hoisted(() => vi.fn());
const useSendImages = vi.fn((_input: unknown) => ({
    sendImages,
    retry: retryImages,
    canRetry: canRetryImages,
    discard: discardImages,
}));
vi.mock('@chatic/runtime-react', async () =>
    (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({
        data: { useSendImages: (input: unknown) => useSendImages(input) },
        files: { put: filesPut },
    })
);

const sendMessage = vi.fn();
const retryMessage = vi.fn();
const discardMessage = vi.fn();
vi.mock('../../../shared/hooks/useChatMutations', () => ({
    useChatMutations: () => ({ sendMessage, retryMessage, discardMessage }),
}));

const toast = vi.fn();
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => toast(arg) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { type DomainChat } from '@chatic/runtime-react';

import { useComposerSend } from './useComposerSend';

const picked = () => [new File(['a'], 'a.png', { type: 'image/png' })];

beforeEach(() => {
    vi.clearAllMocks();
    sendMessage.mockResolvedValue({});
    sendImages.mockResolvedValue(undefined);
});

describe('useComposerSend', () => {
    it("binds the runtime's image send to the room's cloud and the files port's PUT", () => {
        renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' }));

        expect(useSendImages).toHaveBeenCalledWith({
            cid: 'cloud-a',
            channelId: 'ch-1',
            parentId: 'root-1',
            put: filesPut,
        });
    });

    it('sends text alone the way it always did', () => {
        const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));

        act(() => result.current.send('hello', []));

        expect(sendImages).not.toHaveBeenCalled();
        expect(sendMessage).toHaveBeenCalledWith('cloud-a', { channelId: 'ch-1', content: 'hello' });
    });

    it('carries the picked mention beside the text', () => {
        const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));

        act(() => result.current.send('@Ada hello', [], { userIds: ['u-ada'] }));

        expect(sendMessage).toHaveBeenCalledWith('cloud-a', {
            channelId: 'ch-1',
            content: '@Ada hello',
            mention: { userIds: ['u-ada'] },
        });
    });

    it('carries the picked mention on a thread reply, with its parent', () => {
        const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'ch-1:7' }));

        act(() => result.current.send('@Ada hello', [], { userIds: ['u-ada'] }));

        expect(sendMessage).toHaveBeenCalledWith('cloud-a', {
            channelId: 'ch-1',
            content: '@Ada hello',
            parentId: 'ch-1:7',
            mention: { userIds: ['u-ada'] },
        });
    });

    it('sends pictures alone as one image message and no text', async () => {
        const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));
        const files = picked();

        await act(async () => result.current.send('', files));

        expect(sendImages).toHaveBeenCalledWith(files, { content: '' });
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('sends text typed with pictures as one message, the text as its caption', () => {
        const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' }));
        const files = picked();

        act(() => result.current.send('@Ada caption', files, { userIds: ['u-ada'] }));

        expect(sendMessage).not.toHaveBeenCalled();
        expect(sendImages).toHaveBeenCalledTimes(1);
        expect(sendImages).toHaveBeenCalledWith(files, {
            content: '@Ada caption',
            mention: { userIds: ['u-ada'] },
        });
    });

    it('says the message failed when its row could not even be written, and sends no text of its own', async () => {
        sendImages.mockRejectedValue(new Error('cache write failed'));
        const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));

        await act(async () => result.current.send('caption', picked()));

        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({ variant: 'destructive', title: 'toast.messageFailed' })
        );
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('says so when the text send fails', async () => {
        sendMessage.mockRejectedValue(new Error('socket'));
        const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));

        await act(async () => result.current.send('hello', []));

        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({ variant: 'destructive', title: 'toast.messageFailed' })
        );
    });

    describe('a failed message', () => {
        const textRow = { id: 'row-t', cid: 'cloud-a', channelId: 'ch-1', content: 'hi', isFailed: true } as DomainChat;
        const imageRow = {
            id: 'row-i',
            cid: 'cloud-a',
            channelId: 'ch-1',
            content: '',
            isFailed: true,
            upload$$: [{ localStatus: 'failed', localThumbUrl: 'blob:1' }],
        } as DomainChat;

        it('retries a picture message with its own pictures, on the same row', async () => {
            retryImages.mockResolvedValue(true);
            const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));

            await act(async () => result.current.retry(imageRow));

            expect(retryImages).toHaveBeenCalledWith('row-i');
            expect(retryMessage).not.toHaveBeenCalled();
        });

        it('retries a text message the way it always did', async () => {
            retryMessage.mockResolvedValue({});
            const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));

            await act(async () => result.current.retry(textRow));

            expect(retryMessage).toHaveBeenCalledWith(textRow);
            expect(retryImages).not.toHaveBeenCalled();
        });

        it('stays quiet when a retry finds the pictures already sending again', async () => {
            canRetryImages.mockReturnValue(true);
            retryImages.mockResolvedValue(false);
            const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));

            await act(async () => result.current.retry(imageRow));

            expect(toast).not.toHaveBeenCalled();
        });

        it('says so when a picture message can no longer be retried', async () => {
            canRetryImages.mockReturnValue(false);
            retryImages.mockResolvedValue(false);
            const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));

            await act(async () => result.current.retry(imageRow));

            expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
        });

        it('offers Retry on a picture message only while its pictures are still in memory', () => {
            canRetryImages.mockReturnValue(false);
            const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));

            expect(result.current.canRetry(imageRow)).toBe(false);
            expect(canRetryImages).toHaveBeenCalledWith('row-i');
            expect(result.current.canRetry(textRow)).toBe(true);
        });

        it('lets a picture message’s files go and deletes its row', async () => {
            discardMessage.mockResolvedValue(undefined);
            const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));

            await act(async () => result.current.discard(imageRow));

            expect(discardImages).toHaveBeenCalledWith('row-i');
            expect(discardMessage).toHaveBeenCalledWith(imageRow);
        });

        it('deletes a text message the way it always did', async () => {
            discardMessage.mockResolvedValue(undefined);
            const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));

            await act(async () => result.current.discard(textRow));

            expect(discardImages).not.toHaveBeenCalled();
            expect(discardMessage).toHaveBeenCalledWith(textRow);
        });
    });
});
