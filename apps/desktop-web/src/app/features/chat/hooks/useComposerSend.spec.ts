import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

const sendImages = vi.fn();
const useSendImages = vi.fn((_input: unknown) => ({ sendImages, retry: vi.fn(), canRetry: vi.fn(), discard: vi.fn() }));
vi.mock('@chatic/app-runtime', () => ({
    runtime: { data: { useSendImages: (input: unknown) => useSendImages(input) } },
}));

const sendMessage = vi.fn();
vi.mock('../../../shared/hooks/useChatMutations', () => ({
    useChatMutations: () => ({ sendMessage, retryMessage: vi.fn(), discardMessage: vi.fn() }),
}));

const toast = vi.fn();
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => toast(arg) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { xhrPut } from '@chatic/data';

import { useComposerSend } from './useComposerSend';

const picked = () => [new File(['a'], 'a.png', { type: 'image/png' })];

beforeEach(() => {
    vi.clearAllMocks();
    sendMessage.mockResolvedValue({});
    sendImages.mockResolvedValue(undefined);
});

describe('useComposerSend', () => {
    it("binds the runtime's image send to the room's cloud and the page's own PUT", () => {
        renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' }));

        expect(useSendImages).toHaveBeenCalledWith({
            cid: 'cloud-a',
            channelId: 'ch-1',
            parentId: 'root-1',
            put: xhrPut,
        });
    });

    it('sends text alone the way it always did', () => {
        const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));

        act(() => result.current.send('hello', []));

        expect(sendImages).not.toHaveBeenCalled();
        expect(sendMessage).toHaveBeenCalledWith('cloud-a', { channelId: 'ch-1', content: 'hello' });
    });

    it('sends pictures alone as one image message and no text', async () => {
        const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));
        const files = picked();

        await act(async () => result.current.send('', files));

        expect(sendImages).toHaveBeenCalledWith(files);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('sends the text at the press, before the pictures, so it reads above them', () => {
        const order: string[] = [];
        sendMessage.mockImplementation(async () => void order.push('text'));
        sendImages.mockImplementation(async () => void order.push('images'));
        const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' }));
        const files = picked();

        act(() => result.current.send('caption', files));

        expect(order).toEqual(['text', 'images']);
        expect(sendMessage).toHaveBeenCalledWith('cloud-a', {
            channelId: 'ch-1',
            content: 'caption',
            parentId: 'root-1',
        });
        expect(sendImages).toHaveBeenCalledWith(files);
    });

    it('says the pictures failed when their row could not even be written, and leaves the text sent', async () => {
        sendImages.mockRejectedValue(new Error('cache write failed'));
        const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));

        await act(async () => result.current.send('caption', picked()));

        expect(toast).toHaveBeenCalledWith({ variant: 'destructive', description: 'toast.messageFailed' });
        expect(sendMessage).toHaveBeenCalledTimes(1);
    });

    it('says so when the text send fails', async () => {
        sendMessage.mockRejectedValue(new Error('socket'));
        const { result } = renderHook(() => useComposerSend({ cid: 'cloud-a', channelId: 'ch-1' }));

        await act(async () => result.current.send('hello', []));

        expect(toast).toHaveBeenCalledWith({ variant: 'destructive', description: 'toast.messageFailed' });
    });
});
