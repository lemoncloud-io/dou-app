import { renderHook, waitFor } from '@testing-library/react';

import { useChatMessage } from './useChatMessage';

const mockCacheRead = jest.fn();
const mockGetChat = jest.fn();
jest.mock('@chatic/app-runtime', () => {
    // One graph object, as the runtime hands out.
    let graph: unknown;
    const roomGraph = () => (graph ??= { chat: { cacheRead: mockCacheRead } });
    return {
        runtime: {
            data: {
                useRuntimeRepositories: roomGraph,
                getCloudRepositories: () => ({ chat: { getChat: mockGetChat } }),
            },
        },
    };
});

describe('useChatMessage', () => {
    beforeEach(() => {
        mockCacheRead.mockReset();
        mockGetChat.mockReset();
    });

    it('shows the cached row at once, then the server’s copy', async () => {
        let answer: (value: unknown) => void = () => undefined;
        mockCacheRead.mockResolvedValue({ id: 'ch:7', content: 'cached' });
        mockGetChat.mockReturnValue(new Promise(resolve => (answer = resolve)));

        const { result } = renderHook(() => useChatMessage('c1', 'ch', 7));
        await waitFor(() => expect(result.current.chat).toMatchObject({ content: 'cached' }));
        expect(result.current.loading).toBe(true);
        expect(mockCacheRead).toHaveBeenCalledWith('ch:7');

        answer({ id: 'ch:7', content: 'fresh' });
        await waitFor(() => expect(result.current.chat).toMatchObject({ content: 'fresh' }));
        expect(result.current.loading).toBe(false);
    });

    it('keeps the cached row when the server cannot be reached', async () => {
        mockCacheRead.mockResolvedValue({ id: 'ch:7', content: 'cached' });
        mockGetChat.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useChatMessage('c1', 'ch', 7));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.chat).toMatchObject({ content: 'cached' });
    });

    it('reads nothing without a room or a message number', async () => {
        const { result } = renderHook(() => useChatMessage('c1', 'ch', Number.NaN));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.chat).toBeNull();
        expect(mockCacheRead).not.toHaveBeenCalled();
    });
});
