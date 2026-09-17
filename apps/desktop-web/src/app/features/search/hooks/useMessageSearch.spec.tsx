import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DomainChannel, DomainChat } from '@chatic/data';

import { useMessageSearch } from './useMessageSearch';

const cached: DomainChat[] = [
    { id: 'top', chatNo: 1, content: 'budget review' } as DomainChat,
    { id: 'reply', chatNo: 2, parentId: '1', content: 'budget numbers' } as DomainChat,
    { id: 'gone', chatNo: 3, hidden: true, content: 'budget draft' } as DomainChat,
    { id: 'react', chatNo: 4, subType: 'reaction', content: 'budget' } as DomainChat,
];

const repositories = {
    chat: { cacheReadList: vi.fn(async () => ({ list: cached })) },
};

vi.mock('@chatic/app-runtime', () => ({
    runtime: { data: { useRuntimeRepositories: () => repositories } },
}));

const channels = [{ id: 'C1', name: 'general' } as DomainChannel];

describe('useMessageSearch', () => {
    it('returns messages and thread replies, never deleted rows or reaction events', async () => {
        const { result } = renderHook(() => useMessageSearch('budget', channels));

        await waitFor(() => expect(result.current.results).toHaveLength(1));
        expect(result.current.results[0]?.matches.map(chat => chat.id)).toEqual(['reply', 'top']);
        expect(result.current.results[0]?.matchCount).toBe(2);
    });
});
