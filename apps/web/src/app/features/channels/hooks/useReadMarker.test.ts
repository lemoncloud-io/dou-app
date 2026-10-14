import { act, renderHook } from '@testing-library/react';

import { readMarkRegistry } from '../../../runtime/logging/readMarkRegistry';
import { useReadMarker } from './useReadMarker';

jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));

const markRead = jest.fn();

const setup = (overrides: Partial<Parameters<typeof useReadMarker>[0]> = {}) =>
    renderHook(props => useReadMarker(props), {
        initialProps: {
            cid: 'cloud-a',
            channelId: 'c1',
            channelChatNo: undefined as number | undefined,
            lastChatNo: undefined as number | undefined,
            markRead,
            ...overrides,
        },
    });

const flushPromises = () => act(async () => undefined);

beforeEach(() => {
    jest.clearAllMocks();
    readMarkRegistry.reset();
    markRead.mockResolvedValue(undefined);
});

describe('useReadMarker', () => {
    it('marks channel.chatNo on entry, in the room’s own cloud', () => {
        setup({ channelChatNo: 10 });
        expect(markRead).toHaveBeenCalledWith('cloud-a', { channelId: 'c1', chatNo: 10 });
    });

    it('corrects upward to lastChatNo once messages load', () => {
        setup({ lastChatNo: 20 });
        expect(markRead).toHaveBeenCalledWith('cloud-a', { channelId: 'c1', chatNo: 20 });
    });

    it('does not hand over a chatNo at or below one already marked in this room', () => {
        // After reading up to 10 on entry, a lower lastChatNo (5) is ignored.
        setup({ channelChatNo: 10, lastChatNo: 5 });
        expect(markRead).toHaveBeenCalledTimes(1);
        expect(markRead).toHaveBeenCalledWith('cloud-a', { channelId: 'c1', chatNo: 10 });
    });

    it('marks the next room even when its head is below the last room’s', () => {
        // The route keeps the page mounted from one room to the next.
        const { rerender } = setup({ channelChatNo: 50 });

        rerender({ cid: 'cloud-a', channelId: 'c2', channelChatNo: 7, lastChatNo: undefined, markRead });

        expect(markRead).toHaveBeenLastCalledWith('cloud-a', { channelId: 'c2', chatNo: 7 });
    });

    it('does not mark while the page is hidden, and marks on coming back', () => {
        const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        setup({ lastChatNo: 20 });
        expect(markRead).not.toHaveBeenCalled();

        visibility.mockReturnValue('visible');
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(markRead).toHaveBeenCalledWith('cloud-a', { channelId: 'c1', chatNo: 20 });
        visibility.mockRestore();
    });

    it('markSent marks a just-sent message read', () => {
        const { result } = setup();
        act(() => result.current.markSent(7));
        expect(markRead).toHaveBeenCalledWith('cloud-a', { channelId: 'c1', chatNo: 7 });
    });

    it('records the read for the divergence check only once the server accepted it', async () => {
        let accept: () => void = () => undefined;
        markRead.mockReturnValue(new Promise<void>(resolve => (accept = resolve)));
        setup({ channelChatNo: 10 });
        await flushPromises();
        expect(readMarkRegistry.markOf('c1')).toBeUndefined();

        accept();
        await flushPromises();

        expect(readMarkRegistry.markOf('c1')).toBe(10);
    });
});
