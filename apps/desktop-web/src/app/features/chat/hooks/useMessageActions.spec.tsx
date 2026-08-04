import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook, waitFor } from '@testing-library/react';

const updateChat = vi.fn();
const deleteChat = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: () => ({ chat: { updateChat, deleteChat } }),
}));

import { useMessageActions } from './useMessageActions';

const wrapper = ({ children }: { children: ReactNode }) => {
    // Without this a rejected write would retry for seconds before surfacing.
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useMessageActions', () => {
    beforeEach(() => {
        updateChat.mockReset().mockResolvedValue(undefined);
        deleteChat.mockReset().mockResolvedValue(undefined);
    });

    it('sends only the new content, addressed by the server id', async () => {
        const { result } = renderHook(() => useMessageActions(), { wrapper });
        act(() => result.current.editMessage('C1:4', 'fixed'));

        await waitFor(() => expect(updateChat).toHaveBeenCalledWith({ id: 'C1:4', content: 'fixed' }));
    });

    it('deletes by id', async () => {
        const { result } = renderHook(() => useMessageActions(), { wrapper });
        act(() => result.current.deleteMessage('C1:4'));

        await waitFor(() => expect(deleteChat).toHaveBeenCalledWith({ id: 'C1:4' }));
    });

    // The hook is shared by every message in an author block, so a failure has to name
    // its row or the error would appear under whichever message was acted on last.
    it('attributes a failure to the message that caused it', async () => {
        deleteChat.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useMessageActions(), { wrapper });

        act(() => result.current.deleteMessage('C1:7'));
        await waitFor(() => expect(result.current.failure?.id).toBe('C1:7'));
    });

    // The row prints a different sentence for each: "couldn't save that change" is the
    // wrong thing to say about a delete that did not go through.
    it('says which of the two operations failed', async () => {
        deleteChat.mockRejectedValue(new Error('offline'));
        updateChat.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useMessageActions(), { wrapper });

        act(() => result.current.deleteMessage('C1:7'));
        await waitFor(() => expect(result.current.failure?.kind).toBe('delete'));

        act(() => result.current.editMessage('C1:7', 'next'));
        await waitFor(() => expect(result.current.failure?.kind).toBe('edit'));
    });

    it('clears the previous failure when another message is acted on', async () => {
        deleteChat.mockRejectedValueOnce(new Error('offline'));
        const { result } = renderHook(() => useMessageActions(), { wrapper });

        act(() => result.current.deleteMessage('C1:7'));
        await waitFor(() => expect(result.current.failure?.id).toBe('C1:7'));

        await act(async () => result.current.editMessage('C1:8', 'next'));
        await waitFor(() => expect(result.current.failure).toBeNull());
    });
});
