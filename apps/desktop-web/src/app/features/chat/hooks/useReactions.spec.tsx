import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook, waitFor } from '@testing-library/react';

const setReaction = vi.fn();

vi.mock('@chatic/runtime-react', async () =>
    (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({
        data: {
            useRuntimeRepositories: () => ({ chat: { setReaction } }),
        },
    })
);

import { useReactions } from './useReactions';

const wrapper = ({ children }: { children: ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useReactions', () => {
    beforeEach(() => {
        setReaction.mockReset().mockResolvedValue(undefined);
    });

    it('sends the opposite of what I am already reacting with', async () => {
        const { result } = renderHook(() => useReactions(), { wrapper });

        act(() => result.current.toggleReaction('C1:4', '👍', false));
        await waitFor(() => expect(setReaction).toHaveBeenCalledWith({ chatId: 'C1:4', emoji: '👍', action: 'on' }));

        act(() => result.current.toggleReaction('C1:4', '👍', true));
        await waitFor(() => expect(setReaction).toHaveBeenCalledWith({ chatId: 'C1:4', emoji: '👍', action: 'off' }));
    });

    it('reports nothing while the toggle is succeeding', async () => {
        const { result } = renderHook(() => useReactions(), { wrapper });

        act(() => result.current.toggleReaction('C1:4', '👍', false));
        await waitFor(() => expect(setReaction).toHaveBeenCalled());

        expect(result.current.failedId).toBeNull();
    });

    it('names the message whose toggle was rejected', async () => {
        setReaction.mockRejectedValue(new Error('@action[reaction] is not supported'));
        const { result } = renderHook(() => useReactions(), { wrapper });

        act(() => result.current.toggleReaction('C1:4', '👍', false));

        await waitFor(() => expect(result.current.failedId).toBe('C1:4'));
    });

    it('clears the previous failure when a new toggle starts', async () => {
        setReaction.mockRejectedValue(new Error('nope'));
        const { result } = renderHook(() => useReactions(), { wrapper });

        act(() => result.current.toggleReaction('C1:4', '👍', false));
        await waitFor(() => expect(result.current.failedId).toBe('C1:4'));

        setReaction.mockResolvedValue(undefined);
        act(() => result.current.toggleReaction('C1:9', '🎉', false));

        await waitFor(() => expect(result.current.failedId).toBeNull());
    });
});
