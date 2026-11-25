import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DomainChannel, DomainChat } from '@chatic/runtime-react';

import { useMessageSearch } from './useMessageSearch';

const cached: DomainChat[] = [
    { id: 'top', chatNo: 1, content: 'budget review' } as DomainChat,
    { id: 'reply', chatNo: 2, parentId: '1', content: 'budget numbers' } as DomainChat,
    { id: 'gone', chatNo: 3, hidden: true, content: 'budget draft' } as DomainChat,
    { id: 'react', chatNo: 4, subType: 'reaction', content: 'budget' } as DomainChat,
];

const repositories = {
    chat: { cacheReadList: vi.fn(async (): Promise<{ list: DomainChat[] }> => ({ list: cached })) },
};

vi.mock('@chatic/runtime-react', async () =>
    (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({
        data: { useRuntimeRepositories: () => repositories },
    })
);

const channels = [{ id: 'C1', name: 'general' } as DomainChannel];

describe('useMessageSearch', () => {
    it('returns messages and thread replies, never deleted rows or reaction events', async () => {
        const { result } = renderHook(() => useMessageSearch('budget', channels));

        await waitFor(() => expect(result.current.results).toHaveLength(1));
        expect(result.current.results[0]?.matches.map(chat => chat.id)).toEqual(['reply', 'top']);
        expect(result.current.results[0]?.matchCount).toBe(2);
    });

    it('counts every cached row it read, matching or not', async () => {
        const { result } = renderHook(() => useMessageSearch('nothing like this', channels));

        await waitFor(() => expect(result.current.scannedCount).toBe(cached.length));
        expect(result.current.results).toEqual([]);
    });

    it('reports zero read when the device has nothing loaded', async () => {
        repositories.chat.cacheReadList.mockResolvedValueOnce({ list: [] });
        const { result } = renderHook(() => useMessageSearch('budget', channels));

        await waitFor(() => expect(result.current.scannedCount).toBe(0));
    });

    it('counts failed channels apart from scanned rows', async () => {
        repositories.chat.cacheReadList.mockRejectedValueOnce(new Error('locked'));
        const { result } = renderHook(() => useMessageSearch('nothing like this', channels));

        await waitFor(() => expect(result.current.isSearching).toBe(false));
        expect(result.current.results).toEqual([]);
        expect(result.current.scannedCount).toBe(0);
        expect(result.current.failedCount).toBe(1);
    });

    it('reports no failures when every channel reads', async () => {
        const { result } = renderHook(() => useMessageSearch('nothing like this', channels));

        await waitFor(() => expect(result.current.isSearching).toBe(false));
        expect(result.current.failedCount).toBe(0);
    });
});
